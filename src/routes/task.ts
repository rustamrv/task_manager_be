import express, { Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import Task from "../models/task";
import { body, validationResult } from "express-validator";
import mongoose from 'mongoose';

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  [
    body("title").notEmpty().withMessage('The "title" field is required.'),
    body("description").notEmpty().withMessage('The "description" field is required.'),
    body("dueDate").notEmpty().withMessage('The "dueDate" field is required.'),
    body("status").notEmpty().withMessage('The "status" field is required.'),
    body("assignee").notEmpty().withMessage('The "assignee" field is required.'),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { title, description, dueDate, status, assignee } = req.body;

    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      const taskCount = await Task.countDocuments({ status: status });
      const newTask = new Task({ title, description, dueDate, status, assignee, position: taskCount });

      await newTask.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(201).json(newTask);
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Error creating task" });
    }
  }
);

router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const searchQuery = req.query.search ? String(req.query.search).trim() : "";

    const filter = searchQuery
      ? {
          $or: [
            { title: { $regex: searchQuery, $options: "i" } },
            { description: { $regex: searchQuery, $options: "i" } },
          ],
        }
      : {};

    const tasks = await Task.find(filter)
      .sort({ status: 1, position: 1 })
      .populate("assignee", "username email");

    res.status(200).json(groupTasksByStatus(tasks));
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Error fetching tasks" });
  }
});

router.put("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { title, description, dueDate, status, assignee, position: newPosition } = req.body;

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const existingTask = await Task.findById(id).session(session);
    if (!existingTask) {
       res.status(404).json({ error: "Task not found" });
       return;
    }

    const oldStatus = existingTask.status;
    const oldPosition = existingTask.position;
 
    if (title !== undefined) {
      existingTask.title = title;
    }
    if (description !== undefined) {
      existingTask.description = description;
    }
    if (dueDate !== undefined) {
      existingTask.dueDate = dueDate;
    }
    if (status !== undefined) {
      existingTask.status = status;
    }
    if (assignee !== undefined) {
      existingTask.assignee = assignee;
    }

    await existingTask.save({ session });

    if (status !== undefined && (oldStatus !== status || newPosition !== undefined && oldPosition !== newPosition)) {
      await updateTaskPositions(status, id, newPosition === undefined ? oldPosition : newPosition, oldStatus, oldPosition, session);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json(existingTask);
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Error updating task" });
  }
});

router.delete("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  let session;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const deletedTask = await Task.findById(id).session(session);
    if (!deletedTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const oldStatus = deletedTask.status;
    const oldPosition = deletedTask.position;

    await deletedTask.deleteOne({ session });

    await shiftTasks(oldStatus, oldPosition, -1, '', session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("Error deleting task:", error);
    res.status(500).json({ error: "Error deleting task" });
  }
});

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: 'done' });
    res.json({ totalTasks, completedTasks });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching task statistics' });
  }
});

router.get('/completion-stats', authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.aggregate([
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$dueDate'
              }
            },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.date': 1,
          '_id.status': 1
        }
      }
    ]);

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching task completion statistics' });
  }
});


async function updateTaskPositions(
  status: string,
  taskId: string,
  newPosition: number,
  oldStatus: string,
  oldPosition: number,
  session: mongoose.ClientSession
): Promise<void> {
  try {
    if (oldStatus !== status) {
      await shiftTasks(oldStatus, oldPosition, -1, taskId, session);
      await shiftTasks(status, newPosition, 1, taskId, session);
      await Task.findByIdAndUpdate(taskId, { status: status, position: newPosition }, { session });
    } else {
      if (oldPosition !== newPosition) {
        await shiftTasksWithinStatus(status, oldPosition, newPosition, taskId, session);
        await Task.findByIdAndUpdate(taskId, { position: newPosition }, { session });
      }
    }
  } catch (error) {
    console.error("Error updating task positions:", error);
    throw error;
  }
}

async function shiftTasksWithinStatus(status: string, oldPosition: number, newPosition: number, taskId: string, session: mongoose.ClientSession): Promise<void> {
    try {
        const tasksToUpdate = await Task.find({ status: status }).sort({ position: 1 }).session(session);

        if (oldPosition < newPosition) {
            for (let i = oldPosition + 1; i <= newPosition; i++) {
                const task = tasksToUpdate.find((t: any) => t.position === i && t["_id"].toString() !== taskId);
                if (task) {
                  await Task.findByIdAndUpdate(task._id, { position: i - 1 }, { session });
                }
            }
        } else if (oldPosition > newPosition) {
            for (let i = oldPosition - 1; i >= newPosition; i--) {
                const task = tasksToUpdate.find((t: any) => t.position === i && t._id.toString() !== taskId);
                if (task) {
                  await Task.findByIdAndUpdate(task._id, { position: i + 1 }, { session });
                }
            }
        }
    } catch (error) {
        console.error("Error shifting tasks within status:", error);
        throw error;
    }
}


async function shiftTasks(status: string, position: number, direction: number, taskId: string = '', session: mongoose.ClientSession): Promise<void> {
  try {
    const findOptions: any = {
      status: status,
      position: { $gte: position }
    };

    if (taskId) {
      findOptions._id = { $ne: taskId };
    }

    const tasksToUpdate = await Task.find(findOptions)
      .sort({ position: 1 })
      .session(session);

    for (const task of tasksToUpdate) {
      await Task.findByIdAndUpdate(task._id, { position: task.position + direction }, { session });
    }
  } catch (error) {
    console.error("Error shifting tasks:", error);
    throw error;
  }
}


function groupTasksByStatus(tasks: any[]): Record<string, any[]> {
  return tasks.reduce(
    (acc, task) => {
      acc[task.status] = acc[task.status] || [];
      acc[task.status].push({
          id: task._id,
          title: task.title,
          description: task.description,
          status: task.status,
          dueDate: task.dueDate,
          assignee: task.assignee,
          position: task.position,
        });
      return acc;
    },
    { "to-do": [], "in-progress": [], done: [] } as Record<string, any[]>
  );
}

export default router;
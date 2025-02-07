import express, { Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import Task from "../models/task";
import { body, validationResult } from "express-validator";

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
    }

    const { title, description, dueDate, status, assignee } = req.body;

    try {
      const newTask = new Task({ title, description, dueDate, status, assignee });
      await newTask.save();
      await updateTaskPositions(status);
      
      res.status(201).json(newTask);
    } catch (error) {
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
  const { title, description, dueDate, status, assignee, position } = req.body;

  try {
    const existingTask = await Task.findById(id);
    if (!existingTask) {
      res.status(404).json({ error: "Task not found" });
    }

    const updatedTask = await Task.findByIdAndUpdate(
      id,
      { title, description, dueDate, status, assignee, position },
      { new: true }
    );

    if (!updatedTask) {
      res.status(404).json({ error: "Task not found" });
    }

    await updateTaskPositions(status);
    res.status(200).json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Error updating task" });
  }
});
 
router.delete("/:id", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const deletedTask = await Task.findByIdAndDelete(id);
    if (!deletedTask) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    await updateTaskPositions(deletedTask.status);
    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
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

 
async function updateTaskPositions(status: string): Promise<void> {
  try {
    const tasksInStatus = await Task.find({ status }).sort({ position: 1 });

    await Promise.all(
      tasksInStatus.map(async (task, index) => {
        if (task.position !== index) {
          await Task.findByIdAndUpdate(task._id, { position: index });
        }
      })
    );
  } catch (error) {
    console.error("Error updating task positions:", error);
  }
}
 
function groupTasksByStatus(tasks: any[]): Record<string, any[]> {
  return tasks.reduce(
    (acc, task) => {
      if (acc[task.status]) {
        acc[task.status].push({
          id: task._id,
          title: task.title,
          description: task.description,
          status: task.status,
          dueDate: task.dueDate,
          assignee: task.assignee,
          position: task.position,
        });
      }
      return acc;
    },
    { "to-do": [], "in-progress": [], done: [] } as Record<string, any[]>
  );
}

export default router;

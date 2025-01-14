import express, { Request, Response } from "express";

import { authenticateToken } from "../middleware/auth";
import Task from "../models/task";
import { body, validationResult } from 'express-validator';

const router = express.Router();
 
router.post("/", 
  authenticateToken, 
  [ 
    body('title').notEmpty().withMessage('The "title" field is required.'), 
    body('description').notEmpty().withMessage('The "description" field is required.'), 
    body('dueDate').notEmpty().withMessage('The "dueDate" field is required.'), 
    body('status').notEmpty().withMessage('The "status" field is required.'), 
    body('assignee').notEmpty().withMessage('The "assignee" field is required.')
  ],
  async (req: any, res: any) => {
    const errors = validationResult(req); 
     if (!errors.isEmpty()) { 
      return res.status(400).json({ errors: errors.array() }); 
    }
  const { title, description, dueDate, status, assignee } = req.body;

  try {    
    const maxPosition = await Task.find({ status })
    .sort({ position: -1 })
    .limit(1)
    .then((tasks) => (tasks.length > 0 ? tasks[0].position : 0));

    const newTask = new Task({
      title,
      description,
      dueDate,
      status,
      assignee, 
      position: maxPosition + 1,
    });
    await newTask.save();

    res.status(201).json(newTask);
  } catch (error) {    
    res.status(500).json({ error: "Error creating task" });
  }
});
 
router.get("/", authenticateToken, async (req: any, res: Response) => {
  try {
    const tasks = await Task.find({})
     .sort({ status: 1, position: 1 })
     .populate("assignee", "username email");

     const groupedTasks = {
      "to-do": [],
      "in-progress": [],
      "done": [],
    } as any;
    
    tasks.forEach((task:any) => {
      groupedTasks[task.status]?.push({
        id: task._id,
        title: task.title,
        description: task.description,
        status: task.status,
        dueDate: task.dueDate,
        assignee: task.assignee,
        position: task.position,
      });
    });
 
    res.status(200).json(groupedTasks);
  } catch (error) {     
    res.status(500).json({ error: "Error fetching tasks" });
  }
});
 
router.put("/:id", authenticateToken, async (req: any, res: Response): Promise<any> => {
  const { id } = req.params;
  const { title, description, dueDate, status, assignee, position } = req.body;

  try {
      const existingTask = await Task.findById(id);
      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }
      const updateFields: any = {};
      if (title) updateFields.title = title; 
      if (description) updateFields.description = description; 
      if (dueDate) updateFields.dueDate = dueDate; 
      if (status) updateFields.status = status; 
      if (assignee) updateFields.assignee = assignee;   

      if (status && position !== undefined) {   
        if (position === 0) {
          // Переместить текущую задачу на позицию           
          await Task.updateMany(
            {
              status: status,
              position: { $gte: 0 },
              _id: { $ne: id },
            },
            { $inc: { position: 1 } }
          );   
          updateFields.position = 0;
        } else {

          await Task.updateMany(
            {
              status: status,
              position: { $gte: position },
              _id: { $ne: id },
            },
            { $inc: { position: 1 } }
          );
          updateFields.position = position;
        }
      }

     const updatedTask = await Task.findByIdAndUpdate( 
        id, updateFields, 
        { new: true } 
      ); 

      if (!updatedTask) {
        return res.status(404).json({ error: "Task not found" }); 
      }
      res.status(200).json(updatedTask);
  } catch (error) {
    res.status(500).json({ error: "Error updating task" });
  }
});

router.delete("/:id", authenticateToken, async (req: any, res: Response) : Promise<any> => {
  const { id } = req.params;

  try {
    const deletedTask = await Task.findByIdAndDelete(id);
    if (!deletedTask) return res.status(404).json({ error: "Task not found" });

    await Task.updateMany(
      { status: deletedTask.status, position: { $gt: deletedTask.position } },
      { $inc: { position: -1 } }
    );

    res.status(200).json({ message: "Task deleted" });
  } catch (error) {
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

export default router;

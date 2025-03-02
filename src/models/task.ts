import mongoose, { Document, Schema } from "mongoose";

export interface ITask extends Document {
  title: string;
  description: string;
  dueDate: Date;
  status: "to-do" | "in-progress" | "done";
  assignee: mongoose.Types.ObjectId;
  position: number;
}

const TaskSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  dueDate: { type: Date },
  position: { type: Number, default: 0 },
  status: { type: String, enum: ["to-do", "in-progress", "done"], default: "to-do" },
  assignee: { type: Schema.Types.ObjectId, ref: "User" }, 
});

export default mongoose.model<ITask>("Task", TaskSchema);

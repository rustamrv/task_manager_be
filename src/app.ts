import express from "express";
import cors from "cors";
import MongooseSingleton from "./db";
import authRoutes from "./routes/auth";
import taskRoutes from "./routes/task";
import profileRoutes from "./routes/profile";
import path from "path";
import fs from "fs";

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
 

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/profile", profileRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize MongoDB connection
(async () => {
  try {
    await MongooseSingleton.getInstance();
    console.log("MongoDB connected successfully through singleton.");
    
    // Start the server only after the DB connection is established
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start the server due to database connection error:", err);
    process.exit(1); // Exit process on critical failure
  }
})();

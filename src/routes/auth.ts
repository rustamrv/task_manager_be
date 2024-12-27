import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User, { IUser } from "../models/user";

const router = express.Router();
const JWT_SECRET = "your_jwt_secret"; // Use a secure value in production

// Register
router.post(
  "/register",
  async (req: Request, res: Response) => {
    const { username, email, password } = req.body;

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({ username, email, password: hashedPassword });
      await newUser.save();
 
      const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: "1h" });
      res.status(201).json({ token, message: "User registered successfully" });
    } catch (error) {
      res.status(500).json({ error: "Error registering user" });
    }
  }
);

// Login
 
router.post(
    "/login",
    async (req: Request, res: Response): Promise<void> => {
      const { email, password } = req.body;
  
      try {
        if (!email || !password) {
          res.status(400).json({ error: "Email and password are required" });
          return;
        }
  
        const user = await User.findOne({ email });
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }
  
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          res.status(400).json({ error: "Invalid credentials" });
          return;
        }
  
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1h" });
        res.status(200).json({ token });
      } catch (error) {
        res.status(500).json({ error: "Server error" });
      }
    }
  );

export default router;

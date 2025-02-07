import express, { Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import upload from "../middleware/upload";
import User from "../models/user";
 
const router = express.Router();

// Get Profile
router.get("/", authenticateToken, async (req: any, res: Response) : Promise<any> => {
  try {    
    const user = await User.findById(req.user?.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.profileImage) {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      user.profileImage = `${baseUrl}${user.profileImage}`;
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Update Profile Image
router.put(
  "/upload",
  authenticateToken,
  upload.single("profileImage"),
  async (req: any, res: Response) : Promise<any> => {
    try {
      if (!req.file) {
        console.log("No file uploaded");
        return res.status(400).json({ error: "No file uploaded" });
      }
      const user = await User.findById(req.user?.id);
      if (!user) return res.status(404).json({ error: "User not found" });
  
      user.profileImage = `/uploads/${req.file.filename}`;
      await user.save();

      res.status(200).json({ message: "Profile image updated", profileImage: user.profileImage });
    } catch (error) {
      res.status(500).json({ error: "Failed to upload profile image" });
    }
  }
);

router.get("/users", authenticateToken, async (req: Request, res: Response) => {
    try {
      const { username, email } = req.query;
      const filter: any = {};
      if (username) filter.username = new RegExp(username as string, "i");
      if (email) filter.email = new RegExp(email as string, "i");
  
      const users = await User.find(filter).select("-password");
      res.status(200).json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

export default router;

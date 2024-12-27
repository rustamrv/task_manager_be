import mongoose from "mongoose";
import { config } from 'dotenv'

config()

class MongooseSingleton {
  private static instance: typeof mongoose | null = null;

  private constructor() {}

  public static async getInstance(): Promise<typeof mongoose> {
    if (!MongooseSingleton.instance) {
      try {
        MongooseSingleton.instance = await mongoose.connect(String(process.env.MONGO_URI));
        console.log("Connected to MongoDB");
      } catch (err) {
        console.error("Database connection error:", err);
        throw err;
      }
    }

    return MongooseSingleton.instance;
  }

  public static async closeConnection(): Promise<void> {
    if (MongooseSingleton.instance) {
      await mongoose.disconnect();
      console.log("MongoDB connection closed");
      MongooseSingleton.instance = null;
    }
  }
}

export default MongooseSingleton;

// worker.js
import dotenv from "dotenv";
dotenv.config();
import connectDb from './config/connectDB.js';

// Import the workers here instead of index.js
import "./workers/emailWorker.js";
import "./workers/videoWorker.js";
import "./workers/analyticsFlusher.js";
import "./workers/ratingFlusher.js";

connectDb().then(() => {
    console.log("⚡ WORKER SYSTEM: All background queues are active.");
});
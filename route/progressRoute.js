import express from 'express';
import { 
    markProgress, 
    getProgress, 
    syncWatchTime, 
    getCourseProgress, 
    markLectureAsComplete 
} from '../controller/progressController.js';
import isAuth from "../middleware/isAuth.js";

const progressRouter = express.Router();

// HEATMAP & STREAK ROUTES (Activity Model)
progressRouter.get("/heatmap/data", isAuth, getProgress);
progressRouter.post("/heatmap/mark", isAuth, markProgress);

// FAANG VIDEO PROGRESS ROUTES (Redis + Progress Model)
// High-frequency ping from video player (every 5 seconds)
progressRouter.post("/save", isAuth, syncWatchTime);

// User explicitly clicks "Mark as Done"
progressRouter.post("/complete", isAuth, markLectureAsComplete);

// Fetch all watch times and completed lectures for a specific course
progressRouter.get("/:courseId", isAuth, getCourseProgress);

export default progressRouter;
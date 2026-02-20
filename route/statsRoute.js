import express from 'express';
import { 
    getEnrolledCoursesProgress, 
    getStudentStats 
} from '../controller/statsController.js';
import isAuth from '../middleware/isAuth.js';

const statsRouter = express.Router();

// Fetches the overall progress % for all courses a student is enrolled in (For Dashboard)
statsRouter.get("/course-progress", isAuth, getEnrolledCoursesProgress);

// Fetches global student stats like Current Streak and Total Lectures Completed
statsRouter.get("/student", isAuth, getStudentStats);

export default statsRouter;
import express from 'express';
import { 
    trackCourseView, 
    trackLectureEngagement,
    getCourseAnalyticsDashboard 
} from '../controller/analyticsController.js';
import isAuth from '../middleware/isAuth.js';

const analyticsRouter = express.Router();

// Public / Student Telemetry Routes
analyticsRouter.post("/view/:courseId", isAuth, trackCourseView);
analyticsRouter.post("/telemetry", isAuth, trackLectureEngagement);

// Instructor Dashboard Routes
analyticsRouter.get("/instructor/:courseId", isAuth, getCourseAnalyticsDashboard);

export default analyticsRouter;
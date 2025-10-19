import express from 'express';
import { getCourseProgress, getStudentStats } from '../controller/statsController.js';
import isAuth from '../middleware/isAuth.js';

const statsRouter = express.Router();

statsRouter.get("/course-progress", isAuth, getCourseProgress);
statsRouter.get("/student", isAuth, getStudentStats);


export default statsRouter;
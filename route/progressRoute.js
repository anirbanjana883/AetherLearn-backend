import express from 'express';
import { markProgress, getProgress } from '../controller/progressController.js';
import isAuth from "../middleware/isAuth.js"

const progressRouter = express.Router();

progressRouter.get("/", isAuth, getProgress);

progressRouter.post("/mark", isAuth, markProgress);

export default progressRouter;
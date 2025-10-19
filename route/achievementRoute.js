import express from 'express';

import isAuth from '../middleware/isAuth.js';
import { getMyAchievements } from '../controller/achievementController.js';

const achievementRouter = express.Router();

achievementRouter.get("/my-achievements", isAuth, getMyAchievements);

export default achievementRouter;
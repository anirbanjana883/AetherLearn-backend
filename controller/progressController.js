import Progress from '../models/progressModel.js';
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const markProgress = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Upsert: Update if exists, Insert if not
  await Progress.findOneAndUpdate(
    { userId: userId, date: today },
    { $inc: { activityCount: 1 } },
    { upsert: true, new: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Progress marked successfully"));
});

export const getProgress = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const progressData = await Progress.find({
    userId: userId,
    date: { $gte: oneYearAgo }
  }).select('date activityCount -_id');

  // Format data for the heatmap
  const formattedData = progressData.map(item => ({
    date: item.date.toISOString().split('T')[0],
    count: item.activityCount,
  }));

  return res
    .status(200)
    .json(new ApiResponse(200, formattedData, "Progress data fetched successfully"));
});
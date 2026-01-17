import User from '../models/userModel.js';
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const getMyAchievements = asyncHandler(async (req, res) => {
  const userId = req.userId;
  
  const user = await User.findById(userId).populate('unlockedAchievements');
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user.unlockedAchievements, "Achievements fetched successfully"));
});
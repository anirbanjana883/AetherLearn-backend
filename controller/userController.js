
import uploadOnCludinary from "../config/cloudinary.js";
import User from "../models/userModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {ApiResponse} from "../utils/ApiResponse.js"

// get current user
export const getCurrentUser = asyncHandler(async (req, res) => {
    if (!req.userId) {
      throw new ApiError(401, "Not authenticated");
    }
    const user = await User.findById(req.userId).select("-password").populate("enrolledCourses");
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    // Standardized Response
    return res.status(200).json(new ApiResponse(200, user, "Current user fetched"));
});

// update profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const { description, name } = req.body;
    let photoUrl;
    if (req.file) {
      // photoUrl = await uploadOnCludinary(req.file.path);
      photoUrl = await uploadOnCludinary(req.file.path);
    }
    // const user = await User.findById(userId, { name, description, photoUrl });
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (name) user.name = name;
    if (description) user.description = description;
    if (photoUrl) user.photoUrl = photoUrl;
    if (!user.enrolledCourses) user.enrolledCourses = [];
  
    await user.save()
    const updatedUser = await User.findById(userId).select("-password");
    return res.status(200).json(updatedUser);
  } catch (error) {
    return res.status(500).json({ message: `Update profile error ${error}` });
  }
};

import uploadOnCludinary from "../config/cloudinary.js";
import User from "../models/userModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// Get Current User
export const getCurrentUser = asyncHandler(async (req, res) => {
    if (!req.userId) {
        throw new ApiError(401, "Not authenticated");
    }
    
    const user = await User.findById(req.userId).select("-password").populate("enrolledCourses");
    
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Current user fetched"));
});

// Update Profile
export const updateProfile = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { description, name } = req.body;
    
    let photoUrl;
    if (req.file) {
        photoUrl = await uploadOnCludinary(req.file.path);
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    // Update fields if provided
    if (name) user.name = name;
    if (description) user.description = description;
    if (photoUrl) user.photoUrl = photoUrl;
    
    // Ensure enrolledCourses array exists (safety check)
    if (!user.enrolledCourses) user.enrolledCourses = [];

    await user.save();

    // Fetch the updated user without password to return
    const updatedUser = await User.findById(userId).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, updatedUser, "Profile updated successfully"));
});
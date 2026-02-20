import User from '../models/userModel.js';
import Progress from '../models/progressModel.js'; 
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

// --- Controllers ---

export const getEnrolledCoursesProgress = asyncHandler(async (req, res) => {
    const userId = req.userId;

    //  O(1) Optimization: Only fetch the exact fields needed
    const user = await User.findById(userId).populate('enrolledCourses', 'title totalLectures');

    if (!user) throw new ApiError(404, "User not found");

    // Fetch all progress documents for this user in ONE query
    const userProgressDocs = await Progress.find({ userId });
    
    // Hashmap for instant O(1) lookups
    const progressMap = new Map(
        userProgressDocs.map(p => [p.courseId.toString(), p.completedLectures.length])
    );

    const progressData = user.enrolledCourses.map(course => {
        const completedCount = progressMap.get(course._id.toString()) || 0;
        const total = course.totalLectures || 0;
        
        const progressPercentage = total > 0 ? Math.round((completedCount / total) * 100) : 0;

        return {
            courseId: course._id,
            courseTitle: course.title,
            progress: progressPercentage,
        };
    });

    return res.status(200).json(new ApiResponse(200, progressData, "Fast course progress fetched"));
});

export const getStudentStats = asyncHandler(async (req, res) => {
    const userId = req.userId;

    //  OPTIMIZATION: O(1) Dashboard fetching with precomputed streaks
    const user = await User.findById(userId).select('enrolledCourses completedLectures currentStreak');

    if (!user) throw new ApiError(404, "User not found");

    const stats = {
        enrolledCount: user.enrolledCourses?.length || 0,
        lecturesCompleted: user.completedLectures?.length || 0,
        currentStreak: user.currentStreak || 0, 
    };

    return res.status(200).json(new ApiResponse(200, stats, "Student stats fetched instantly"));
});
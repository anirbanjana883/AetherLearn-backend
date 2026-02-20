import Progress from "../models/progressModel.js";
import Activity from "../models/activityModel.js"; 
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";
import { checkAndAwardAchievements } from "../services/achievementService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import redisClient from "../config/redis.js";

//  HEATMAP & STREAK CONTROLLERS 
export const markProgress = asyncHandler(async (req, res) => {
    const userId = req.userId;

    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    await Activity.findOneAndUpdate(
        { userId: userId, date: today },
        { $inc: { activityCount: 1 } },
        { upsert: true, new: true }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Daily activity marked successfully for heatmap"));
});

export const getProgress = asyncHandler(async (req, res) => {
    const userId = req.userId;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Fetch from Activity collection instead of Progress
    const activityData = await Activity.find({
        userId: userId,
        date: { $gte: oneYearAgo }
    }).select('date activityCount -_id');

    const formattedData = activityData.map(item => ({
        date: item.date.toISOString().split('T')[0],
        count: item.activityCount,
    }));

    return res
        .status(200)
        .json(new ApiResponse(200, formattedData, "Heatmap data fetched successfully"));
});

//  COURSE PROGRESS CONTROLLERS (Video Tracking)

// High-Speed Sync: Called every 5 seconds by the video player
export const syncWatchTime = asyncHandler(async (req, res) => {
    const { courseId, lectureId, watchTime } = req.body;
    const userId = req.userId;

    if (!courseId || !lectureId || watchTime === undefined) {
        throw new ApiError(400, "Missing required progress data");
    }

    const redisKey = `progress:${userId}:${courseId}`;

    // Write to Redis RAM instantly
    await redisClient.hset(redisKey, lectureId, watchTime);
    await redisClient.hset(redisKey, 'lastWatched', lectureId);
    await redisClient.expire(redisKey, 86400); 

    // Mark as dirty for the Cron Job to pick up later
    await redisClient.sadd('dirty_progress_keys', redisKey);

    return res.status(200).json(new ApiResponse(200, {}, "Progress synced to cache "));
});

// Get Course Progress: Used when a user opens a specific course
export const getCourseProgress = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.userId;
    const redisKey = `progress:${userId}:${courseId}`;

    let dbProgress = await Progress.findOne({ userId, courseId });
    const cachedProgress = await redisClient.hgetall(redisKey);

    const parsedCache = Object.fromEntries(
        Object.entries(cachedProgress).map(([k, v]) => [
            k,
            k === "lastWatched" ? v : Number(v)
        ])
    );

    const finalWatchTimes = {
        ...(dbProgress ? Object.fromEntries(dbProgress.watchTimes) : {}),
        ...parsedCache
    };

    // Prevent 5,000 DB reads when 5,000 students open the course player
    const metaKey = `courseMeta:${courseId}`;
    let totalLectures = await redisClient.get(metaKey);

    if (!totalLectures) {
        const course = await Course.findById(courseId).select('totalLectures');
        totalLectures = course?.totalLectures || 0;
        
        // Cache the metadata for 24 hours (86400 seconds)
        await redisClient.set(metaKey, totalLectures, 'EX', 86400); 
    }

    totalLectures = Number(totalLectures);

    const completionPercentage = totalLectures > 0
        ? Math.round(((dbProgress?.completedLectures?.length || 0) / totalLectures) * 100)
        : 0;

    const responseData = {
        completedLectures: dbProgress ? dbProgress.completedLectures : [],
        watchTimes: finalWatchTimes,
        lastWatchedLecture: cachedProgress.lastWatched || (dbProgress && dbProgress.lastWatchedLecture),
        completionPercentage
    };

    return res.status(200).json(new ApiResponse(200, responseData, "Course progress fetched instantly"));
});

// Mark Lecture Complete: User explicitly clicks "Mark as Done"
export const markLectureAsComplete = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { courseId, lectureId } = req.body;

    if (!lectureId || !courseId) {
        throw new ApiError(400, "Lecture ID and Course ID are required");
    }

    // Mark lecture in Progress collection
    await Progress.findOneAndUpdate(
        { userId, courseId },
        {
            $addToSet: { completedLectures: lectureId },
            $set: { lastWatchedLecture: lectureId }
        },
        { upsert: true, new: true }
    );

    const today = getUTCMidnight(new Date());
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    const user = await User.findById(userId).select("currentStreak lastActiveDate");

    let newStreak = user?.currentStreak || 0;

    if (!user?.lastActiveDate) {
        newStreak = 1;
    } else {
        const lastActive = getUTCMidnight(user.lastActiveDate);

        if (lastActive.getTime() === today.getTime()) {
            // already active today → do nothing
        } 
        else if (lastActive.getTime() === yesterday.getTime()) {
            newStreak += 1; // continue streak
        } 
        else {
            newStreak = 1; // streak broken
        }
    }

    // Single DB write
    await User.findByIdAndUpdate(userId, {
        currentStreak: newStreak,
        lastActiveDate: today,
        $addToSet: { completedLectures: lectureId }
    });

    // Activity heatmap
    await Activity.findOneAndUpdate(
        { userId, date: today },
        { $inc: { activityCount: 1 } },
        { upsert: true }
    );

    await checkAndAwardAchievements(userId);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Lecture marked as complete "));
});



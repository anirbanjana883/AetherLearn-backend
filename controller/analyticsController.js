import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import redisClient from "../config/redis.js";
import CourseAnalytics from "../models/analyticsModel.js";
import Course from "../models/courseModel.js";

// TRACK COURSE VIEW (Called when user opens Course Landing Page)
export const trackCourseView = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.userId; 

    // O(1) Atomic Increment for Total Views
    await redisClient.incr(`analytics:course_views:${courseId}`);

    //  O(1) HyperLogLog for Unique Active Users 
    if (userId) {
        await redisClient.pfadd(`analytics:course_users:${courseId}`, userId);
    }

    // maarking for corn -dirty course
    await redisClient.sadd('dirty_analytics_courses', courseId);

    return res.status(200).json(new ApiResponse(200, {}, "Course view tracked"));
});

// Lacture engangement tracking 
export const trackLectureEngagement = asyncHandler(async (req, res) => {
    const { courseId, lectureId, watchTimeDelta } = req.body;

    if (!courseId || !lectureId || !watchTimeDelta) {
        return res.status(400).json({ success: false, message: "Missing telemetry data" });
    }

    // O(1) Atomic Increment for Lecture Views
    await redisClient.incr(`analytics:lecture_views:${lectureId}`);

    // O(1) Add to total accumulated watch time across all users
    await redisClient.incrby(`analytics:lecture_watchtime:${lectureId}`, Math.round(watchTimeDelta));

    // maarking for corn -dirty course
    await redisClient.sadd('dirty_analytics_courses', courseId);
    
    // maarking for corn -dirty lecture
    await redisClient.sadd(`dirty_analytics_lectures:${courseId}`, lectureId);

    return res.status(200).json(new ApiResponse(200, {}, "Lecture telemetry tracked"));
});

// GET INSTRUCTOR DASHBOARD 
export const getCourseAnalyticsDashboard = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const userId = req.userId;

    // Memory-Optimized Populate
    const [course, dbAnalytics] = await Promise.all([
        Course.findOne({ _id: courseId, creator: userId }).populate({
            path: 'sections',
            select: 'lectures',
            populate: { path: 'lectures', select: '_id lectureTitle' }
        }),
        CourseAnalytics.findOne({ courseId })
    ]);

    if (!course) {
        return res.status(403).json({ success: false, message: "Unauthorized or course not found" });
    }

    const multi = redisClient.multi();
    multi.get(`analytics:course_views:${courseId}`);
    multi.pfcount(`analytics:course_users:${courseId}`);
    const redisResults = await multi.exec();

    const liveCourseViews = parseInt(redisResults[0] || 0, 10);
    const liveActiveUsers = parseInt(redisResults[1] || 0, 10);

    let totalViews = (dbAnalytics?.totalViews || 0) + liveCourseViews;
    let uniqueActiveUsers = Math.max(dbAnalytics?.uniqueActiveUsers || 0, liveActiveUsers);
    let totalCourseWatchTime = 0;

    //  FIX : The O(1) Network Batching Fix (No N+1 Redis calls)
    const viewKeys = [];
    const watchKeys = [];
    const lectureMap = [];

    for (const section of course.sections) {
        for (const lecture of section.lectures) {
            const lecIdStr = lecture._id.toString();
            viewKeys.push(`analytics:lecture_views:${lecIdStr}`);
            watchKeys.push(`analytics:lecture_watchtime:${lecIdStr}`);
            lectureMap.push({
                id: lecIdStr,
                title: lecture.lectureTitle
            });
        }
    }

    let liveViewsArr = [];
    let liveWatchArr = [];
    
    if (viewKeys.length > 0) {
        [liveViewsArr, liveWatchArr] = await Promise.all([
            redisClient.mget(...viewKeys),
            redisClient.mget(...watchKeys)
        ]);
    }

    const lectureMetrics = [];
    let mostWatchedLecture = null;
    let highestViews = -1;

    //  Merge DB stats with Battched Live stats
    lectureMap.forEach((lecture, index) => {
        const dbLecStats = dbAnalytics?.lectureStats?.get(lecture.id) || { views: 0, totalWatchTime: 0 };

        const liveViews = parseInt(liveViewsArr[index] || 0, 10);
        const liveWatchTime = parseInt(liveWatchArr[index] || 0, 10);

        const mergedViews = dbLecStats.views + liveViews;
        const mergedWatchTime = dbLecStats.totalWatchTime + liveWatchTime;

        totalCourseWatchTime += mergedWatchTime;

        if (mergedViews > highestViews) {
            highestViews = mergedViews;
            mostWatchedLecture = { id: lecture.id, title: lecture.title, views: mergedViews };
        }

        lectureMetrics.push({
            lectureId: lecture.id,
            title: lecture.title,
            views: mergedViews,
            watchTimeSeconds: mergedWatchTime
        });
    });

    const avgWatchTimeMinutes = uniqueActiveUsers > 0 
        ? Math.round((totalCourseWatchTime / uniqueActiveUsers) / 60) 
        : 0;

    let dropOffRate = 0;
    if (lectureMetrics.length > 1) {
        const firstLectureViews = lectureMetrics[0].views;
        const lastLectureViews = lectureMetrics[lectureMetrics.length - 1].views;
        
        if (firstLectureViews > 0) {
            dropOffRate = Math.round(((firstLectureViews - lastLectureViews) / firstLectureViews) * 100);
        }
    }

    const dashboardData = {
        overview: {
            totalViews,
            uniqueActiveUsers,
            totalWatchTimeHours: Math.round((totalCourseWatchTime / 3600) * 10) / 10,
            avgWatchTimeMinutes,
            dropOffRate: `${dropOffRate}%`,
            mostWatchedLecture
        },
        engagementFunnel: lectureMetrics 
    };

    return res.status(200).json(new ApiResponse(200, dashboardData, "Real-time instructor analytics fetched"));
});

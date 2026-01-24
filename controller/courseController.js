import Course from "../models/courseModel.js";
import Lecture from "../models/lectureModel.js";
import User from "../models/userModel.js";
import Progress from "../models/progressModel.js";
import uploadOnCludinary from "../config/cloudinary.js";
import { checkAndAwardAchievements } from "../services/achievementService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import redisClient from "../config/redis.js";
import { videoQueue } from "../config/queue.js"; 



// COURSE CONTROLLERS
export const createCourse = asyncHandler(async (req, res) => {
    const { title, category, subtitle } = req.body;

    if (!title || !category) {
        throw new ApiError(400, "Title or Category required");
    }

    const course = await Course.create({
        title,
        category,
        subtitle,
        creator: req.userId
    });

    await redisClient.del("all_courses");

    return res
        .status(201)
        .json(new ApiResponse(201, course, "Course created successfully"));
});

export const getPublishedCourses = asyncHandler(async (req, res) => {
    const cacheKey = "all_courses";

    const cachedCourses = await redisClient.get(cacheKey);

    if (cachedCourses) {
        const data = typeof cachedCourses === 'string' ? JSON.parse(cachedCourses) : cachedCourses;

        return res
            .status(200)
            .json(new ApiResponse(200, data, "Published courses fetched from Cache"));
    }

    const courses = await Course.find({ isPublished: true }).populate("lectures reviews");

    if (!courses) {
        throw new ApiError(404, "No published courses found");
    }

    await redisClient.set(cacheKey, courses, { ex: 3600 });

    return res
        .status(200)
        .json(new ApiResponse(200, courses, "Published courses fetched from Database"));
});

export const getCreatorCourses = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const courses = await Course.find({ creator: userId });

    if (!courses) {
        throw new ApiError(404, "No courses found for this creator");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, courses, "Creator courses fetched successfully"));
});

export const editCourse = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const {
        title,
        subtitle,
        description,
        category,
        level,
        isPublished,
        price,
    } = req.body;

    let thumbnail;
    if (req.file) {
        thumbnail = await uploadOnCludinary(req.file.path);
    }

    let course = await Course.findById(courseId);
    if (!course) {
        throw new ApiError(404, "No course found for editing");
    }

    const updateData = {
        title,
        subtitle,
        description,
        category,
        level,
        isPublished,
        price,
        ...(thumbnail && { thumbnail })
    };

    course = await Course.findByIdAndUpdate(courseId, updateData, { new: true });

    await redisClient.del("all_courses");

    return res
        .status(200)
        .json(new ApiResponse(200, course, "Course updated successfully"));
});

export const getCourseById = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    
    let course = await Course.findById(courseId);

    if (!course) {
        throw new ApiError(404, "Course not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, course, "Course fetched successfully"));
});

export const removeCourse = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    let course = await Course.findById(courseId);

    if (!course) {
        throw new ApiError(404, "Course not found");
    }

    await Course.findByIdAndDelete(courseId);

    await redisClient.del("all_courses");

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Course removed successfully"));
});

// LECTURE CONTROLLERS

export const createLecture = asyncHandler(async (req, res) => {
    const { lectureTitle } = req.body;
    const { courseId } = req.params;

    if (!lectureTitle || !courseId) {
        throw new ApiError(400, "Lecture title and course ID are required");
    }

    const lecture = await Lecture.create({ lectureTitle });

    const course = await Course.findById(courseId);
    if (!course) {
        throw new ApiError(404, "Course not found");
    }

    course.lectures.push(lecture._id);
    await course.save();
    
    return res
        .status(201)
        .json(new ApiResponse(201, { lecture, course }, "Lecture created successfully"));
});

export const getCourseLecture = asyncHandler(async (req, res) => {
    const { courseId } = req.params;

    const course = await Course.findById(courseId).populate("lectures");
    if (!course) {
        throw new ApiError(404, "Course not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, course, "Lectures fetched successfully"));
});

//  Async Video Processing
export const editLecture = asyncHandler(async (req, res) => {
    const { lectureId } = req.params;
    const { isPreviewFree, lectureTitle } = req.body;

    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
        throw new ApiError(404, "Lecture not found");
    }

    if (req.file) {
        lecture.status = "processing";
        lecture.videoUrl = ""; 

        await videoQueue.add("transcode-video", {
            lectureId: lecture._id,
            filePath: req.file.path // Multer saved this locally
        });
    }

    if (lectureTitle) lecture.lectureTitle = lectureTitle;
    if (isPreviewFree !== undefined) lecture.isPreviewFree = isPreviewFree;

    await lecture.save();

    return res
        .status(200)
        .json(new ApiResponse(200, lecture, "Lecture updated. Video is processing in background ⏳"));
});

export const removeLecture = asyncHandler(async (req, res) => {
    const { lectureId } = req.params;
    
    const lecture = await Lecture.findByIdAndDelete(lectureId);
    if (!lecture) {
        throw new ApiError(404, "Lecture not found");
    }

    await Course.updateOne(
        { lectures: lectureId },
        { $pull: { lectures: lectureId } }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Lecture removed successfully"));
});

// USER / PROGRESS CONTROLLERS

export const getCreatorById = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    
    const cachedCreator = await redisClient.get(`creator:${userId}`);
    
    if(cachedCreator) {
         const data = typeof cachedCreator === 'string' ? JSON.parse(cachedCreator) : cachedCreator;
         return res.status(200).json(new ApiResponse(200, data, "Fetched from Cache"));
    }

    const user = await User.findById(userId).select("-password");

    if (!user) {
        throw new ApiError(404, "Creator not found");
    }

    await redisClient.set(`creator:${userId}`, user, { ex: 3600 });

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Creator fetched successfully"));
});

export const markLectureAsComplete = asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { lectureId, date } = req.body;

    if (!lectureId || !date) {
        throw new ApiError(400, "Lecture ID and date are required");
    }

    const userToday = new Date(date);

    await Progress.findOneAndUpdate(
        { userId: userId, date: userToday },
        { $inc: { activityCount: 1 } },
        { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, {
        $addToSet: { completedLectures: lectureId }
    });

    await checkAndAwardAchievements(userId);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Lecture marked as complete and progress recorded"));
});
import Course from "../models/courseModel.js";
import Review from "../models/reviewModel.js";
import User from "../models/userModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import redisClient from "../config/redis.js";

// ADD REVIEW 
export const addReview = asyncHandler(async (req, res) => {
    const { rating, comment } = req.body;
    const { courseId } = req.params;
    const userId = req.userId;

    if (!rating || rating < 1 || rating > 5) {
        throw new ApiError(400, "Please provide a valid rating between 1 and 5");
    }

    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, "Course not found");

    const user = await User.findById(userId);
    const isEnrolled = user.enrolledCourses.some(
        (enrolledCourse) => enrolledCourse.toString() === courseId.toString()
    );
    if (!isEnrolled) throw new ApiError(403, "You must be enrolled to review");

    const alreadyReviewed = await Review.findOne({ course: courseId, user: userId });
    if (alreadyReviewed) throw new ApiError(400, "Course already reviewed");

    const review = await Review.create({ course: courseId, user: userId, rating, comment });

    // O(1) Redis Optimization
    const redisKey = `courseRating:${courseId}`;
    await redisClient.hincrby(redisKey, 'totalStars', rating);
    await redisClient.hincrby(redisKey, 'reviewCount', 1);

    // darty marking to prevent the race concdition
    await redisClient.sadd("dirty_rating_courses", courseId.toString());

    return res.status(201).json(new ApiResponse(201, review, "Review added successfully"));
});

// EDIT REVIEW 
export const editReview = asyncHandler(async (req, res) => {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.userId;

    if (rating !== undefined && (rating < 1 || rating > 5)) {
        throw new ApiError(400, "Rating must be between 1 and 5");
    }

    const review = await Review.findOne({ _id: reviewId, user: userId });
    if (!review) throw new ApiError(404, "Review not found or unauthorized");

    const oldRating = review.rating;
    
    if (rating) review.rating = rating;
    if (comment !== undefined) review.comment = comment;
    await review.save();

    // O(1) Redis Delta Update
    if (rating && rating !== oldRating) {
        const ratingDelta = rating - oldRating; 
        const redisKey = `courseRating:${review.course}`;
        await redisClient.hincrby(redisKey, 'totalStars', ratingDelta);

        // Dirty Marking on Edit
        await redisClient.sadd("dirty_rating_courses", review.course.toString());
    }

    return res.status(200).json(new ApiResponse(200, review, "Review updated successfully"));
});

// GET COURSE REVIEWS
export const getCourseReviews = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const redisKey = `courseRating:${courseId}`;

    const [ratingData, reviews] = await Promise.all([
        redisClient.hgetall(redisKey),
        Review.find({ course: courseId })
            .populate("user", "name photoUrl")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
    ]);

    let totalStars = parseInt(ratingData.totalStars || 0, 10);
    let reviewCount = parseInt(ratingData.reviewCount || 0, 10);
    let avgRating = reviewCount > 0 ? Number((totalStars / reviewCount).toFixed(1)) : 0;

    // Cold Start Fallback
    if (reviewCount === 0) {
        const course = await Course.findById(courseId).select("avgRating reviewCount");
        if (course && course.reviewCount > 0) {
            avgRating = course.avgRating;
            reviewCount = course.reviewCount;

            //  aggain loading  the cache so the next user gets the O(1) speed!
            await redisClient.hset(redisKey, 'totalStars', Math.round(avgRating * reviewCount));
            await redisClient.hset(redisKey, 'reviewCount', reviewCount);
        }
    }

    return res.status(200).json(new ApiResponse(200, {
        stats: { avgRating, reviewCount },
        reviews
    }, "Reviews fetched successfully"));
});

// GET ALL PLATFORM REVIEWS 
export const getAllReviews = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const minRating = parseInt(req.query.minRating) || 1;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ rating: { $gte: minRating } })
        .populate("user", "name photoUrl")
        .populate("course", "title thumbnail")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalReviews = await Review.countDocuments({ rating: { $gte: minRating } });

    return res.status(200).json(new ApiResponse(200, {
        reviews,
        totalPages: Math.ceil(totalReviews / limit),
        currentPage: page,
        totalReviews
    }, "Global platform reviews fetched successfully"));
});
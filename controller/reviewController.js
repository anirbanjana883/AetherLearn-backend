import Course from "../models/courseModel.js";
import Review from "../models/reviewModel.js";
import User from "../models/userModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const createReview = asyncHandler(async (req, res) => {
  const { rating, comment, courseId } = req.body;
  const userId = req.userId;

  const course = await Course.findById(courseId);
  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  // Check enrollment
  const user = await User.findById(userId);
  const isEnrolled = user.enrolledCourses.some(
    (enrolledCourse) => enrolledCourse.toString() === courseId
  );

  if (!isEnrolled) {
    throw new ApiError(403, "You must be enrolled in this course to leave a review");
  }

  const alreadyReviewed = await Review.findOne({
    course: courseId,
    user: userId,
  });

  // One person, one review logic
  if (alreadyReviewed) {
    throw new ApiError(400, "This Course is already reviewed by you");
  }

  const review = new Review({
    course: courseId,
    user: userId,
    rating,
    comment,
  });

  await review.save();
  
  // Update course reviews array
  course.reviews.push(review._id);
  await course.save();

  return res
    .status(200)
    .json(new ApiResponse(200, review, "Review added successfully"));
});

export const getReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find()
    .populate("user", "name photoUrl description")
    .populate("course", "title")
    .sort({ reviewedAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, reviews, "Reviews fetched successfully"));
});
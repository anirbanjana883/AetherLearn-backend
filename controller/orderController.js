import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

dotenv.config();

const RazorPayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

export const RazorpayOrder = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  const course = await Course.findById(courseId);

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  // Create order
  const options = {
    amount: course.price * 100, // Amount in paise
    currency: 'INR',
    receipt: courseId.toString(),
  };

  const order = await RazorPayInstance.orders.create(options);

  return res
    .status(200)
    .json(new ApiResponse(200, order, "Order created successfully"));
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const { courseId, userId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  // Verify the signature
  const generated_signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (generated_signature !== razorpay_signature) {
    throw new ApiError(400, "Payment verification failed");
  }

  // Update user
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found during payment verification");
  }

  if (!user.enrolledCourses.includes(courseId)) {
    user.enrolledCourses.push(courseId);
    await user.save();
  }

  // Update course
  const course = await Course.findById(courseId);
  if (!course) {
    throw new ApiError(404, "Course not found during payment verification");
  }

  if (!course.enrolledStudent.includes(userId)) {
    course.enrolledStudent.push(userId);
    await course.save();
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Payment verified and enrolled successfully"));
});
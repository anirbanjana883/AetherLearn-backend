import Razorpay from "razorpay";
import crypto from "crypto";
import mongoose from "mongoose";
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const RazorPayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// CREATE ORDER
export const RazorpayOrder = asyncHandler(async (req, res) => {
    const { courseId } = req.body;
    const userId = req.userId; 

    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, "Course not found");

    // Pre-Enrollment Check
    const user = await User.findById(userId);
    if (user.enrolledCourses.includes(courseId)) {
        throw new ApiError(400, "You already own this course");
    }

    // Create our internal PENDING order first 
    const newOrder = await Order.create({
        user: userId,
        course: courseId,
        amount: course.price
    });

    // Create Razorpay Order
    const options = {
        amount: course.price * 100, 
        currency: 'INR',
        receipt: newOrder._id.toString(), 
        notes: {
            project: "AetherLearn" 
        }
    };

    const razorpayOrder = await RazorPayInstance.orders.create(options);

    // Update our order with the Razorpay Order ID
    newOrder.razorpayOrderId = razorpayOrder.id;
    await newOrder.save();

    return res.status(200).json(new ApiResponse(200, razorpayOrder, "Order created successfully"));
});

// VERIFY PAYMENT (Delegated to Webhook)
export const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const generated_signature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

    if (generated_signature !== razorpay_signature) {
        throw new ApiError(400, "Payment verification failed");
    }

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) throw new ApiError(404, "Order not found");

    if (order.status === "PENDING") {
        order.status = "VERIFYING"; 
        await order.save();
    }

    return res.status(200).json(
        new ApiResponse(200, {}, "Payment acknowledged. Processing enrollment...")
    );
});
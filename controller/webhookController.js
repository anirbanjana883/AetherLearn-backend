import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import Course from "../models/courseModel.js";

export const razorpayWebhook = async (req, res) => {
    const signature = req.headers["x-razorpay-signature"];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET; 

    try {
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(req.body) 
            .digest("hex");

        if (expectedSignature !== signature) {
            console.error("Webhook Signature Mismatch!");
            return res.status(400).send("Invalid signature");
        }

        const payload = JSON.parse(req.body.toString());
        const event = payload.event;

        if (event === "payment.captured") {
            const payment = payload.payload.payment.entity;

            // Bouncer logic
            if (payment.notes?.project !== "AetherLearn") {
                return res.status(200).send("Ignored - Not AetherLearn"); 
            }

            const razorpayOrderId = payment.order_id;
            const order = await Order.findOne({ razorpayOrderId });
            
            if (!order) return res.status(200).send("Order not found"); 
            if (order.status === "SUCCESS") return res.status(200).send("Already processed");

            // duplicate course coumnt check
            const alreadyEnrolled = await User.findOne({
                _id: order.user,
                enrolledCourses: order.course
            });

            if (alreadyEnrolled) {
                order.status = "SUCCESS";
                await order.save();
                return res.status(200).send("Already enrolled");
            }

            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                await User.findByIdAndUpdate(
                    order.user, 
                    { $addToSet: { enrolledCourses: order.course } },
                    { session }
                );

                await Course.findByIdAndUpdate(
                    order.course,
                    { $inc: { enrolledCount: 1 } },
                    { session }
                );

                order.status = "SUCCESS";
                order.razorpayPaymentId = payment.id;
                await order.save({ session });

                await session.commitTransaction();
                console.log(` Webhook successfully enrolled user for order: ${order._id}`);
                
            } catch (error) {
                await session.abortTransaction();
                console.error("Webhook Transaction Failed", error);
                return res.status(500).send("Server Error"); 
            } finally {
                session.endSession();
            }
        }

        return res.status(200).send("Webhook processed");

    } catch (error) {
        console.error("Webhook processing error:", error);
        return res.status(500).send("Internal Server Error");
    }
};
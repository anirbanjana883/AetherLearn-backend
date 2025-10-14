import Razorpay from "razorpay";
import dotenv from "dotenv"
import Course from "../models/courseModel.js";
import User from "../models/userModel.js";

dotenv.config()

const RazorPayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


export const RazorpayOrder = async (req,res)=>{
    try {
        const {courseId} = req.body
        const course = await Course.findById(courseId)

        if(!course){
            return res.status(404).json({ message: "Course not found" });
        }

        // create order

        const options = {
            amount : course.price * 100,
            currency : 'INR',
            receipt: courseId.toString(),
        }

        const order = await RazorPayInstance.orders.create(options)

        return res.status(200).json(order);
    } catch (error) {
        return res.status(500).json({ message: `Failed to verify order ${error}` });
    }
}


export const verifyPayment = async (req, res) => {
  try {
    const { courseId, userId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // Verify the signature
    const crypto = await import("crypto");
    const generated_signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ message: "Payment verification failed" });
    }

    //  Update user and course
    const user = await User.findById(userId);
    if (!user.enrolledCourses.includes(courseId)) {
      user.enrolledCourses.push(courseId);
      await user.save();
    }

    const course = await Course.findById(courseId);
    if (!course.enrolledStudent.includes(userId)) {
      course.enrolledStudent.push(userId);
      await course.save();
    }

    return res.status(200).json({ message: "Payment verified and enrolled successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Failed to verify Payment: ${error}` });
  }
};

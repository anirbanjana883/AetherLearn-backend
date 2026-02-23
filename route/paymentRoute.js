import express from "express";
import isAuth from "../middleware/isAuth.js";
import { RazorpayOrder, verifyPayment } from "../controller/orderController.js";
import { razorpayWebhook } from "../controller/webhookController.js"; 

const paymentRouter = express.Router();

// 1. User clicks "Pay" (Protected)
paymentRouter.post("/razorpay-order", isAuth, RazorpayOrder);

// 2. User successfully pays and browser stays open (Protected)
paymentRouter.post("/verifypayment", isAuth, verifyPayment);

// 3. THE SAFETY NET: Razorpay talks directly to our server (Public!)
paymentRouter.post("/webhook", razorpayWebhook);

export default paymentRouter;
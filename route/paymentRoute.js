import express from "express"
import isAuth from "../middleware/isAuth.js"
import upload from "../middleware/multer.js"
import { RazorpayOrder, verifyPayment } from "../controller/orderController.js"

const paymentRouter = express.Router()

paymentRouter.post("/razorpay-order",isAuth,RazorpayOrder);
paymentRouter.post("/verifypayment",isAuth,verifyPayment);

export default paymentRouter
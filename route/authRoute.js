import express from "express";
import rateLimit from "express-rate-limit";
import { googleAuth, logIn, logOut, resetPassword, sendOtp, signup, verifyOtp } from "../controller/authController.js";
import { validate } from "../middleware/validateMiddleware.js"; 
import { signupSchema, loginSchema, emailSchema, verifyOtpSchema, resetPasswordSchema } from "../validators/authValidator.js";

const authRouter = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 attempts allowed
    message: "Too many authentication attempts. Please try again in 15 minutes.",
    standardHeaders: true,
    legacyHeaders: false,
});


authRouter.post("/signup", authLimiter, validate(signupSchema), signup);
authRouter.post("/login", authLimiter, validate(loginSchema), logIn);
authRouter.post("/sendotp", authLimiter, validate(emailSchema), sendOtp);
authRouter.post("/verifyotp", authLimiter, validate(verifyOtpSchema), verifyOtp);
authRouter.post("/resetpassword", authLimiter, validate(resetPasswordSchema), resetPassword);



authRouter.post("/googleauth", googleAuth);
authRouter.get("/logout", logOut);

export default authRouter;
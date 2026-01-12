import express from "express"
import { googleAuth, logIn, logOut, resetPassword, sendOtp, signup, verifyOtp } from "../controller/authController.js"
import { validate } from "../middleware/validateMiddleware.js"; 
import { signupSchema, loginSchema, emailSchema, verifyOtpSchema, resetPasswordSchema } from "../validators/authValidator.js";

const authRouter = express.Router()

authRouter.post("/signup", validate(signupSchema), signup);
authRouter.post("/login", validate(loginSchema), logIn);

authRouter.get("/logout",logOut)
authRouter.post("/sendotp",validate(emailSchema),sendOtp)
authRouter.post("/verifyotp",validate(verifyOtpSchema),verifyOtp)
authRouter.post("/resetpassword",validate(resetPasswordSchema),resetPassword)
authRouter.post("/googleauth",googleAuth)

export default authRouter;
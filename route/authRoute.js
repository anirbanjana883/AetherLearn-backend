import express from "express"
import { logIn, logOut, resetPassword, sendOtp, signup, verifyOtp } from "../controller/authController.js"

const authRouter = express.Router()

authRouter.post("/signup",signup)
authRouter.post("/login",logIn)
authRouter.get("/logout",logOut)
authRouter.post("/sendotp",sendOtp)
authRouter.post("/verifyotp",verifyOtp)
authRouter.post("/resetpassword",resetPassword)

export default authRouter;
import express from "express"
import { logIn, logOut, signup } from "../controller/authController.js"

const authRouter = express.Router()

authRouter.post("/signup",signup)
authRouter.post("/login",logIn)
authRouter.get("/logout",logOut)

export default authRouter;
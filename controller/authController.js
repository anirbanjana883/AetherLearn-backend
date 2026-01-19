import User from "../models/userModel.js";
import validator from "validator";
import bcrypt from "bcryptjs";
import genToken from "../config/token.js";
import { emailQueue } from "../config/queue.js"; 
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

// SIGNUP
export const signup = asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body;

    const existedUser = await User.findOne({ email });
    if (existedUser) {
        throw new ApiError(409, "User with this email already exists");
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
        name,
        email,
        password: hashPassword,
        role
    });

    await emailQueue.add("send-welcome-email", {
        email: user.email,
        name: user.name,
        subject: "Welcome to AetherLearn! 🚀" 
    });

    const createdUser = await User.findById(user._id).select("-password");
    const token = await genToken(user._id);

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 7 * 60 * 60 * 1000
    };

    return res
        .status(201)
        .cookie("token", token, options)
        .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

// LOGIN 
export const logIn = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const token = await genToken(user._id);
    const loggedInUser = await User.findById(user._id).select("-password");

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        maxAge: 7 * 60 * 60 * 1000
    };

    return res
        .status(200)
        .cookie("token", token, options)
        .json(new ApiResponse(200, loggedInUser, "User logged in successfully"));
});

// LOGOUT 
export const logOut = asyncHandler(async (req, res) => {
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
    };

    return res
        .status(200)
        .clearCookie("token", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

// SEND OTP 
export const sendOtp = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) throw new ApiError(404, "User not found");

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    user.resetOtp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    user.isOtpVerified = false;
    await user.save();

    await emailQueue.add("send-otp-email", {
        email: user.email,
        otp: otp,
        subject: "Your AetherLearn OTP"
    });

    return res.status(200).json(new ApiResponse(200, {}, "OTP sent successfully"));
});

// VERIFY OTP 
export const verifyOtp = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.resetOtp !== otp || user.otpExpires < Date.now()) {
        throw new ApiError(400, "Invalid or expired OTP");
    }
    user.isOtpVerified = true;
    user.resetOtp = undefined;
    user.otpExpires = undefined;
    await user.save();
    return res.status(200).json(new ApiResponse(200, {}, "OTP verified successfully"));
});

// RESET PASSWORD 
export const resetPassword = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.isOtpVerified) {
        throw new ApiError(400, "OTP verification required before password reset");
    }
    user.password = await bcrypt.hash(password, 10);
    user.isOtpVerified = false;
    await user.save();
    return res.status(200).json(new ApiResponse(200, {}, "Password reset successfully"));
});

// GOOGLE AUTH 
export const googleAuth = asyncHandler(async (req, res) => {
    const { name, email, role } = req.body;
    
    let user = await User.findOne({ email });
    let isNewUser = false; 

    if (!user) {
        user = await User.create({ name, email, role: role || "student" });
        isNewUser = true; 
    }

    if (isNewUser) {
        await emailQueue.add("send-welcome-email", {
            email: user.email,
            name: user.name,
            subject: "Welcome to AetherLearn! 🚀"
        });
    }

    const token = await genToken(user._id);
    const options = { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === "production", 
        sameSite: "Strict", 
        maxAge: 7 * 60 * 60 * 1000 
    };

    return res
        .status(200)
        .cookie("token", token, options)
        .json(new ApiResponse(200, user, "Google Login Success"));
});
import dotenv from "dotenv";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
    },
    role: {
      type: String,
      enum: ["student", "educator"],
      required: true,
    },
    photoUrl: {
      type: String,
      default: "",
    },
    enrolledCourses: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Course",
        },
      ],
      default: [],
    },
    resetOtp: {
      type: String,
    },
    completedLectures: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Lecture",
        },
      ],
      default: [],
    },
    unlockedAchievements: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Achievement",
        },
      ],
      default: [],
    },
    otpExpires: {
      type: Date,
    },
    isOtpVerified: {
      type: Boolean,
      default: false,
    },
    currentStreak: { type: Number, default: 0 },
    lastActiveDate: { type: Date },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);
export default User;

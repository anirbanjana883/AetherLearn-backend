import dotenv from "dotenv";
import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
    },
    description: {
      type: String,
    },
    category: {
      type: String,
      required: true,
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced"],
    },
    price: {
      type: Number,
    },
    thumbnail: {
      type: String,
    },
    enrolledCount: { type: Number, default: 0 },
    lectures: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lecture",
      },
    ],
    creator: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isPublished: {
      type: Boolean,
      default: false,
    },
    avgRating: {
      type: Number,
      default: 0,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    totalLectures: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// for search
courseSchema.index({
    title: "text",
    subtitle: "text",
    category: "text",
    description: "text"
});

const Course = mongoose.model("Course", courseSchema);
export default Course;

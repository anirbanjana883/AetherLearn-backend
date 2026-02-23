import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },  
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
    }
  },
  { timestamps: true }
);

//  Database-level lock to prevent duplicate reviews
reviewSchema.index({ course: 1, user: 1 }, { unique: true });

// Index -> faster queries when loading the course page
reviewSchema.index({ course: 1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
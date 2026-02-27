import mongoose from "mongoose";

const lectureSchema = new mongoose.Schema(
  {
    lectureTitle: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["AWAITING_MEDIA", "PROCESSING", "READY", "FAILED"],
      default: "AWAITING_MEDIA",
    },
    rawVideoUrl: {
      type: String,
    },
    videoUrl: {
      type: String, 
    },
    publicId: {
      type: String,
    },
    duration: {
      type: Number,
      default: 0,
    },
    isPreviewFree: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Lecture = mongoose.model("Lecture", lectureSchema);
export default Lecture;

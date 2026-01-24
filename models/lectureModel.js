import mongoose from "mongoose";

const lectureSchema = new mongoose.Schema({
    lectureTitle: {
        type: String,
        required: true
    },
    videoUrl: {
        type: String,
    },
    status: {
        type: String,
        enum: ["pending", "processing", "ready", "failed"],
        default: "pending"
    },
    publicId: {
        type: String,
    },
    duration: {
        type: Number, 
        default: 0
    },
    isPreviewFree: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const Lecture = mongoose.model("Lecture", lectureSchema);
export default Lecture;
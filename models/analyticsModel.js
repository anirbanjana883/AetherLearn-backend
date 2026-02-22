import mongoose from "mongoose";

const courseAnalyticsSchema = new mongoose.Schema({
    courseId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Course', 
        required: true,
        unique: true, 
        index: true
    },
    totalViews: { 
        type: Number, 
        default: 0 
    },
    uniqueActiveUsers: { 
        type: Number, 
        default: 0 
    },
    lectureStats: {
        type: Map,
        of: new mongoose.Schema({
            views: { type: Number, default: 0 },
            totalWatchTime: { type: Number, default: 0 } 
        }, { _id: false }),
        default: {}
    }
}, { timestamps: true });

export default mongoose.model("CourseAnalytics", courseAnalyticsSchema);
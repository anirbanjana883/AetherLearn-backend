import mongoose from "mongoose";

const progressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', 
    required: true,
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
  },
  completedLectures: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture'
  }],
  watchTimes: {
    type: Map,
    of: Number,
    default: {}
  },
  lastWatchedLecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture'
  },
  date: {
    type: Date,
  },
  activityCount: {
    type: Number,
    default: 0,
  }
}, { timestamps: true });

// OPTIMIZATION: Compound Index - ultra-fast read/write speeds 
progressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

export default mongoose.model("Progress", progressSchema);
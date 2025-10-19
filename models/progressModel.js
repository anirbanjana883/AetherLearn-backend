import mongoose from "mongoose";

const progressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', 
    required: true,
  },
  date: {
    type: Date, 
    required: true,
  },
  activityCount: {
    type: Number,
    default: 1,
  },
});

// This is crucial: It ensures a user can only have one progress entry per day.
progressSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model("Progress", progressSchema);
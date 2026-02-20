import mongoose from "mongoose";

const activitySchema = new mongoose.Schema({
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

activitySchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model("Activity", activitySchema);
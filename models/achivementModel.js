import mongoose from "mongoose";

const achievementSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  description: {
    type: String,
    required: true,
  },
  icon: {
    type: String, 
    required: true,
  },
  trigger_event: {
    type: String,
    enum: ['STREAK', 'COURSES_ENROLLED', 'ACTIVITIES_LOGGED'], 
    required: true,
  },
  trigger_threshold: {
    type: Number, 
    required: true,
  },
});

export default mongoose.model("Achievement", achievementSchema);
import mongoose from "mongoose";
const sectionSchema = new mongoose.Schema({
    sectionTitle: String,
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    lectures: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lecture' }]
});
export default mongoose.model("Section", sectionSchema);
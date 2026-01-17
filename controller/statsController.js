import User from '../models/userModel.js';
import Progress from '../models/progressModel.js';
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// --- Helper Function (Internal) ---
const calculateStreak = (progressDates) => {
  if (progressDates.length === 0) return 0;

  const uniqueDates = new Set(progressDates.map(d => new Date(d).toISOString().split('T')[0]));
  const sortedDates = Array.from(uniqueDates).map(d => new Date(d)).sort((a, b) => b - a);
  
  let streak = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); 
  
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  if (sortedDates[0].getTime() === today.getTime() || sortedDates[0].getTime() === yesterday.getTime()) {
    streak = 1;
    let lastDate = sortedDates[0];

    for (let i = 1; i < sortedDates.length; i++) {
      const currentDate = sortedDates[i];
      const expectedPreviousDate = new Date(lastDate);
      expectedPreviousDate.setUTCDate(expectedPreviousDate.getUTCDate() - 1);

      if (currentDate.getTime() === expectedPreviousDate.getTime()) {
        streak++;
        lastDate = currentDate;
      } else {
        break;
      }
    }
  }
  return streak;
};

// --- Controllers ---

export const getCourseProgress = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const user = await User.findById(userId).populate({
    path: 'enrolledCourses',
    populate: { path: 'lectures', select: '_id' }
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const progressData = user.enrolledCourses.map(course => {
    const totalLectures = course.lectures.length;
    // Ensure accurate comparison by converting to strings
    const completedLecturesCount = course.lectures.filter(lecture => 
      user.completedLectures.some(cl => cl.toString() === lecture._id.toString())
    ).length;

    const progressPercentage = totalLectures > 0 
      ? Math.round((completedLecturesCount / totalLectures) * 100) 
      : 0;

    return {
      courseTitle: course.title,
      progress: progressPercentage,
    };
  });

  return res
    .status(200)
    .json(new ApiResponse(200, progressData, "Course progress fetched successfully"));
});

export const getStudentStats = asyncHandler(async (req, res) => {
  const userId = req.userId;

  // Fixed: Added 'activityCount' to selection so reduce works correctly
  const [user, progressHistory] = await Promise.all([
    User.findById(userId).populate('enrolledCourses'),
    Progress.find({ userId }).select('date activityCount -_id')
  ]);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const progressDates = progressHistory.map(p => p.date);
  const totalActivities = progressHistory.reduce((sum, item) => sum + (item.activityCount || 0), 0);

  const stats = {
    enrolledCount: user.enrolledCourses.length || 0,
    lecturesCompleted: totalActivities,
    currentStreak: calculateStreak(progressDates),
  };

  return res
    .status(200)
    .json(new ApiResponse(200, stats, "Student stats fetched successfully"));
});
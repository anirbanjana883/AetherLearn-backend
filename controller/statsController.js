import User from '../models/userModel.js';
import Progress from '../models/progressModel.js';

// --- This function calculates the course completion graph data ---
export const getCourseProgress = async (req, res) => {
  const userId = req.userId;

  try {
    const user = await User.findById(userId).populate({
      path: 'enrolledCourses',
      populate: { path: 'lectures', select: '_id' }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const progressData = user.enrolledCourses.map(course => {
      const totalLectures = course.lectures.length;
      const completedLecturesCount = course.lectures.filter(lecture => 
        user.completedLectures.includes(lecture._id)
      ).length;

      const progressPercentage = totalLectures > 0 
        ? Math.round((completedLecturesCount / totalLectures) * 100) 
        : 0;

      return {
        courseTitle: course.title,
        progress: progressPercentage,
      };
    });

    res.status(200).json(progressData);

  } catch (error) {
    console.error("Error fetching course progress:", error);
    res.status(500).json({ message: "Failed to fetch course progress" });
  }
};

const calculateStreak = (progressDates) => {
  if (progressDates.length === 0) return 0;

  // Create a set of unique date strings to handle multiple activities on the same day
  const uniqueDates = new Set(progressDates.map(d => new Date(d).toISOString().split('T')[0]));
  const sortedDates = Array.from(uniqueDates).map(d => new Date(d)).sort((a, b) => b - a);
  
  let streak = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Use UTC hours to be consistent with the database
  
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Check if the most recent activity was today or yesterday to start the streak
  if (sortedDates[0].getTime() === today.getTime() || sortedDates[0].getTime() === yesterday.getTime()) {
    streak = 1;
    let lastDate = sortedDates[0];

    // Loop through the rest of the dates to find consecutive days
    for (let i = 1; i < sortedDates.length; i++) {
      const currentDate = sortedDates[i];
      const expectedPreviousDate = new Date(lastDate);
      expectedPreviousDate.setUTCDate(expectedPreviousDate.getUTCDate() - 1);

      if (currentDate.getTime() === expectedPreviousDate.getTime()) {
        streak++;
        lastDate = currentDate;
      } else {
        // Break the loop if there's a gap in the dates
        break;
      }
    }
  }
  return streak;
};


// --- Main controller to get all student stats ---
export const getStudentStats = async (req, res) => {
  const userId = req.userId;

  try {
    // Fetch all necessary data from the database in parallel for efficiency
    const [user, progressHistory] = await Promise.all([
      User.findById(userId).populate('enrolledCourses'),
      Progress.find({ userId }).select('date -_id')
    ]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const progressDates = progressHistory.map(p => p.date);
    const totalActivities = progressHistory.reduce((sum, item) => sum + item.activityCount, 0);

    const stats = {
      enrolledCount: user.enrolledCourses.length || 0,
      lecturesCompleted: totalActivities, // Changed name for clarity
      currentStreak: calculateStreak(progressDates),
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching student stats:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
};
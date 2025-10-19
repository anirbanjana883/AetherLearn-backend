import Achievement from '../models/achivementModel.js';
import User from '../models/userModel.js';
import Progress from '../models/progressModel.js'; 

// You can copy the calculateStreak function from your statsController.js
const calculateStreak = (progressDates) => {
    // ... (same streak calculation logic as before) ...
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

export const checkAndAwardAchievements = async (userId) => {
  try {
    const [user, allAchievements, progressHistory] = await Promise.all([
      User.findById(userId),
      Achievement.find(),
      Progress.find({ userId })
    ]);

    if (!user) return;

    const userStats = {
      STREAK: calculateStreak(progressHistory.map(p => p.date)),
      COURSES_ENROLLED: user.enrolledCourses.length,
      ACTIVITIES_LOGGED: progressHistory.reduce((sum, item) => sum + item.activityCount, 0),
    };

    const newAchievements = [];

    for (const achievement of allAchievements) {
      // Check if user already has this achievement
      if (!user.unlockedAchievements.includes(achievement._id)) {
        // Check if user meets the criteria
        if (userStats[achievement.trigger_event] >= achievement.trigger_threshold) {
          newAchievements.push(achievement._id);
        }
      }
    }

    if (newAchievements.length > 0) {
      // Add the new achievements to the user's profile
      await User.findByIdAndUpdate(userId, {
        $push: { unlockedAchievements: { $each: newAchievements } }
      });
      console.log(`Awarded ${newAchievements.length} new achievements to user ${userId}`);
    }
  } catch (error) {
    console.error("Error checking for achievements:", error);
  }
};
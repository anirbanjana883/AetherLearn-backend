import Achievement from '../models/achivementModel.js';
import User from '../models/userModel.js';
import Activity from '../models/activityModel.js'; 

const calculateStreak = (activityDates) => {
    if (activityDates.length === 0) return 0;
    
    const uniqueDates = new Set(activityDates.map(d => new Date(d).toISOString().split('T')[0]));
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
    const [user, allAchievements, activityHistory] = await Promise.all([
      User.findById(userId),
      Achievement.find(),
      Activity.find({ userId }) 
    ]);

    if (!user) return;

    const userStats = {
      STREAK: calculateStreak(activityHistory.map(a => a.date)),
      COURSES_ENROLLED: user.enrolledCourses?.length || 0,
      ACTIVITIES_LOGGED: activityHistory.reduce((sum, item) => sum + item.activityCount, 0),
      LECTURES_COMPLETED: user.completedLectures?.length || 0 
    };

    const newAchievements = [];

    for (const achievement of allAchievements) {
      if (!user.unlockedAchievements.includes(achievement._id)) {
        if (userStats[achievement.trigger_event] >= achievement.trigger_threshold) {
          newAchievements.push(achievement._id);
        }
      }
    }

    if (newAchievements.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $addToSet: { unlockedAchievements: { $each: newAchievements } } 
      });
      console.log(`Awarded ${newAchievements.length} new achievements to user ${userId}`);
    }
  } catch (error) {
    console.error("Error checking for achievements:", error);
  }
};
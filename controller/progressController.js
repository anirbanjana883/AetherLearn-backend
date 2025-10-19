import Progress from '../models/progressModel.js';

/**
 * Marks an activity for the logged-in user for the current day.
 * If a record for today exists, it increments the count.
 * If not, it creates a new record.
 */
export const markProgress = async (req, res) => {
  const  userId = req.userId; // Assuming you get the user from your auth middleware

  // Normalize the date to the beginning of the day (to ignore the time)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // Find a record for this user on this day and increment its activityCount.
    // The 'upsert: true' option creates a new document if one doesn't exist.
    await Progress.findOneAndUpdate(
      { userId: userId, date: today },
      { $inc: { activityCount: 1 } }, // Use $inc to increment the count
      { upsert: true, new: true }
    );
    res.status(200).json({ message: "Progress marked successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error while marking progress" });
  }
};

/**
 * Gets the last year of progress data for the logged-in user.
 * This is used to populate the heatmap on the frontend.
 */
export const getProgress = async (req, res) => {
  const  userId  = req.userId;

  // Calculate the date one year ago from today
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  try {
    const progressData = await Progress.find({
      userId: userId,
      date: { $gte: oneYearAgo } // Find all records from the last year
    }).select('date activityCount -_id'); // Only select the fields we need

    // Format the data for the frontend heatmap library
    const formattedData = progressData.map(item => ({
      date: item.date.toISOString().split('T')[0], // Format: 'YYYY-MM-DD'
      count: item.activityCount,
    }));
    
    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch progress data" });
  }
};
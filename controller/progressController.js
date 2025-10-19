import Progress from '../models/progressModel.js';

export const markProgress = async (req, res) => {
  const  userId = req.userId; 

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {

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


export const getProgress = async (req, res) => {
  const  userId  = req.userId;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  try {
    const progressData = await Progress.find({
      userId: userId,
      date: { $gte: oneYearAgo } 
    }).select('date activityCount -_id'); 

    const formattedData = progressData.map(item => ({
      date: item.date.toISOString().split('T')[0], 
      count: item.activityCount,
    }));
    
    res.status(200).json(formattedData);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch progress data" });
  }
};
import User from '../models/userModel.js';

export const getMyAchievements = async (req, res) => {
  const userId = req.userId;
  try {
    const user = await User.findById(userId).populate('unlockedAchievements');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user.unlockedAchievements);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch achievements" });
  }
};
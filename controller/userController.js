import User from "../models/userModel.js";

export const getCurrentUser = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "user not found" });
    }
    return res.status(200).json(user);
  } catch (error) {
    return res.status(500).json({ message: `GetCurrentUser error ${error}` });
  }
};

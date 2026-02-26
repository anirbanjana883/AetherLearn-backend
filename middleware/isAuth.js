import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/userModel.js"; 

const isAuth = asyncHandler(async (req, res, next) => {
    let token = req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized access. No token provided.");
    }

    try {
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await User.findById(decodedToken.userId).select("-password");

        if (!user) {
            throw new ApiError(401, "User no longer exists.");
        }

        req.userId = user._id; 
        req.user = user; 
        
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            throw new ApiError(401, "Session expired. Please log in again.");
        }
        throw new ApiError(401, "Invalid or manipulated token.");
    }
});

export default isAuth;
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const isAuth = asyncHandler(async (req, res, next) => {
    let token = req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "Unauthorized access. No token provided.");
    }

    try {
        // cryptographic token verification
        const verifyToken = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = verifyToken.userId;
        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            throw new ApiError(401, "Session expired. Please log in again.");
        }
        throw new ApiError(401, "Invalid or manipulated token.");
    }
});

export default isAuth;
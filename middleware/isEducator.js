import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const isEducator = asyncHandler(async (req, res, next) => {

    if (!req.user) {
        throw new ApiError(401, "Authentication required");
    }
    if (req.user.role !== "educator") {
        throw new ApiError(403, "Access denied. Only educators can access this resource.");
    }

    next();
});
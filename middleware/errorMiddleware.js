import { ApiError } from "../utils/ApiError.js";
import { ZodError } from "zod"; 

const errorHandler = (err, req, res, next) => {
    let error = err;

    if (error instanceof ZodError) {
        const message = error.errors.map((e) => e.message).join(", ");
        error = new ApiError(400, message);
    }

    if (!(error instanceof ApiError)) {
        const statusCode = error.statusCode || 500;
        const message = error.message || "Something went wrong";
        error = new ApiError(statusCode, message, error?.errors || [], error.stack);
    }

    const response = {
        success: false, 
        statusCode: error.statusCode,
        message: error.message,
        errors: error.errors || [],
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
    };

    return res.status(error.statusCode).json(response);
};

export { errorHandler };
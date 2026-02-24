import { ApiError } from "../utils/ApiError.js";
import { ZodError } from "zod";

export const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body); 
        next();
    } catch (err) {
        if (err instanceof ZodError) {
            const extractedErrors = err.errors
                .map((error) => `${error.message}`) 
                .join(" | ");
            
            return next(new ApiError(400, extractedErrors));
        }
        
        next(err);
    }
};
import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => (req, res, next) => {
    try {
        req.body = schema.parse(req.body); 
        next();
    } catch (err) {
        const extractedErrors = err.errors.map((error) => `${error.path.join('.')}: ${error.message}`).join(", ");
        next(new ApiError(400, `Validation Error: ${extractedErrors}`));
    }
};
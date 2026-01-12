import { ApiError } from "../utils/ApiError.js";

export const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (err) {
    const extractedErrors = err.errors.map((error) => error.message).join(", ");
    next(new ApiError(400, extractedErrors));
  }
};
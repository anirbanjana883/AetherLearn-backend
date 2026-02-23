import express from 'express';
import { 
    addReview, 
    editReview, 
    getCourseReviews,
    getAllReviews 
} from '../controller/reviewController.js';
import isAuth from '../middleware/isAuth.js';

const reviewRouter = express.Router();

// Get ALL reviews across the platform (For Homepage Testimonials)
reviewRouter.get("/", getAllReviews);

// Get reviews for a SPECIFIC course (For Course Landing Page)
reviewRouter.get("/course/:courseId", getCourseReviews);

// Add a new review to a course (Protected)
reviewRouter.post("/course/:courseId", isAuth, addReview);

// Edit an existing review (Protected)
reviewRouter.put("/:reviewId", isAuth, editReview);

export default reviewRouter;
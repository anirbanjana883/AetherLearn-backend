import Course from "../models/courseModel.js";
import Review from "../models/reviewModel.js";
import User from "../models/userModel.js";

export const createReview = async (req, res) => {
  try {
    const { rating, comment, courseId } = req.body;
    const userId = req.userId;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    //  Check enrollment
    const user = await User.findById(userId);
    const isEnrolled = user.enrolledCourses.some(
      (enrolledCourse) => enrolledCourse.toString() === courseId
    );

    if (!isEnrolled)
      return res
        .status(403)
        .json({
          message: "You must be enrolled in this course to leave a review",
        });

    const alreadyReviewed = await Review.findOne({
      course: courseId,
      user: userId,
    });
    // onr person one review
    if (alreadyReviewed) {
      return res
        .status(400)
        .json({ message: "This Course is already reviewed by you" });
    }
    // first time review
    const review = new Review({
      course: courseId,
      user: userId,
      rating,
      comment,
    });
    await review.save();
    await course.reviews.push(review._id);
    await course.save();
    return res.status(200).json(review);
  } catch (error) {
    return res
      .status(500)
      .json({ message: `Failed to create review ${error}` });
  }
};

export const getReviews = async (req, res) => {
  try {
    const review = await Review.find()
      .populate("user", "name photoUrl description")
      .populate("course", "title")
      .sort({ reviewedAt: -1 });
    return res.status(200).json(review);
  } catch (error) {
    return res.status(500).json({ message: `Failed to fetch review ${error}` });
  }
};

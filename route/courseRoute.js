import express from "express";
import multer from "multer";

import isAuth from "../middleware/isAuth.js";
import upload from "../middleware/multer.js";
import { isEducator } from "../middleware/isEducator.js";

import {
  createCourse,
  createSection,
  createLecture,
  editCourse,
  editLecture,
  getCourseById,
  getCourseLecture,
  getCreatorCourses,
  getPublishedCourses,
  removeCourse,
  removeLecture,
  initChunkUpload,
  uploadChunk,
  completeChunkUpload,
  getCreatorById,
  markLectureAsComplete,
  removeSection,
  editSection,
} from "../controller/courseController.js";
import { searchWithAi } from "../controller/searchController.js";

const courseRouter = express.Router();

// ---------------------------------------------------------
// CHUNKED VIDEO UPLOAD STORAGE (Bypasses RAM Limits)
// Used when educator uploads large lecture videos
// ---------------------------------------------------------
const chunkMulter = multer({ dest: "./temp/uploads/" });

// =========================================================
// 🟢 COURSE ROUTES
// =========================================================

// Create a new course (Educator Only)
courseRouter.post("/", isAuth, isEducator, createCourse);

// Get all published courses (Homepage listing for students)
courseRouter.get("/", getPublishedCourses);

// Get all courses created by logged-in educator
courseRouter.get("/creator", isAuth, isEducator, getCreatorCourses);

// Get full course details (sections, basic info)
courseRouter.get("/:courseId", isAuth, getCourseById);

// Edit course metadata (title, thumbnail, publish etc.)
courseRouter.patch(
  "/:courseId",
  isAuth,
  isEducator,
  upload.single("thumbnail"),
  editCourse,
);

// Delete a course (Educator Only)
courseRouter.delete("/:courseId", isAuth, isEducator, removeCourse);

// =========================================================
// 🟢 SECTION ROUTES
// =========================================================

// Create a section under a course
courseRouter.post("/:courseId/sections", isAuth, isEducator, createSection);

// delete a section under a course
courseRouter.delete(
  "/:courseId/sections/:sectionId",
  isAuth,
  isEducator,
  removeSection
);

// edit a section under a course
courseRouter.patch(
  "/:courseId/sections/:sectionId",
  isAuth,
  isEducator,
  editSection
);

// =========================================================
// 🟢 LECTURE ROUTES
// =========================================================

// Create lecture slot under a section
courseRouter.post(
  "/:courseId/sections/:sectionId/lectures",
  isAuth,
  isEducator,
  createLecture,
);

// Fetch course lectures (Student access for learning)
courseRouter.get("/:courseId/lectures", isAuth, getCourseLecture);

// Edit lecture metadata (title, preview flag etc.)
courseRouter.patch("/lectures/:lectureId", isAuth, isEducator, editLecture);

// Remove lecture from a section
courseRouter.delete(
  "/sections/:sectionId/lectures/:lectureId",
  isAuth,
  isEducator,
  removeLecture,
);

// =========================================================
// 🟢 VIDEO UPLOAD PIPELINE (Chunked)
// =========================================================

// Initialize chunk upload session
courseRouter.post("/uploads/init", isAuth, isEducator, initChunkUpload);

// Upload individual video chunk
courseRouter.post(
  "/uploads/chunk",
  isAuth,
  isEducator,
  chunkMulter.single("chunk"),
  uploadChunk,
);

// Complete upload & trigger video processing queue
courseRouter.post("/uploads/complete", isAuth, isEducator, completeChunkUpload);


// ---------------------------------------------------------
// MISC ROUTES
// ---------------------------------------------------------
courseRouter.post("/creator", isAuth, getCreatorById);
courseRouter.post("/search", isAuth, searchWithAi);
courseRouter.post("/complete", isAuth, markLectureAsComplete);


export default courseRouter;

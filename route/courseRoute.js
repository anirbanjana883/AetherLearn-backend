import express from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth.js";
import upload from "../middleware/multer.js"; 

import { 
    createCourse, 
    createSection, 
    createLecture, 
    editCourse, 
    editLecture, 
    getCourseById, 
    getCourseLecture, 
    getCreatorById, 
    getCreatorCourses, 
    getPublishedCourses, 
    markLectureAsComplete, 
    removeCourse, 
    removeLecture,
    initChunkUpload,
    uploadChunk,
    completeChunkUpload
} from "../controller/courseController.js";
import { searchWithAi } from "../controller/searchController.js";

const courseRouter = express.Router();

// FAST DISK STORAGE FOR CHUNKS (Bypasses RAM limits)
const chunkMulter = multer({ dest: './temp/uploads/' });

// ---------------------------------------------------------
// COURSE ROUTES
// ---------------------------------------------------------
courseRouter.post("/create", isAuth, createCourse); 
courseRouter.get("/getpublished", getPublishedCourses); 
courseRouter.get("/getcreator", isAuth, getCreatorCourses);
courseRouter.post("/editcourse/:courseId", isAuth, upload.single("thumbnail"), editCourse);
courseRouter.get("/getcourse/:courseId", isAuth, getCourseById);
courseRouter.delete("/remove/:courseId", isAuth, removeCourse);

// ---------------------------------------------------------
// SECTION & LECTURE ROUTES (HIERARCHY)
// ---------------------------------------------------------
courseRouter.post("/:courseId/section", isAuth, createSection);
courseRouter.post("/:sectionId/lecture", isAuth, createLecture);
courseRouter.get("/courselecture/:courseId", isAuth, getCourseLecture);

// Edit Lecture is now strictly for metadata, NOT video uploads
courseRouter.post("/editlecture/:lectureId", isAuth, editLecture);
courseRouter.delete("/removelecture/:sectionId/:lectureId", isAuth, removeLecture);

// ---------------------------------------------------------
// CHUNKED VIDEO UPLOAD PIPELINE
// ---------------------------------------------------------
courseRouter.post("/upload/initialize", isAuth, initChunkUpload);
courseRouter.post("/upload/chunk", isAuth, chunkMulter.single("chunk"), uploadChunk);
courseRouter.post("/upload/complete", isAuth, completeChunkUpload);

// ---------------------------------------------------------
// MISC ROUTES
// ---------------------------------------------------------
courseRouter.post("/creator", isAuth, getCreatorById);
courseRouter.post("/search", isAuth, searchWithAi);
courseRouter.post("/complete", isAuth, markLectureAsComplete);

export default courseRouter;
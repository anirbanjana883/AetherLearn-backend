import express from "express"
import isAuth from "../middleware/isAuth.js"
import upload from "../middleware/multer.js"
import { createCourse, createLecture, editCourse, editLecture, getCourseById, getCourseLecture, getCreatorById, getCreatorCourses, getPublishedCourses, removeCourse, removeLecture } from "../controller/courseController.js"
import { searchWithAi } from "../controller/searchController.js"

const courseRouter = express.Router()

courseRouter.post("/create",isAuth,createCourse) // created only requested
courseRouter.get("/getpublished",getPublishedCourses) // always creatyed in home 
courseRouter.get("/getcreator",isAuth,getCreatorCourses)
courseRouter.post("/editcourse/:courseId",isAuth,upload.single("thumbnail"),editCourse)
courseRouter.get("/getcourse/:courseId",isAuth,getCourseById)
courseRouter.delete("/remove/:courseId",isAuth,removeCourse)


// lecture

courseRouter.post("/createlecture/:courseId",isAuth,createLecture)
courseRouter.get("/courselecture/:courseId",isAuth,getCourseLecture)
courseRouter.post("/editlecture/:lectureId",isAuth,upload.single("videoUrl"),editLecture)
courseRouter.delete("/removelecture/:lectureId",isAuth,removeLecture)

// get creator
courseRouter.post("/creator",isAuth,getCreatorById)


// search wtth ai
courseRouter.post("/search",isAuth,searchWithAi)


export default courseRouter
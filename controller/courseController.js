import Course from "../models/courseModel.js";
import uploadOnCludinary from "../config/cloudinary.js";

export const createCourse = async (req,res)=>{
    try {
        const {title , category} = req.body
        if(!title || !category){
            return res.status(400).json({message:"Title or Category required"})
        }

        const course = await Course.create({
            title,
            category,
            creator: req.userId
        })
        return res.status(201).json(course)
    } catch (error) {
        return res.status(500).json({ message: `Create course error ${error}` });
    }
}

export const getPublishedCourses = async (req,res)=>{
    try {
        const courses = await Course.find({isPublished : true})
        if(!courses){
            return res.status(400).json({message:" No published couses found"})
        }
        return res.status(200).json(courses)
    } catch (error) {
        return res.status(500).json({ message: `Failed to get published courses ${error}` });
    }
}

export const getCreatorCourses = async (req,res)=>{
    try {
        const userId = req.userId
        const courses = await Course.find({creator:userId})
        if(!courses){
            return res.status(400).json({message:" No couses found for this creator"})
        }
        return res.status(200).json(courses)
    } catch (error) {
        return res.status(500).json({ message: `Failed to get creator courses ${error}` });
    }
}

export const editCourse = async (req,res)=>{
    try {
        const {courseId} = req.params
        const {
            title,
            subTitle,
            description,
            category,
            level,
            isPublished,
            price,
        } = req.body

        // thumbnail not mandatory
        let thumbnail
        if(req.file){
            thumbnail = await uploadOnCludinary(req.file.path)
        }

        let course = await Course.findById(courseId)
        if(!course){
            return res.status(400).json({message:" No couses found for editing"})
        }
        const updateData = {title,subTitle,description,category,level,isPublished,price,thumbnail}

        course = await  Course.findByIdAndUpdate(courseId,updateData,{new:true})

        return res.status(200).json(course)
    } catch (error) {
        return res.status(500).json({ message: `Failed to edit courses ${error}` });
    }
}

// direct finding course by id
export const getCourseById = async (req,res)=>{
    try {
        const {courseId} = req.params
        let course = await Course.findById(courseId)
        if(!course){
            return res.status(400).json({message:" No couses found for editing"})
        }
        return res.status(200).json(course)
    } catch (error) {
        return res.status(500).json({ message: `Failed to get courses by id ${error}` });
    }
}

export const removeCourse = async (req,res)=>{
    try {
        const {courseId} = req.params
        let course = await Course.findById(courseId)
        if(!course){
            return res.status(400).json({message:" No couses found for editing"})
        }
        course = await Course.findByIdAndDelete(courseId,{new:true})
        return res.status(200).json({ message: `Course removed successfully` })
    } catch (error) {
         return res.status(500).json({ message: `Failed to delete courses ${error}` });
    }
}
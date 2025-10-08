import Course from "../models/courseModel.js";
import Lecture from "../models/lectureModel.js";
import uploadOnCludinary from "../config/cloudinary.js";


// course 


export const createCourse = async (req,res)=>{
    try {
        const {title , category , subtitle } = req.body
        if(!title || !category){
            return res.status(400).json({message:"Title or Category required"})
        }

        const course = await Course.create({
            title,
            category,
            subtitle,
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
            subtitle,
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
        const updateData = {title,subtitle,description,category,level,isPublished,price,thumbnail}

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


// lecture


export const createLecture = async (req, res) => {
  try {
    const { lectureTitle } = req.body;
    const { courseId } = req.params;

    if (!lectureTitle || !courseId) {
      return res.status(400).json({ message: "Lecture title and course ID are required" });
    }

    const lecture = await Lecture.create({ lectureTitle });

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    course.lectures.push(lecture._id);
    await course.save();

    await course.populate("lectures");

    return res.status(201).json({ lecture, course });
  } catch (error) {
    return res.status(500).json({ message: `Lecture creation failed: ${error.message}` });
  }
};


export const getCourseLecture = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId).populate("lectures");
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    await course.populate("lectures")
    await course.save()
    return res.status(201).json(course);
  } catch (error) {
    return res.status(500).json({ message: `Failed to fetch lectures: ${error.message}` });
  }
};


export const editLecture = async (req,res) =>{
    try {
        const {lectureId} = req.params;
        const {isPreviewFree , lectureTitle} = req.body
        const lecture = await Lecture.findById(lectureId)
        if(!lecture){
            return res.status(404).json({ message: "Lecture not found" });
        } 

        let videoUrl
        if(req.file){
            videoUrl = await uploadOnCludinary(req.file.path)
            lecture.videoUrl = videoUrl
        }
        if(lectureTitle){
            lecture.lectureTitle = lectureTitle
        }
        lecture.isPreviewFree = isPreviewFree

        await lecture.save()
        return res.status(200).json(lecture);
    } catch (error) {
        return res.status(500).json({ message: `Failed to edit lectures: ${error.message}` });        
    }
} 

export const removeLecture = async (req,res)=>{
    try {
        const {lectureId} = req.params
        const lecture = await Lecture.findByIdAndDelete(lectureId)

        if(!lecture){
            return res.status(404).json({ message: "Lecture not found" });
        }
        await Course.updateOne(
            {lectures : lectureId},
            {$pull : {lectures : lectureId}}
        )
        return res.status(200).json({message : "Lecture removed successfully"});
    } catch (error) {
        return res.status(500).json({ message: `Failed to remove lectures: ${error.message}` });
    }
}
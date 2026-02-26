import Course from "../models/courseModel.js";
import Lecture from "../models/lectureModel.js";
import Section from "../models/sectionModel.js";
import User from "../models/userModel.js";
import Progress from "../models/progressModel.js";
import uploadOnCloudinary from "../config/cloudinary.js";
import { checkAndAwardAchievements } from "../services/achievementService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import redisClient from "../config/redis.js";
import { videoQueue } from "../config/queue.js";
import mongoose from "mongoose";

import path from "path";
import fs from 'fs-extra';

// COURSE CONTROLLERS
export const createCourse = asyncHandler(async (req, res) => {
  const { title, category, subtitle } = req.body;

  if (!title || !category) {
    throw new ApiError(400, "Title or Category required");
  }

  const course = await Course.create({
    title,
    category,
    subtitle,
    creator: req.userId,
  });

  await redisClient.del("all_courses");

  return res
    .status(201)
    .json(new ApiResponse(201, course, "Course created successfully"));
});

export const getPublishedCourses = asyncHandler(async (req, res) => {
  const cacheKey = "all_courses";

  const cachedCourses = await redisClient.get(cacheKey);

  if (cachedCourses) {
    const data =
      typeof cachedCourses === "string"
        ? JSON.parse(cachedCourses)
        : cachedCourses;

    return res
      .status(200)
      .json(new ApiResponse(200, data, "Published courses fetched from Cache"));
  }

  // Fetch from DB
  const courses = await Course.find({ isPublished: true })
    .select("title thumbnail price avgRating reviewCount instructor")
    .populate("instructor", "name profileImage");

  if (!courses) {
    return res.status(200).json(new ApiResponse(200, [], "No courses found"));
  }

  await redisClient.set(cacheKey, JSON.stringify(courses), { ex: 3600 });

  return res
    .status(200)
    .json(
      new ApiResponse(200, courses, "Published courses fetched from Database"),
    );
});

export const getCreatorCourses = asyncHandler(async (req, res) => {
  const userId = req.userId;

  const courses = await Course.find({ creator: userId })
    .populate({
      path: "sections",
      select: "title lectures",
    })
    .sort({ createdAt: -1 });
  if (!courses || courses.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], "No courses found for this creator"));
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, courses, "Creator courses fetched successfully"),
    );
});

export const editCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const { title, subtitle, description, category, level, isPublished, price } =
    req.body;

  let thumbnailUrl;
  if (req.file) {
    const uploadedUrl = await uploadOnCloudinary(req.file.path);

    if (!uploadedUrl) {
      throw new ApiError(500, "Thumbnail upload failed");
    }

    thumbnailUrl = uploadedUrl; 
    console.log("DEBUG: Thumbnail URL successfully generated:", thumbnailUrl);
  }

  const oldCourse = await Course.findById(courseId).select("isPublished");
  if (!oldCourse) {
    throw new ApiError(404, "Course not found");
  }

  // Partial Update Object
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (subtitle !== undefined) updateData.subtitle = subtitle;
  if (description !== undefined) updateData.description = description;
  if (category !== undefined) updateData.category = category;
  if (level !== undefined) updateData.level = level;
  if (isPublished !== undefined) updateData.isPublished = isPublished;
  if (price !== undefined) updateData.price = price;
  if (thumbnailUrl) updateData.thumbnail = thumbnailUrl;

  const updatedCourse = await Course.findOneAndUpdate(
    { _id: courseId, creator: req.userId },
    { $set: updateData },
    { new: true },
  );

  if (!updatedCourse) {
    throw new ApiError(403, "Not authorized to edit this course");
  }

  // Invalidate Cache
  await redisClient.del(`course:${courseId}`);
  if (
    updateData.isPublished !== undefined &&
    updateData.isPublished !== oldCourse.isPublished
  ) {
    await redisClient.del("all_courses");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedCourse, "Course updated successfully"));
});

export const getCourseById = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const cacheKey = `course:${courseId}`;

  try {
    const cachedCourse = await redisClient.get(cacheKey);
    if (cachedCourse) {
      const data =
        typeof cachedCourse === "string"
          ? cachedCourse === "[object Object]"
            ? null
            : JSON.parse(cachedCourse)
          : cachedCourse;

      if (data) {
        return res
          .status(200)
          .json(new ApiResponse(200, data, "Course fetched from cache"));
      }
    }

    const course = await Course.findById(courseId).populate({
      path: "sections",
      populate: { path: "lectures" },
    });

    if (!course) {
      throw new ApiError(404, "Course not found");
    }

    await redisClient.set(cacheKey, JSON.stringify(course), { ex: 3600 });

    return res.status(200).json(new ApiResponse(200, course, "Success"));
  } catch (error) {
    console.error("POPULATION ERROR:", error.message);
    throw new ApiError(
      500,
      error.message || "Internal Server Error during population",
    );
  }
});

export const removeCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) throw new ApiError(404, "Course not found");
  if (course.creator.toString() !== req.userId)
    throw new ApiError(403, "Not authorized");

  //  ACID TRANSACTION: Cascade delete everything or nothing
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const sections = await Section.find({ courseId }).session(session);
    const sectionIds = sections.map((sec) => sec._id);

    await Lecture.deleteMany({ sectionId: { $in: sectionIds } }).session(
      session,
    );
    await Section.deleteMany({ courseId }).session(session);
    await Course.findByIdAndDelete(courseId).session(session);

    await session.commitTransaction();

    await redisClient.del("all_courses");
    await redisClient.del(`course:${courseId}`);

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Course completely removed"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const createSection = asyncHandler(async (req, res) => {
  const { sectionTitle } = req.body;
  const { courseId } = req.params;

  if (!sectionTitle) throw new ApiError(400, "Section title is required");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const course = await Course.findById(courseId).session(session);
    if (!course) throw new ApiError(404, "Course not found");

    const [section] = await Section.create([{ sectionTitle, courseId }], {
      session,
    });

    course.sections.push(section._id);
    await course.save({ session });

    await session.commitTransaction();
    await redisClient.del(`course:${courseId}`);

    return res
      .status(201)
      .json(new ApiResponse(201, section, "Section created successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const removeSection = asyncHandler(async (req, res) => {
  const { sectionId, courseId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const section = await Section.findById(sectionId).session(session);
    if (!section) throw new ApiError(404, "Section not found");

    const lectureIds = section.lectures || [];
    const lectureCount = lectureIds.length;

    await Lecture.deleteMany({
      _id: { $in: lectureIds }
    }).session(session);

    await Course.findByIdAndUpdate(
      courseId,
      {
        $pull: { sections: sectionId },
        $inc: { totalLectures: -lectureCount }
      }
    ).session(session);

    await Section.findByIdAndDelete(sectionId).session(session);

    await redisClient.del(`course:${courseId}`);
    await redisClient.del(`courseMeta:${courseId}`);

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Section and its lectures removed successfully"));

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const editSection = asyncHandler(async (req, res) => {
  const { sectionId, courseId } = req.params;
  const { sectionTitle } = req.body;

  if (!sectionTitle) {
    throw new ApiError(400, "Section title is required");
  }

  const course = await Course.findOne({
    _id: courseId,
    creator: req.userId,
  });

  if (!course) {
    throw new ApiError(403, "Not authorized to edit this section");
  }

  const updatedSection = await Section.findOneAndUpdate(
    { _id: sectionId, courseId },
    { $set: { sectionTitle } },
    { new: true }
  );

  if (!updatedSection) {
    throw new ApiError(404, "Section not found");
  }

  await redisClient.del(`course:${courseId}`);

  return res.status(200).json(
    new ApiResponse(200, updatedSection, "Section updated successfully")
  );
});

// LECTURE CONTROLLERS

export const createLecture = asyncHandler(async (req, res) => {
  const { lectureTitle } = req.body;
  const { sectionId } = req.params;

  if (!lectureTitle) throw new ApiError(400, "Lecture title is required");

  // ACID TRANSACTION: Ensure Lecture and Section sync perfectly
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const section = await Section.findById(sectionId).session(session);
    if (!section) throw new ApiError(404, "Section not found");

    const [lecture] = await Lecture.create(
      [
        {
          lectureTitle,
          status: "UPLOADING",
        },
      ],
      { session },
    );

    section.lectures.push(lecture._id);

    await section.save({ session });

    await Course.findByIdAndUpdate(section.courseId, {
      $inc: { totalLectures: 1 },
    }).session(session);
    await redisClient.del(`courseMeta:${section.courseId}`);

    await session.commitTransaction();

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          lecture,
          "Lecture slot created. Ready for video upload.",
        ),
      );
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const getCourseLecture = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId).populate({
    path: "sections",
    populate: {
      path: "lectures"
    }
  });
  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, course, "Lectures fetched successfully"));
});

// Async Video Processing - Cloudinary Flow
export const editLecture = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;
  const { isPreviewFree, lectureTitle } = req.body;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    throw new ApiError(404, "Lecture not found");
  }

  if (req.file) {
    const cloudResponse = await uploadOnCloudinary(req.file.path);

    if (!cloudResponse) {
      throw new ApiError(500, "Failed to upload raw video to Cloudinary");
    }

    // Cloudinary URL saved in DB (Status: UPLOADING/PROCESSING)
    lecture.status = "PROCESSING";
    lecture.rawVideoUrl = cloudResponse.url; // Store raw URL temporarily
    lecture.videoUrl = "";
    await lecture.save();

    // Push Job to BullMQ Queue
    await videoQueue.add("transcode-video", {
      lectureId: lecture._id,
      rawVideoUrl: cloudResponse.url,
      instructorId: req.userId,
    });
  }

  if (lectureTitle) lecture.lectureTitle = lectureTitle;
  if (isPreviewFree !== undefined) lecture.isPreviewFree = isPreviewFree;

  await lecture.save();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        lecture,
        "Raw video uploaded. Processing started in background ⏳",
      ),
    );
});

export const removeLecture = asyncHandler(async (req, res) => {
  const { lectureId, sectionId } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const lecture = await Lecture.findByIdAndDelete(lectureId).session(session);
    if (!lecture) throw new ApiError(404, "Lecture not found");

    const section = await Section.findByIdAndUpdate(sectionId, {
      $pull: { lectures: lectureId },
    }).session(session);

    if (!section) throw new ApiError(404, "Section not found");

    //  Decrement the O(1) totalLectures counter on the parent Course
    await Course.findByIdAndUpdate(section.courseId, {
      $inc: { totalLectures: -1 },
    }).session(session);

    await redisClient.del(`courseMeta:${section.courseId}`);

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Lecture removed successfully"));
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

// CHUNKED VIDEO UPLOAD PIPELINE

export const initChunkUpload = asyncHandler(async (req, res) => {
  const { lectureId } = req.body;
  const uploadId = `${lectureId}-${Date.now()}`;
  return res
    .status(200)
    .json(new ApiResponse(200, { uploadId }, "Upload initialized"));
});

export const uploadChunk = asyncHandler(async (req, res) => {
  const { uploadId, chunkIndex } = req.body;
  const chunk = req.file;

  if (!chunk) throw new ApiError(400, "No chunk provided");

  const chunkDir = path.join(UPLOAD_DIR, uploadId);
  await fs.ensureDir(chunkDir);

  const chunkPath = path.join(chunkDir, chunkIndex);
  await fs.rename(chunk.path, chunkPath);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, `Chunk ${chunkIndex} received`));
});

/** 
 Chunk Upload
    ↓
Stitch
    ↓
Upload RAW once
    ↓
Push RAW URL to Queue
    ↓
Worker downloads
    ↓
Compress
    ↓
Upload FINAL
    ↓
Update DB

 * **/

const UPLOAD_DIR = path.resolve("./temp/uploads");
export const completeChunkUpload = asyncHandler(async (req, res) => {
  const { uploadId, totalChunks, lectureId } = req.body;

  const chunkDir = path.join(UPLOAD_DIR, uploadId);
  const finalFilePath = path.join(UPLOAD_DIR, `${uploadId}.mp4`);

  //  Stitch chunks together locally
  const writeStream = fs.createWriteStream(finalFilePath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunkDir, i.toString());
    if (!fs.existsSync(chunkPath)) {
      throw new ApiError(400, `Missing chunk: ${i}`);
    }
    const data = await fs.readFile(chunkPath);
    writeStream.write(data);
    await fs.remove(chunkPath);
  }

  writeStream.end();
  await fs.remove(chunkDir);

  //  Upload RAW to Cloudinary
  const cloudRaw = await uploadOnCloudinary(finalFilePath);
  if (!cloudRaw) {
    throw new ApiError(500, "Failed to persist raw video to Cloudinary");
  }

  // 3. Delete the local file immediately to save disk space
  await fs.remove(finalFilePath);

  // 4. Update Database
  const lecture = await Lecture.findByIdAndUpdate(lectureId, {
    status: "PROCESSING",
    rawVideoUrl: cloudRaw.url,
  });

  // 5. Push Job to Queue using the safe Cloudinary URL
  await videoQueue.add("transcode-video", {
    lectureId: lecture._id,
    rawVideoUrl: cloudRaw.url,
    instructorId: req.userId,
  });

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "Upload complete. Video safely stored and processing started ⏳",
      ),
    );
});

// USER / PROGRESS CONTROLLERS

export const getCreatorById = asyncHandler(async (req, res) => {
  const { userId } = req.body;

  const cachedCreator = await redisClient.get(`creator:${userId}`);

  if (cachedCreator) {
    const data =
      typeof cachedCreator === "string"
        ? JSON.parse(cachedCreator)
        : cachedCreator;
    return res
      .status(200)
      .json(new ApiResponse(200, data, "Fetched from Cache"));
  }

  const user = await User.findById(userId).select("-password");

  if (!user) {
    throw new ApiError(404, "Creator not found");
  }

  await redisClient.set(`creator:${userId}`, JSON.stringify(user), {
    EX: 3600,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Creator fetched successfully"));
});

export const markLectureAsComplete = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { lectureId, date } = req.body;

  if (!lectureId || !date) {
    throw new ApiError(400, "Lecture ID and date are required");
  }

  const userToday = new Date(date);

  await Progress.findOneAndUpdate(
    { userId: userId, date: userToday },
    { $inc: { activityCount: 1 } },
    { upsert: true, new: true },
  );

  await User.findByIdAndUpdate(userId, {
    $addToSet: { completedLectures: lectureId },
  });

  await checkAndAwardAchievements(userId);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        {},
        "Lecture marked as complete and progress recorded",
      ),
    );
});

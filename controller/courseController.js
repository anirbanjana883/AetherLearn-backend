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

  const courses = await Course.find({ isPublished: true })
    .populate({
      path: "sections",
      populate: { path: "lectures" },
    })
    .populate("reviews");

  if (!courses || courses.length === 0) {
    throw new ApiError(404, "No published courses found");
  }

  await redisClient.set(cacheKey, JSON.stringify(courses), { EX: 3600 });

  return res
    .status(200)
    .json(
      new ApiResponse(200, courses, "Published courses fetched from Database"),
    );
});

export const getCreatorCourses = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const courses = await Course.find({ creator: userId }).populate("sections");

  if (!courses) {
    throw new ApiError(404, "No courses found for this creator");
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

  let thumbnail;
  if (req.file) {
    thumbnail = await uploadOnCloudinary(req.file.path);
  }

  let course = await Course.findById(courseId);
  if (!course) {
    throw new ApiError(404, "No course found for editing");
  }

  if (course.creator.toString() !== req.userId) {
    throw new ApiError(403, "Not authorized to edit this course");
  }

  const updateData = {
    title,
    subtitle,
    description,
    category,
    level,
    isPublished,
    price,
    ...(thumbnail && { thumbnail }),
  };

  course = await Course.findByIdAndUpdate(courseId, updateData, { new: true });

  await redisClient.del("all_courses");
  await redisClient.del(`course:${courseId}`);

  return res
    .status(200)
    .json(new ApiResponse(200, course, "Course updated successfully"));
});

export const getCourseById = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const cacheKey = `course:${courseId}`;

  let cachedCourse = await redisClient.get(cacheKey);
  if (cachedCourse) {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          JSON.parse(cachedCourse),
          "Course fetched from cache",
        ),
      );
  }

  let course = await Course.findById(courseId).populate({
    path: "sections",
    populate: { path: "lectures" },
  });

  if (!course) {
    throw new ApiError(404, "Course not found");
  }

  await redisClient.set(cacheKey, JSON.stringify(course), { EX: 3600 });

  return res
    .status(200)
    .json(new ApiResponse(200, course, "Course fetched successfully"));
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
          status: "AWAITING_MEDIA",
        },
      ],
      { session },
    );

    section.lectures.push(lecture._id);
    await section.save({ session });

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

  const course = await Course.findById(courseId).populate("lectures");
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

    await Section.updateOne(
      { _id: sectionId },
      { $pull: { lectures: lectureId } },
    ).session(session);

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

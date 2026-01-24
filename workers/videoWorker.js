import { Worker } from "bullmq";
import IORedis from "ioredis";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import Lecture from "../models/lectureModel.js";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const videoWorker = new Worker(
  "video-queue",
  async (job) => {
    const { lectureId, filePath } = job.data;
    console.log(`[VideoWorker]  Processing video for Lecture: ${lectureId}`);

    try {
      const lecture = await Lecture.findById(lectureId);
      if (!lecture) throw new Error("Lecture not found");

      // Setup Output Directory (public/courses/{lectureId})
      const outputDir = path.join(process.cwd(), "public", "courses", lectureId);
      ensureDir(outputDir);
      
      const outputPath = path.join(outputDir, "master.m3u8");

      //  FFmpeg Conversion (MP4 -> HLS)
      return new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .outputOptions([
            "-hls_time 10",      // Split into 10-second chunks
            "-hls_list_size 0",  // Keep all chunks in the playlist
            "-c:v libx264",      // Use H.264 video codec
            "-c:a aac",          // Use AAC audio codec
            "-vf scale=1280:-2"  // Scale to 720p (optional: saves space)
          ])
          .output(outputPath)
          .on("end", async () => {
            console.log(`[VideoWorker]  Transcoding Complete: ${lectureId}`);
            
            lecture.videoUrl = `/public/courses/${lectureId}/master.m3u8`;
            lecture.status = "ready";
            await lecture.save();
            
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            
            resolve();
          })
          .on("error", async (err) => {
            console.error(`[VideoWorker]  Transcoding Failed:`, err);
            lecture.status = "failed";
            await lecture.save();
            reject(err);
          })
          .run();
      });

    } catch (error) {
      console.error("[VideoWorker] Job failed:", error);
      throw error;
    }
  },
  { connection }
);

export default videoWorker;
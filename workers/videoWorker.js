import { Worker } from "bullmq";
import IORedis from "ioredis";
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import Lecture from "../models/lectureModel.js";
import uploadOnCloudinary from "../config/cloudinary.js";
import logger from "../config/logger.js";

// STABLE CONNECTION FOR DOCKER -> UPSTASH
const connection = new IORedis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {},
  connectTimeout: 15000, 
  keepAlive: 10000,
  retryStrategy(times) {
    return Math.min(times * 100, 3000); 
  },
});

// OPTIMIZED FFMPEG FOR LINUX/DOCKER
const runFFmpeg = (inputPath, outputPath, job) => {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast', // Speed is king in development
      '-crf', '28',           // Good compression/quality ratio
      '-vf', 'scale=1280:-2', // Standardize to 720p, maintain aspect ratio
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', args);
    let totalDuration = 0;

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Duration:')) {
        const match = output.match(/Duration:\s(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (match) {
          const hours = parseFloat(match[1]);
          const minutes = parseFloat(match[2]);
          const seconds = parseFloat(match[3]);
          totalDuration = (hours * 3600) + (minutes * 60) + seconds;
        }
      }
      if (output.includes('time=')) {
        const match = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (match && totalDuration > 0) {
          const hours = parseFloat(match[1]);
          const minutes = parseFloat(match[2]);
          const seconds = parseFloat(match[3]);
          const currentTime = (hours * 3600) + (minutes * 60) + seconds;
          const progress = Math.floor((currentTime / totalDuration) * 100);
          job.updateProgress(progress);
        }
      }
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        logger.info("FFmpeg processing successful.");
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    ffmpegProcess.on('error', (err) => {
      logger.error("FFmpeg Spawn Error:", err);
      reject(err);
    });
  });
};

export const videoWorker = new Worker("video-queue", async (job) => {
  const { lectureId, rawVideoUrl, instructorId } = job.data;

  if (!rawVideoUrl) {
      logger.error(`BAD DATA: rawVideoUrl is missing for lecture ${lectureId}`);
      await Lecture.findByIdAndUpdate(lectureId, { status: "FAILED" });
      throw new Error("Missing rawVideoUrl in job payload."); 
  }
  
  // fix1 = UNIVERSAL PATH FIX
  // This ensures it works in /app/temp (Docker) and backend/temp (Windows)
  const tempDir = path.resolve(`./temp/worker_${lectureId}`);
  await fs.ensureDir(tempDir);

  const rawVideoPath = path.join(tempDir, "downloaded_raw.mp4");
  const compressedVideoPath = path.join(tempDir, "final_720p.mp4");

  try {
    logger.info(`Starting Video Pipeline: ${lectureId} on ${process.platform}`);

    // Optimization: Scale down to 480p via Cloudinary URL transformation to save Worker bandwidth
    const optimizedDownloadUrl = rawVideoUrl.replace('/upload/', '/upload/q_auto,w_854,h_480/');

    logger.info(`Downloading: ${optimizedDownloadUrl}`);
    const response = await axios({
      url: optimizedDownloadUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(rawVideoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    logger.info(`Transcoding via Native Linux FFmpeg...`);
    await runFFmpeg(rawVideoPath, compressedVideoPath, job);

    logger.info(`Uploading Final Artifact...`);
    const cloudResponse = await uploadOnCloudinary(compressedVideoPath);
    
    if (!cloudResponse) throw new Error("Failed to upload processed video");

    await Lecture.findByIdAndUpdate(lectureId, {
      videoUrl: cloudResponse.secure_url || cloudResponse.url, 
      status: "READY"
    });

    await connection.publish("notifications", JSON.stringify({
      userId: instructorId,
      type: "VIDEO_READY",
      message: "Lecture processing complete. High-definition stream ready."
    }));

    logger.info(`Pipeline Success: ${lectureId}`);

  } catch (error) {
    logger.error(`Pipeline Failure: ${error.message}`);
    await Lecture.findByIdAndUpdate(lectureId, { status: "FAILED" });
    throw error; 
  } finally {
    // Crucial: Clean up local Docker storage to prevent 'No space left on device'
    await fs.remove(tempDir);
  }
}, {
  connection,
  concurrency: 1 
});
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import Lecture from "../models/lectureModel.js";
import uploadOnCloudinary from "../config/cloudinary.js";
import logger from "../config/logger.js"; 

const connection = new IORedis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: null,
  tls: {}
});

// Native FFmpeg execution (No dependencies)
const runFFmpeg = (inputPath, outputPath, job) => {
    return new Promise((resolve, reject) => {
        const args = [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-s', '1280x720',    // Standardize to 720p
            '-b:v', '1500k',     // Lower bitrate to save further bandwidth
            '-c:a', 'aac',       
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
                    job.updateProgress(progress); // Send progress to Redis UI
                }
            }
        });

        ffmpegProcess.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with code ${code}`)));
        ffmpegProcess.on('error', reject);
    });
};

export const videoWorker = new Worker("video-queue", async (job) => {
    const { lectureId, rawVideoUrl, instructorId } = job.data;
    logger.info(`🎬 Starting video processing for Lecture: ${lectureId}`);

    const tempDir = path.resolve(`./temp/worker_${lectureId}`);
    await fs.ensureDir(tempDir);

    const rawVideoPath = path.join(tempDir, "downloaded_raw.mp4");
    const compressedVideoPath = path.join(tempDir, "final_compressed.mp4");

    try {
        // 🚀 THE BANDWIDTH SAVER TRICK 🚀
        // We tell Cloudinary to scale it down to 480p on-the-fly BEFORE sending it to Render
        const optimizedDownloadUrl = rawVideoUrl.replace('/upload/', '/upload/q_auto,w_854,h_480/');

        logger.info(`⬇️ Downloading OPTIMIZED raw video: ${optimizedDownloadUrl}`);
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

        // Compress / Standardize via Native FFmpeg
        logger.info(`🗜️ Standardizing format via native FFmpeg...`);
        await runFFmpeg(rawVideoPath, compressedVideoPath, job);

        // Upload Final Version
        logger.info(`☁️ Uploading FINAL video to Cloudinary...`);
        const cloudResponse = await uploadOnCloudinary(compressedVideoPath);
        
        if (!cloudResponse) throw new Error("Failed to upload processed video");

        // Update DB
        await Lecture.findByIdAndUpdate(lectureId, {
            videoUrl: cloudResponse.url, 
            status: "READY"
        });

        // Notify User via Socket/Redis
        await connection.publish("notifications", JSON.stringify({
            userId: instructorId,
            type: "VIDEO_READY",
            message: "Your video has been successfully compressed and is ready!"
        }));

        logger.info(`✅ Video Pipeline Complete for Lecture: ${lectureId}`);

    } catch (error) {
        logger.error(`❌ Video Processing Failed: ${error.message}`);
        await Lecture.findByIdAndUpdate(lectureId, { status: "FAILED" });
        throw error; 
    } finally {
        // Guarantee Cleanup to prevent Render Disk Full errors
        await fs.remove(tempDir);
    }
}, {
    connection,
    concurrency: 1 
});
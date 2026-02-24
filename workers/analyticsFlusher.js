import cron from "node-cron";
import redisClient from "../config/redis.js";
import CourseAnalytics from "../models/analyticsModel.js";
import logger from "../config/logger.js";

// Utility to give the Event Loop a break
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

cron.schedule("*/5 * * * *", async () => {
  const lock = await redisClient.set("analytics_flush_lock", "locked", {
    nx: true,
    ex: 240,
  });

  if (!lock) return;

  logger.info("Cron: Starting Redis -> MongoDB Analytics Flush...");

  try {
    const dirtyCourses = await redisClient.smembers("dirty_analytics_courses");
    if (!dirtyCourses || dirtyCourses.length === 0) return;

    const bulkOps = [];

    for (let i = 0; i < dirtyCourses.length; i++) {
      const courseId = dirtyCourses[i];
      
      // OPTIMIISATION : Break the loop every 5 courses to prevent Event Loop blocking
      if (i > 0 && i % 5 === 0) {
        await sleep(100); 
      }

      const viewsKey = `analytics:course_views:${courseId}`;
      const usersKey = `analytics:course_users:${courseId}`;

      // Fetch course-level stats
      const multi = redisClient.multi();
      multi.getdel(viewsKey);
      multi.set(viewsKey, "0"); // Reset views in Redis
      multi.pfcount(usersKey);
      const results = await multi.exec();

      const newViews = parseInt(results[0] || 0, 10);
      const totalUniqueUsers = parseInt(results[2] || 0, 10);

      // Fetch dirty lectures for this course
      const dirtyLectures = await redisClient.smembers(`dirty_analytics_lectures:${courseId}`);
      
      const setOperations = { uniqueActiveUsers: totalUniqueUsers };
      const incOperations = {};
      if (newViews > 0) incOperations.totalViews = newViews;

      // Optimization: Process lectures in parallel to save time
      if (dirtyLectures.length > 0) {
        const lecturePromises = dirtyLectures.map(async (lectureId) => {
          const lViewsKey = `analytics:lecture_views:${lectureId}`;
          const lWatchKey = `analytics:lecture_watchtime:${lectureId}`;

          const lMulti = redisClient.multi();
          lMulti.get(lViewsKey);
          lMulti.set(lViewsKey, "0");
          lMulti.get(lWatchKey);
          lMulti.set(lWatchKey, "0");
          const lResults = await lMulti.exec();

          return {
            lectureId,
            views: parseInt(lResults[0] || 0, 10),
            watchTime: parseInt(lResults[2] || 0, 10)
          };
        });

        const lectureData = await Promise.all(lecturePromises);

        lectureData.forEach(item => {
          if (item.views > 0) incOperations[`lectureStats.${item.lectureId}.views`] = item.views;
          if (item.watchTime > 0) incOperations[`lectureStats.${item.lectureId}.totalWatchTime`] = item.watchTime;
        });
      }

      const updateDoc = { $set: setOperations };
      if (Object.keys(incOperations).length > 0) {
        updateDoc.$inc = incOperations;
      }

      bulkOps.push({
        updateOne: {
          filter: { courseId },
          update: updateDoc,
          upsert: true,
        },
      });

      await redisClient.del(`dirty_analytics_lectures:${courseId}`);
      // await redisClient.del(usersKey); 
    }

    if (bulkOps.length > 0) {
      await CourseAnalytics.bulkWrite(bulkOps);
      await redisClient.del("dirty_analytics_courses");
      logger.info(`Cron: Successfully flushed ${bulkOps.length} courses to MongoDB.`);
    }
  } catch (error) {
    logger.error(`Cron: Analytics Flush Failed: ${error.message}`);
  } finally {
    await redisClient.del("analytics_flush_lock");
  }
});
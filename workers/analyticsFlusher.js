import cron from "node-cron";
import redisClient from "../config/redis.js";
import CourseAnalytics from "../models/analyticsModel.js";
import logger from "../config/logger.js";

// Run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  const lock = await redisClient.set(
    "analytics_flush_lock",
    "locked",
    "NX",
    "EX",
    240,
  );

  if (!lock) return;

  logger.info(" Cron: Starting Redis -> MongoDB Analytics Flush...");

  try {
    const dirtyCourses = await redisClient.smembers("dirty_analytics_courses");
    if (dirtyCourses.length === 0) return;

    const bulkOps = [];

    for (const courseId of dirtyCourses) {
      // Fetch Course-Level Stats
      const viewsKey = `analytics:course_views:${courseId}`;
      const usersKey = `analytics:course_users:${courseId}`;

      const multi = redisClient.multi();
      multi.get(viewsKey);
      multi.set(viewsKey, 0);
      multi.pfcount(usersKey);

      await redisClient.del(usersKey);

      const results = await multi.exec();

      const newViews = parseInt(results[0] || 0, 10);
      const totalUniqueUsers = parseInt(results[2] || 0, 10);

      const dirtyLectures = await redisClient.smembers(
        `dirty_analytics_lectures:${courseId}`,
      );
      const setOperations = {};
      const incOperations = {};

      if (newViews > 0) incOperations.totalViews = newViews;
      setOperations.uniqueActiveUsers = totalUniqueUsers;

      for (const lectureId of dirtyLectures) {
        const lViewsKey = `analytics:lecture_views:${lectureId}`;
        const lWatchKey = `analytics:lecture_watchtime:${lectureId}`;

        const lMulti = redisClient.multi();
        lMulti.get(lViewsKey);
        lMulti.set(lViewsKey, 0);
        lMulti.get(lWatchKey);
        lMulti.set(lWatchKey, 0);
        const lResults = await lMulti.exec();

        const newLectureViews = parseInt(lResults[0] || 0, 10);
        const newWatchTime = parseInt(lResults[2] || 0, 10);

        if (newLectureViews > 0) {
          incOperations[`lectureStats.${lectureId}.views`] = newLectureViews;
        }
        if (newWatchTime > 0) {
          incOperations[`lectureStats.${lectureId}.totalWatchTime`] =
            newWatchTime;
        }
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

      // clean up
      await redisClient.del(`dirty_analytics_lectures:${courseId}`);
    }

    if (bulkOps.length > 0) {
      await CourseAnalytics.bulkWrite(bulkOps);
      await redisClient.del("dirty_analytics_courses");
      logger.info(`Cron: Flushed analytics for ${bulkOps.length} courses`);
    }
  } catch (error) {
    logger.error(`Cron: Analytics Flush Failed: ${error.message}`);
  }
});

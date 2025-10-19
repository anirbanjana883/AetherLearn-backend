import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Achievement from './models/achivementModel.js'; 

dotenv.config();

// --- Define Your Achievements Here ---
const achievements = [
  {
    name: "First Steps",
    description: "Completed your first activity.",
    icon: "FaPlay", // We'll use the icon name and let the frontend render it
    trigger_event: "ACTIVITIES_LOGGED",
    trigger_threshold: 1,
  },
  {
    name: "Consistent Learner",
    description: "Maintained a 3-day learning streak.",
    icon: "FaFire",
    trigger_event: "STREAK",
    trigger_threshold: 3,
  },
  {
    name: "Weekly Warrior",
    description: "Maintained a 7-day learning streak.",
    icon: "FaCrown",
    trigger_event: "STREAK",
    trigger_threshold: 7,
  },
  {
    name: "Course Collector",
    description: "Enrolled in 3 different courses.",
    icon: "FaBook",
    trigger_event: "COURSES_ENROLLED",
    trigger_threshold: 3,
  },
  {
    name: "Diligent Student",
    description: "Completed 10 activities.",
    icon: "FaTasks",
    trigger_event: "ACTIVITIES_LOGGED",
    trigger_threshold: 10,
  },
];

// --- The Seeding Logic ---
const seedDB = async () => {
  try {
    // 1. Connect to the database
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected for seeding.");

    // 2. Clear existing achievements to prevent duplicates
    await Achievement.deleteMany({});
    console.log("Existing achievements cleared.");

    // 3. Insert the new achievements
    await Achievement.insertMany(achievements);
    console.log("Database seeded with new achievements!");

  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    // 4. Disconnect from the database
    mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
};

// Run the seeding function
seedDB();
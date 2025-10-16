import Course from "../models/courseModel.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

export const searchWithAi = async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ message: "Query is required" });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const prompt = `
      You are a highly intelligent classification assistant for an LMS (Learning Management System) that helps students find courses.

      Your role:
      - A user will type any message about what they want to learn.
      - You must understand their intent (topic + level) and select the most relevant keyword from the list below.

      Choose ONLY one keyword that best represents the user’s intent from this list:

        Web Development
        UI/UX Designing
        App Development
        Blockchain
        AI / ML
        Data Science
        Data Analytics
        Ethical Hacking
        Others
        Beginner
        Intermediate
        Advanced

      Detailed instructions:
      1. Analyze the user's full query carefully — consider both **topic** and **skill level** if present.
      2. If the query refers to coding, frontend, backend, websites, or frameworks like React, Node.js, Django → choose “Web Development”.
      3. If the query mentions design, wireframes, Figma, prototypes, or user interfaces → choose “UI/UX Designing”.
      4. If it mentions mobile apps, Android, iOS, Flutter, or React Native → choose “App Development”.
      5. If it mentions crypto, smart contracts, decentralized apps, or Web3 → choose “Blockchain”.
      6. If it includes AI, artificial intelligence, machine learning, neural networks, or deep learning → choose “AI / ML”.
      7. If it refers to Python, data visualization, data cleaning, pandas, NumPy, or Jupyter → choose “Data Science”.
      8. If it mentions business insights, dashboards, Power BI, Excel, or statistics → choose “Data Analytics”.
      9. If it refers to cybersecurity, penetration testing, or hacking → choose “Ethical Hacking”.
      10. If it refers to level terms like “beginner”, “introductory”, “starting out” → choose “Beginner”.
      11. If it mentions “intermediate”, “mid-level”, or “some experience” → choose “Intermediate”.
      12. If it mentions “advanced”, “expert”, or “professional” → choose “Advanced”.
      13. If none of these categories fit well → choose “Others”.

      Formatting rules:
      - Output ONLY one keyword from the list, exactly as written.
      - No punctuation, no quotes, no explanation, and no extra words.

      User Query: "${input}"
      `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const keyword =
      response.candidates[0].content.parts[0].text.trim();

    // normal search
    const keywords = input.split(" ").filter(Boolean);
    const orConditions = keywords.flatMap((word) => [
      { title: { $regex: word, $options: "i" } },
      { subtitle: { $regex: word, $options: "i" } },
      { description: { $regex: word, $options: "i" } },
      { category: { $regex: word, $options: "i" } },
      { level: { $regex: word, $options: "i" } },
    ]);

    let courses = await Course.find({
      isPublished: true,
      $or: orConditions,
    });

    if (courses.length > 0) {
      return res.status(200).json(courses);
    } else {
      // fallback AI keyword search
      courses = await Course.find({
        isPublished: true,
        $or: [
          { title: { $regex: keyword, $options: "i" } },
          { subtitle: { $regex: keyword, $options: "i" } },
          { description: { $regex: keyword, $options: "i" } },
          { category: { $regex: keyword, $options: "i" } },
          { level: { $regex: keyword, $options: "i" } },
        ],
      });
      return res.status(200).json(courses);
    }
  } catch (error) {
    return res.status(500).json({ message: `Failed to search: ${error.message}` });
  }
};

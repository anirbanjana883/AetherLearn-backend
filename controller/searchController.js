import Course from "../models/courseModel.js";
import { GoogleGenAI, Type } from "@google/genai";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import redisClient from "../config/redis.js"; 

// Initialize AI statelessly
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const searchWithAi = asyncHandler(async (req, res) => {
    const { input } = req.body;

    if (!input) {
        throw new ApiError(400, "Search query is required");
    }

    const sanitizedInput = input.toLowerCase().trim();

    // LIGHTNING FAST DB SEARCH (Primary)
    let courses = await Course.find(
        { isPublished: true, $text: { $search: sanitizedInput } },
        { score: { $meta: "textScore" } }
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(20);

    // native srarch 
    if (courses.length > 0) {
        return res.status(200).json(
            new ApiResponse(200, courses, "Search results fetched instantly")
        );
    }

    // AI INTENT FALLBACK WITH REDIS CACHE
    console.log(`Normal search failed for "${sanitizedInput}". Checking Cache...`);
    
    const cacheKey = `aiIntent:${sanitizedInput}`;
    let intentKeyword = await redisClient.get(cacheKey);

    if (!intentKeyword) {
        console.log(`Cache Miss. Booting up Gemini with 1200ms Circuit Breaker...`);
        
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

        const aiPromise = ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        category: {
                            type: Type.STRING,
                            enum: [
                                "Web Development", "UI/UX Designing", "App Development", 
                                "Blockchain", "AI / ML", "Data Science", "Data Analytics", 
                                "Ethical Hacking", "Beginner", "Intermediate", "Advanced", "Others"
                            ]
                        }
                    },
                    required: ["category"]
                }
            }
        });

        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 1200));
        const response = await Promise.race([aiPromise, timeoutPromise]);

        if (!response) {
            console.warn("⏱Gemini timed out. Defaulting to 'Others'.");
            intentKeyword = "Others";
        } else {
            try {
                const aiResult = JSON.parse(response.candidates[0].content.parts[0].text);
                intentKeyword = aiResult.category;
                
                // 24 hour cache 
                await redisClient.set(cacheKey, intentKeyword, "EX", 86400);
                console.log(`Gemini classified intent as: ${intentKeyword} (Cached)`);

            } catch (error) {
                console.error("Gemini returned malformed data or crashed:", error);
                intentKeyword = "Others"; 
            }
        }
    } else {
        console.log(`Cache Hit! Bypassed AI cost. Intent: ${intentKeyword}`);
    }

    // FALLBACK DATABASE QUERY
    courses = await Course.find({
        isPublished: true,
        $or: [
            { category: intentKeyword },
            { level: intentKeyword }
        ]
    }).limit(20);

    return res.status(200).json(
        new ApiResponse(200, {
            aiClassification: intentKeyword,
            cached: !!await redisClient.get(cacheKey), 
            courses
        }, "Search results generated via AI intent")
    );
});
# SYSTEM 8: AI-POWERED SEARCH ENGINE

## 1. System Overview

The Search & Filtering Engine is the primary discovery mechanism for students on AetherLearn. Standard string-matching algorithms often fail when users type conversational or vague queries (e.g., "I want to learn how to hack" instead of "Ethical Hacking").

System 8 implements a Hybrid Semantic Search Architecture. It uses lightning-fast native MongoDB Text Indexes for exact/partial keyword matches, and intelligently falls back to an integrated Large Language Model (Google Gemini 2.0 Flash) for semantic intent classification only when the standard search yields zero results. To protect against token-exhaustion and latency spikes, the AI layer is heavily fortified with Redis caching and asynchronous circuit breakers.

## 2. Functional Requirements

- **High-Speed Keyword Search**: Search across course titles, subtitles, descriptions, and categories simultaneously.
- **Relevance Sorting**: Rank search results so the most relevant courses appear at the top.
- **Semantic Fallback Classification**: Understand conversational intent and map user queries to exact platform categories or skill levels.
- **Structured AI Outputs**: Enforce strict JSON schemas on the LLM to guarantee deterministic, parseable outputs without hallucinated text.
- **Intent Caching**: Cache resolved AI intents to prevent redundant LLM billing on frequently searched vague terms.

## 3. Non-Functional Requirements

- **Low Latency**: Primary searches must execute in < 10ms. AI fallback queries are strictly capped at a 1200ms ceiling to preserve User Experience.
- **Cost Optimization**: LLM API tokens must only be consumed as an absolute last resort (Lazy Evaluation + Cache-First lookup), protecting the platform from massive AI billing spikes.
- **Scalability**: The search queries must scale to thousands of concurrent requests without full database collection scans.

## 4. Data Model Design

To support high-performance querying without scanning every document, the Course collection was upgraded with a *Compound Text Index*
```bash
courseSchema.index({
    title: "text",
    subtitle: "text",
    category: "text",
    description: "text"
});
```
**Why this design?** A text index tokenizes string content, dropping stop-words (like "the", "and") and stemming words (matching "developer" with "development"). This replaces the $O(N)$ $regex full-scan with an $O(1)$ index lookup.

## 5. API Design

| Endpoint | Method | Description | Request Body | Response | Status Codes |
|----------|--------|-------------|--------------|----------|--------------|
| /api/course/search | POST | Fetches courses using Hybrid AI Search. | `{ "input": "React Native" }` | `{ aiClassification?: string, cached?: boolean, courses: [...] }` | 200, 400, 429, 500 |

*(Note: While GET is standard for search, POST is utilized here to securely transmit potentially long conversational AI prompts in the request body without hitting URL length limits).*

## 6. System Flow
```
[User Query: "How to build apps"]
        │
        ▼
 1. [MongoDB $text Search] ──(Executes in 10ms)
        │
        ├─▶ IF Match Found ──▶ Return Results Immediately (End)
        │
        ▼
 2. IF No Match (Query was vague):
        │
        ▼
 3. [Redis Cache Check] ─────(Lookup `aiIntent:how to build apps`)
        │
        ├─▶ IF Cache Hit ────▶ Jump to Step 7 (0ms AI Latency, $0 Cost)
        │
        ▼
 4. IF Cache Miss:
        │
        ▼
 5. [Gemini AI Prompt] ──────(Injects Query + Strict JSON Schema)
        │                    *(Wrapped in 1200ms Promise.race timeout)*
        ▼
 6. [Store in Redis] ────────(Cache `{category: "App Development"}` for 24h)
        │
        ▼
 7. [MongoDB Fallback] ──────(Queries Exact AI Category Match)
        │
        ▼
 8. Return Semantic Results to User
```
## 7. Performance Optimization

- **Lazy AI Execution**: The Gemini API is strictly gated behind the failure of the native database search. This ensures 90% of searches process instantly, saving thousands of API calls per day.
- **Redis Intent Caching**: If a user searches "learn react", the AI figures out they want "Web Development". This intent is stored in Redis with an 86400s (24 hour) TTL. If another user searches the exact same phrase, the system bypasses the LLM entirely, resulting in 0ms AI latency and $0 cost.
- **Native Relevance Scoring**: Uses MongoDB's `{ score: { $meta: "textScore" } }` to mathematically sort exact keyword matches above partial matches without requiring backend JavaScript sorting.

## 8. Fault Tolerance

- **The 1200ms Circuit Breaker**: The LLM network call is wrapped in a `Promise.race` against a 1200ms timeout. If the Gemini API is struggling or rate-limited, the system drops the AI call and gracefully defaults the intent to "Others" instead of making the user wait 5+ seconds.
- **JSON Parse Safety Net**: The response payload is wrapped in a try/catch block. If Gemini hallucinates malformed JSON or the network drops the payload, the backend catches the parsing error and safely defaults the intent without throwing a 500 Server Error.
- **Deterministic AI Schemas**: By utilizing `@google/genai` responseSchema with a rigid enum array, the system mathematically guarantees Gemini cannot return unexpected formats or punctuation.

## 9. Security Considerations

- **NoSQL Injection Prevention**: Unlike `$where` or raw object injection, MongoDB's `$text` operator safely sanitizes user inputs against NoSQL injection out of the box.
- **Financial Rate Limiting**: Protects the platform from financial exhaustion attacks (where a malicious actor spams the search API to drain the Gemini billing account) by inheriting System 7's global IP rate limiters, combined with the Redis Cache shield.

## 10. Trade-offs

- **Write Penalty**: Text indexes are heavy. Every time an instructor creates or updates a course, MongoDB must rebuild the index tokens. This slightly slows down writes (POST /courses) to drastically speed up reads (GET /search), which is ideal for an LMS where reads outnumber writes 1000:1.
- **Exact Match vs. Semantic Cache**: The Redis cache currently uses exact-string matching (e.g., "learn react"). If a user types "learn react today", it results in a cache miss. We trade slightly lower cache hit rates for the absolute raw speed of exact-key Redis lookups.

## 11. Future Improvements

- **Redis Vector Semantic Caching**: Upgrading the standard Redis string cache to a RedisVL (Vector Library) semantic cache. This would convert prompts into embeddings, allowing "How to build apps" and "How to create mobile applications" to hit the exact same cached intent without calling the LLM.
- **Atlas Vector Search (RAG)**: Upgrading from `$text` indexes to native MongoDB vector embeddings, allowing true semantic similarity search across the entire database natively.
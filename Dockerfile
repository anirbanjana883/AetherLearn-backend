# 1. Use an official Node runtime as a parent image
FROM node:18-alpine

# 🚨 FAANG FIX 1: Install FFmpeg for your BullMQ Video Worker
RUN apk update && apk add --no-cache ffmpeg

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json FIRST
COPY package*.json ./

# 4. Install dependencies (use 'npm ci' for strict, clean installs in prod)
RUN npm install

# 5. Copy the rest of your application code
COPY . .

# 6. Expose the port your app runs on
EXPOSE 5000

# 🚨 FAANG FIX 2: Run standard Node for production, NOT nodemon
# Make sure your package.json has: "start": "node index.js"
CMD ["npm", "start"]
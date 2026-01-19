# 1. Use an official Node runtime as a parent image
# 'alpine' is a super small version of Linux (~5MB)
FROM node:18-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json FIRST
# We do this separately to take advantage of Docker's caching mechanism.
# If you change your code but not dependencies, Docker skips 'npm install'.
COPY package*.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the rest of your application code
COPY . .

# 6. Expose the port your app runs on
EXPOSE 5000

# 7. Define the command to run your app
# Using 'npm run dev' for development, or 'node index.js' for production
CMD ["npm", "run", "dev"]
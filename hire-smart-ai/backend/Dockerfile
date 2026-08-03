FROM node:16

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY backend/package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy the rest of the application code
COPY backend/src ./src

# Copy environment variables
COPY backend/.env.example .env

# Expose the application port
EXPOSE 5000

# Start the application
CMD ["node", "src/server.js"]
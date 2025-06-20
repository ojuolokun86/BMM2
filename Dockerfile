# Use Node.js 22 base image
FROM node:22

# Set working directory inside container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the files (including .env)
COPY . .

# Set environment variables (optional - Railway auto injects)
ENV NODE_ENV=production

# Start the bot
CMD ["node", "--max-old-space-size=4096", "src/index.js"]

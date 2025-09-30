# --- STAGE 1: Builder ---
# This stage installs all dependencies and can be used for building/testing.
FROM node:20 as builder

WORKDIR /usr/src/app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .


# --- STAGE 2: Production ---
# This stage creates the final, lean production image.
FROM node:20-slim

# Set the working directory
WORKDIR /usr/src/app

# Set Node.js to production environment
ENV NODE_ENV=production

# Copy package files from the builder stage
COPY --from=builder /usr/src/app/package*.json ./

# Install ONLY production dependencies using npm ci for a clean, fast, and reliable install.
# The --omit=dev flag is the modern equivalent of --only=production
RUN npm ci --omit=dev

# Copy the application code from the builder stage.
# This is done after npm ci to leverage Docker layer caching.
COPY --from=builder /usr/src/app .

# Copy the start script
COPY start.sh .

# Ensure the start script is executable
RUN chmod +x ./start.sh

# Expose the port the app runs on
EXPOSE 3002

# The command to run the application using the start script
CMD [ "./start.sh" ]

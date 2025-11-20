# --- STAGE 1: Builder ---
# This stage installs all dependencies and can be used for building/testing.
FROM node:20-bullseye-slim as builder

WORKDIR /usr/src/app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application source code
COPY . .


# --- STAGE 2: Production ---
# This stage creates the final, lean production image.
FROM node:20-bullseye-slim

# Install runtime dependencies for PPTX conversion
# LibreOffice for PPTX -> PDF
# Ghostscript and GraphicsMagick for PDF -> Image conversion (used by pdf2pic)
RUN apt-get update && apt-get install -y \
    libreoffice \
    ghostscript \
    graphicsmagick \
    && rm -rf /var/lib/apt/lists/*

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

# Expose the port the app runs on
EXPOSE 3002

# The command to run the application
CMD [ "npm", "start" ]

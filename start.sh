#!/bin/bash

# This script starts all necessary services for the application.

# Start the Redis server in the background
echo "Starting Redis server..."
redis-server --daemonize yes

# Give Redis a moment to start up
sleep 2

# Start the main Node.js server in the background
echo "Starting Node.js server..."
npm start &

# Start the BullMQ worker in the foreground
echo "Starting BullMQ worker..."
node server/worker.js

# The script will exit if the worker process exits.
# The '&' on the first command runs it in the background.
# The container will stay alive as long as the worker is running.
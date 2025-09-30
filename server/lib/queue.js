const { Queue } = require('bullmq');
const Redis = require('ioredis');

const QUEUE_NAME = 'background-jobs';

// Ensure Redis connection details are provided in .env
if (!process.env.REDIS_URL) {
    console.error("FATAL: REDIS_URL is not defined in the environment variables.");
    process.exit(1);
}

const connection = new Redis(process.env.REDIS_URL, {
    // BullMQ recommends this setting for production environments.
    maxRetriesPerRequest: null,
});

connection.on('connect', () => console.log('[Queue] Connected to Redis.'));
connection.on('error', (err) => console.error('[Queue] Redis connection error:', err));


const backgroundJobsQueue = new Queue(QUEUE_NAME, { connection });

console.log(`[Queue] BullMQ queue "${QUEUE_NAME}" initialized.`);

module.exports = {
    backgroundJobsQueue,
    QUEUE_NAME,
};
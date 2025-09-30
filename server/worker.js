// This is the background worker process.
// It uses BullMQ to process jobs from a Redis queue.

require('dotenv').config();
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { handlePresentationProcessing, handleUploadAndProcess, handleGenerateContent, handleGenerateSummary } = require('./services/backgroundJobs');
const { createSupabaseAdminClient } = require('./lib/supabaseClient');

const QUEUE_NAME = 'background-jobs';

// Centralized Redis connection options
const connection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // Important for BullMQ
});

connection.on('connect', () => console.log('[Worker] Connected to Redis.'));
connection.on('error', (err) => console.error('[Worker] Redis connection error:', err));

// --- Job Processor ---
// This function is called by the worker when a new job is available.
// It routes the job to the appropriate handler based on its name.
const processor = async (job) => {
    console.log(`[Worker] Processing job #${job.id} of type "${job.name}"`);
    const { id, name, data } = job;

    try {
        switch (name) {
            case 'file_upload':
                await handleUploadAndProcess(id, data);
                break;
            case 'presentation_processing':
                await handlePresentationProcessing(id, data);
                break;
            case 'content_generation':
            case 'content_generation_questions_only': // Can reuse the same handler
                await handleGenerateContent(id, data);
                break;
            case 'summary_generation':
                await handleGenerateSummary(id, data);
                break;
            default:
                throw new Error(`Unknown job type: ${name}`);
        }
        console.log(`[Worker] Completed job #${job.id}`);
    } catch (error) {
        console.error(`[Worker] Failed job #${job.id} of type "${job.name}":`, error);
        // The error should be re-thrown so BullMQ marks the job as failed.
        // The individual handlers are already responsible for updating the DB status.
        throw error;
    }
};


// --- Worker Initialization ---
const worker = new Worker(QUEUE_NAME, processor, {
    connection,
    concurrency: 5, // Process up to 5 jobs at a time
    removeOnComplete: { count: 1000 }, // Keep last 1000 completed jobs
    removeOnFail: { count: 5000 },    // Keep last 5000 failed jobs
});


// --- Event Listeners for Logging ---
worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} has completed.`);
});

worker.on('failed', async (job, err) => {
    console.error(`[Worker] Job ${job.id} has failed with ${err.message}`);
    // As a final fallback, update the database status if the handler failed to do so.
    try {
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin
            .from('background_jobs')
            .update({ status: 'failed', last_error: err.message, updated_at: new Date().toISOString() })
            .eq('id', job.id);
    } catch (dbError) {
        console.error(`[Worker] CRITICAL: Failed to update fallback failure status for job ${job.id}:`, dbError);
    }
});

worker.on('error', (err) => {
    console.error('[Worker] A worker error has occurred:', err);
});

console.log(`[Worker] Worker started. Listening for jobs on queue "${QUEUE_NAME}".`);

// --- Graceful Shutdown ---
const gracefulShutdown = async () => {
    console.log('[Worker] Shutting down gracefully...');
    await worker.close();
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
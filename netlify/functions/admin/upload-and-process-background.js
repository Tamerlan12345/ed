const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const crypto = require('crypto');

async function processFile(jobId, eventBody, token) {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Helper to update job status
    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabase
            .from('background_jobs')
            .update({ status, result: data, error_message: errorMessage, updated_at: new Date().toISOString() })
            .eq('job_id', jobId);
        if (error) {
            console.error(`Failed to update job ${jobId} status to ${status}:`, error);
        }
    };

    try {
        const { course_id, title, file_name, file_data } = eventBody;
        console.log(`[Job ${jobId}] Starting processing for course ${course_id}`);

        const buffer = Buffer.from(file_data, 'base64');
        let textContent = '';

        try {
            if (file_name.endsWith('.docx')) {
                const { value } = await mammoth.extractRawText({ buffer });
                textContent = value;
            } else if (file_name.endsWith('.pdf')) {
                const data = await pdf(buffer);
                textContent = data.text;
            } else {
                throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
            }

            if (!textContent) {
                throw new Error('Could not extract text from the document. The file might be empty or corrupted.');
            }
        } catch (e) {
            console.error(`[Job ${jobId}] File parsing error:`, e);
            throw new Error(`Failed to process file: ${e.message}`);
        }

        console.log(`[Job ${jobId}] Text extracted successfully. Saving to database...`);
        const { error: dbError } = await supabase
            .from('courses')
            .upsert({
                course_id: course_id,
                title: title,
                source_text: textContent,
                status: 'processed'
            }, { onConflict: 'course_id' });

        if (dbError) {
            console.error(`[Job ${jobId}] Supabase upsert error:`, dbError);
            throw new Error('Failed to save course content to the database.');
        }

        console.log(`[Job ${jobId}] Processing completed successfully.`);
        await updateJobStatus('completed', { message: 'File processed and content saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during processing:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

exports.handler = async (event) => {
    const jobId = crypto.randomUUID();
    const token = event.headers.authorization.split(' ')[1];

    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    try {
        const eventBody = JSON.parse(event.body);
        const { course_id } = eventBody;

        // Immediately create a job entry in the database
        const { error } = await supabase.from('background_jobs').insert({
            job_id: jobId,
            job_type: 'file_upload',
            status: 'pending',
            created_by: (await supabase.auth.getUser(token)).data.user.id,
            related_entity_id: course_id
        });

        if (error) {
            console.error('Failed to create initial job entry:', error);
            return handleError(error, 'upload-and-process-background');
        }

        // Don't await this promise. This is the "fire and forget" part.
        processFile(jobId, eventBody, token);

        // Immediately return a 202 Accepted response
        return {
            statusCode: 202,
            body: JSON.stringify({
                message: 'File upload accepted and is being processed in the background.',
                jobId: jobId
            }),
        };
    } catch (error) {
        // This catch block handles errors during the initial synchronous part
        // (e.g., JSON parsing, creating the initial job entry).
        console.error('Error in initial background function handler:', error);
        // We still need to update the job as failed if it was created
        await supabase.from('background_jobs').update({ status: 'failed', error_message: 'Initialization failed' }).eq('job_id', jobId);
        return handleError(error, 'upload-and-process-background');
    }
};

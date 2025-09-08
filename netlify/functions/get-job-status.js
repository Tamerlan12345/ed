const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { jobId } = event.queryStringParameters;
        if (!jobId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameter: jobId' }) };
        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        const { data: job, error } = await supabase
            .from('background_jobs')
            .select('job_id, status, result, error_message, updated_at')
            .eq('job_id', jobId)
            .single();

        if (error) {
            // RLS will return an error if the user is not the owner,
            // which will manifest as a "No rows found" error.
            // We can treat this as a 404.
            console.warn(`Could not retrieve job ${jobId}. Error: ${error.message}`);
            return { statusCode: 404, body: JSON.stringify({ error: 'Job not found or access denied.' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify(job),
        };

    } catch (error) {
        return handleError(error, 'get-job-status');
    }
};

const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function generateContent(jobId, eventBody, token) {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabase
            .from('background_jobs')
            .update({ status, result: data, error_message: errorMessage, updated_at: new Date().toISOString() })
            .eq('job_id', jobId);
        if (error) {
            console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
        }
    };

    try {
        const { course_id, custom_prompt } = eventBody;
        console.log(`[Job ${jobId}] Starting content generation for course ${course_id}`);

        const { data: courseData, error: fetchError } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (fetchError || !courseData || !courseData.source_text) {
            throw new Error('Course source text not found or not yet processed.');
        }

        const outputFormat = {
            summary: [{ title: "string", html_content: "string" }],
            questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
        };
        const finalPrompt = `Задание: ${custom_prompt || 'Создай исчерпывающий учебный курс...'}\n\nИСХОДНЫЙ ТЕКСТ:\n${courseData.source_text}\n\nОбязательно верни результат в формате JSON: ${JSON.stringify(outputFormat)}`;

        console.log(`[Job ${jobId}] Generating content with Gemini...`);
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();

        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonString);
        } catch (e) {
            console.error(`[Job ${jobId}] Failed to parse JSON string. Raw string was: "${jsonString}"`, e);
            throw new Error('AI model returned malformed JSON.');
        }

        if (!parsedJson.summary || !parsedJson.questions) {
            throw new Error('AI model returned an invalid or incomplete JSON structure.');
        }

        console.log(`[Job ${jobId}] Content generated. Saving to database...`);
        const { error: dbError } = await supabase
            .from('courses')
            .update({
                content_html: parsedJson, // Save the structured content
                status: 'generated'
            })
            .eq('course_id', course_id);

        if (dbError) {
            throw new Error(`Failed to save generated content: ${dbError.message}`);
        }

        console.log(`[Job ${jobId}] Content generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Content generated and saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during content generation:`, error);
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

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            console.error(`[Job ${jobId}] Auth error for token:`, userError);
            throw new Error('User authentication failed, cannot create job.');
        }

        const { error } = await supabase.from('background_jobs').insert({
            job_id: jobId,
            job_type: 'content_generation',
            status: 'pending',
            created_by: user.id,
            related_entity_id: course_id
        });

        if (error) {
            throw new Error(`Failed to create initial job entry: ${error.message}`);
        }

        generateContent(jobId, eventBody, token);

        return {
            statusCode: 202,
            body: JSON.stringify({
                message: 'Content generation started in the background.',
                jobId: jobId
            }),
        };
    } catch (error) {
        console.error('Error in initial background function handler:', error);
        await supabase.from('background_jobs').update({ status: 'failed', error_message: 'Initialization failed' }).eq('job_id', jobId);
        return handleError(error, 'generate-content-background');
    }
};

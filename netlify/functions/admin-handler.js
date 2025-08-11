const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

// Initialize Supabase and Gemini AI
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function uploadAndProcessFile(payload) {
    const { course_id, title, file_name, file_data } = payload;
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
        console.error('File parsing error:', e);
        throw new Error(`Failed to process file: ${e.message}`);
    }

    // Upsert course data into the database
    const { error: dbError } = await supabase
        .from('courses')
        .upsert({
            course_id: course_id,
            title: title,
            source_text: textContent,
            status: 'processed'
        }, { onConflict: 'course_id' });

    if (dbError) {
        console.error('Supabase upsert error:', dbError);
        throw new Error('Failed to save course content to the database.');
    }

    // Return the extracted text to the frontend
    return { extractedText: textContent };
}


async function generateContent(payload) {
    const { course_id, custom_prompt } = payload;
    const { data: courseData, error } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
    if (error || !courseData || !courseData.source_text) {
        return { error: 'Course source text not found or not yet processed. Please wait a moment for the file to be analyzed and try again.' };
    }
    const defaultCommand = { task: "Создай пошаговый план обучения из 3-5 уроков и 5 тестов по тексту.", output_format: { summary: [{ title: "string", html_content: "string" }], questions: [{ question: "string", options: ["string"], correct_option_index: 0 }] }, source_text: courseData.source_text };
    const finalPrompt = custom_prompt ? `${custom_prompt} ИСХОДНЫЙ ТЕКСТ: ${courseData.source_text}` : JSON.stringify(defaultCommand);

    const maxRetries = 5; // Increased retries to handle longer wait times
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Generating content, attempt ${i + 1}`);
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(jsonString); // Success
        } catch (e) {
            lastError = e;
            console.error(`Attempt ${i + 1} failed. Error: ${e.message}`);

            // Handle 429 Too Many Requests (Quota Exceeded)
            if (e.message && e.message.includes('429')) {
                const waitTime = 60 * 1000; // Wait for 60 seconds as suggested by API for minute-based quotas
                console.warn(`Quota exceeded (429). Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

            // Handle 503 Service Unavailable with exponential backoff
            } else if (e.message && e.message.includes('503')) {
                const waitTime = Math.pow(2, i) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s
                console.warn(`Service unavailable (503). Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));

            // For other errors, don't retry
            } else {
                console.error('Non-retriable error encountered. Aborting.');
                break;
            }
        }
    }

    // If all retries fail, return an informative error object
    console.error('All retries failed for content generation.');
    if (lastError.message && lastError.message.includes('429')) {
        return { error: { message: 'Failed to generate content due to API quota limits. Please try using a smaller document or try again later.', statusCode: 429 } };
    }
    if (lastError.message && lastError.message.includes('503')) {
        return { error: { message: 'The content generation service is temporarily overloaded. Please try again in a few moments.', statusCode: 503 } };
    }
    // For any other error that broke the loop
    return { error: { message: lastError.message, statusCode: 500 } };
}

const axios = require('axios');

async function textToSpeech(payload) {
    const { text } = payload;
    if (!text) throw new Error('No text provided for speech synthesis.');

    try {
        const response = await axios.post('https://api.cloudmersive.com/speech/speak/text/voice/basic/audio', {
            "Format": "mp3",
            "Text": text
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Apikey': process.env.CLOUDMERSIVE_API_KEY
            },
            responseType: 'arraybuffer' // Important for receiving binary file data
        });

        // The API returns the audio file directly, not a URL. We need to convert it to a data URI.
        const audioBase64 = Buffer.from(response.data, 'binary').toString('base64');
        const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;

        return { audioUrl: audioUrl };

    } catch (error) {
        console.error('Cloudmersive API error:', error.response ? error.response.data : error.message);
        throw new Error('Failed to generate audio file.');
    }
}

async function publishCourse(payload) {
    const { course_id, content_html, questions } = payload;
    const courseContent = {
        summary: content_html,
        questions: questions
    };
    // The 'admin_prompt' and 'last_updated' columns do not exist in the user's schema.
    const { error } = await supabase.from('courses').update({ content_html: courseContent, status: 'published' }).eq('course_id', course_id);
    if (error) throw error;
    return { message: `Course ${course_id} successfully published.` };
}

exports.handler = async (event) => {
    try {
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const authHeader = event.headers.authorization;
        if (!authHeader) throw new Error('Authorization header is missing.');
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            throw new Error('Access denied.');
        }

        const payload = JSON.parse(event.body);
        let result;

        switch (payload.action) {
            case 'upload_and_process':
                result = await uploadAndProcessFile(payload);
                break;
            case 'generate_content':
                result = await generateContent(payload);
                if (result.error) {
                    // The error object from generateContent now contains a message and a statusCode
                    const statusCode = result.error.statusCode || 400;
                    return { statusCode: statusCode, body: JSON.stringify({ error: result.error.message || result.error }) };
                }
                break;
            case 'publish_course':
                result = await publishCourse(payload);
                break;
            case 'text_to_speech':
                result = await textToSpeech(payload);
                break;
            case 'get_courses_admin':
                const { data, error } = await supabase.from('courses').select('course_id, title');
                if (error) throw error;
                result = data;
                break;
            case 'get_course_details':
                const { course_id: details_course_id } = payload;
                const { data: details_data, error: details_error } = await supabase.from('courses').select('*').eq('course_id', details_course_id).single();
                if (details_error) throw details_error;
                result = details_data;
                break;
            default:
                throw new Error('Unknown action.');
        }

        // Defensive check to prevent empty responses
        if (result === undefined) {
            throw new Error(`Server Error: Result is undefined for action '${payload.action}'. This indicates a logic error in the handler.`);
        }

        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        console.error('Error in admin-handler:', error); // Log the full error object
        // Provide more detailed error messages to the client for easier debugging
        const errorMessage = {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
        };
        return { statusCode: 500, body: JSON.stringify({ error: errorMessage }) };
    }
};

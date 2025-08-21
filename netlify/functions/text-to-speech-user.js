const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// This Supabase client uses the service key for admin-level access
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function textToSpeech(text) {
    if (!text) throw new Error('No text provided for speech synthesis.');
    if (!process.env.SPEECHIFY_API_KEY) throw new Error('Speechify API key is not configured.');
    const speechifyApiKey = process.env.SPEECHIFY_API_KEY;

    // Truncate text to 2000 characters to avoid hitting API limit.
    const truncatedText = text.substring(0, 2000);

    try {
        const response = await axios.post('https://api.sws.speechify.com/v1/audio/speech', {
            input: truncatedText, // Use truncated text
            voice_id: 'mikhail',
            language: 'ru-RU',
            model: 'simba-multilingual',
            audio_format: 'mp3'
        }, {
            headers: {
                'Authorization': `Bearer ${speechifyApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.audio_data) {
            return { audioUrl: `data:audio/mp3;base64,${response.data.audio_data}` };
        } else {
            console.error('Speechify API response did not contain audio_data:', response.data);
            throw new Error('Speechify API did not return audio data.');
        }

    } catch (error) {
        if (error.response) {
            console.error('Speechify API error response:', error.response.status, JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Speechify API request error:', error.message);
        }
        throw new Error('Failed to generate audio file from Speechify.');
    }
}

exports.handler = async (event) => {
    try {
        // Authenticate the user making the request
        const token = event.headers.authorization.split(' ')[1];
        // Use the anonymous key here for user authentication, not the service key
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // Get the course ID from the query string
        const { course_id } = event.queryStringParameters;
        if (!course_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'course_id is required' }) };
        }

        // Fetch the source_text for the given course
        const { data: courseData, error: courseError } = await supabase
            .from('courses')
            .select('source_text')
            .eq('course_id', course_id)
            .single();

        if (courseError || !courseData || !courseData.source_text) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Source text for this course not found.' }) };
        }

        // Initialize the Google Generative AI client
        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.0-pro-latest' });

        // Create the summarization prompt
        const summarizationPrompt = `Ты — AI-ассистент. Сделай краткий пересказ предоставленного текста. Пересказ должен быть строго в рамках документа и занимать примерно 5 минут при чтении (около 750 слов). ИСХОДНЫЙ ТЕКСТ: \n---\n${courseData.source_text}\n---`;

        // Generate the summary
        const summaryResult = await model.generateContent(summarizationPrompt);
        const summaryResponse = await summaryResult.response;
        const summaryText = summaryResponse.text();

        // Generate the audio from the summarized text
        const result = await textToSpeech(summaryText);
        return { statusCode: 200, body: JSON.stringify(result) };

    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

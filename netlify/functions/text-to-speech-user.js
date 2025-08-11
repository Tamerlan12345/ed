const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// This Supabase client uses the service key for admin-level access
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function textToSpeech(text) {
    if (!text) throw new Error('No text provided for speech synthesis.');
    if (!process.env.VOICERSS_API_KEY) throw new Error('VoiceRSS API key is not configured.');

    try {
        const response = await axios.get('http://api.voicerss.org/', {
            params: {
                key: process.env.VOICERSS_API_KEY,
                src: text,
                hl: 'ru-ru',
                c: 'MP3',
                f: '16khz_16bit_stereo',
                b64: true
            }
        });

        if (response.data.startsWith('ERROR')) {
            throw new Error(`VoiceRSS API Error: ${response.data}`);
        }

        return { audioUrl: response.data };

    } catch (error) {
        console.error('VoiceRSS API error:', error.message);
        throw new Error('Failed to generate audio file.');
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

        // Generate the audio from the source text
        const result = await textToSpeech(courseData.source_text);
        return { statusCode: 200, body: JSON.stringify(result) };

    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

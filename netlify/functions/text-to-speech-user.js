const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function textToSpeech(text) {
    if (!text) throw new Error('No text provided for speech synthesis.');

    try {
        const response = await axios.post('https://api.cloudmersive.com/speech/speak/text/to-speech/post', {
            "format": "mp3",
            "text": text
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Apikey': process.env.CLOUDMERSIVE_API_KEY
            }
        });

        if (response.data && response.data.AudioFileUrl) {
            return { audioUrl: response.data.AudioFileUrl };
        } else {
            throw new Error('Cloudmersive API did not return an audio URL.');
        }
    } catch (error) {
        console.error('Cloudmersive API error:', error.response ? error.response.data : error.message);
        throw new Error('Failed to generate audio file.');
    }
}

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        const { course_id } = event.queryStringParameters;
        if (!course_id) return { statusCode: 400, body: JSON.stringify({ error: 'Требуется course_id' }) };

        const { data: courseData, error: courseError } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (courseError || !courseData || !courseData.source_text) {
            throw new Error('Исходный текст для этого курса не найден.');
        }

        const result = await textToSpeech(courseData.source_text);
        return { statusCode: 200, body: JSON.stringify(result) };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

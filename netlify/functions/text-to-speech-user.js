const { createClient } = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

// This Supabase client uses the service key for admin-level access
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function textToSpeech(text) {
    if (!text) {
        throw new Error('No text provided for speech synthesis.');
    }

    // Check if the API key is available
    if (!process.env.CLOUDMERSIVE_API_KEY) {
        throw new Error('Cloudmersive API key is not configured.');
    }

    const defaultClient = CloudmersiveConvertApiClient.ApiClient.instance;
    const Apikey = defaultClient.authentications['Apikey'];
    Apikey.apiKey = process.env.CLOUDMERSIVE_API_KEY;

    const apiInstance = new CloudmersiveConvertApiClient.SpeakApi();
    const request = new CloudmersiveConvertApiClient.TextToSpeechRequest();
    request.Text = text;
    request.Format = 'mp3';

    return new Promise((resolve, reject) => {
        apiInstance.speakPost(request, (error, data, response) => {
            if (error) {
                console.error('Cloudmersive SDK error:', error);
                reject(new Error('Failed to generate audio file using Cloudmersive SDK.'));
            } else {
                const audioBase64 = Buffer.from(data).toString('base64');
                const audioUrl = `data:audio/mpeg;base64,${audioBase64}`;
                resolve({ audioUrl: audioUrl });
            }
        });
    });
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

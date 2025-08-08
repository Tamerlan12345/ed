const { createClient } = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const cloudmersiveClient = new CloudmersiveConvertApiClient.ConvertDocumentApi();
const cloudmersiveApiKey = process.env.CLOUDMERSIVE_API_KEY;

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { path } = body;
        const parts = path.split('/');
        const course_id = parts[0];

        if (!course_id || !path) {
            throw new Error('Invalid path in webhook payload.');
        }

        // Get public URL for the file from Supabase Storage
        const { data: urlData, error: urlError } = supabase
            .storage
            .from('1')
            .getPublicUrl(path);

        if (urlError) {
            throw urlError;
        }

        const publicURL = urlData.publicUrl;

        // Call Cloudmersive API to extract text
        const data = await new Promise((resolve, reject) => {
            const instance = new CloudmersiveConvertApiClient.ConvertDocumentApi();
            const opts = {
                'inputFileUrl': publicURL
            };
            instance.convertDocumentAutodetectToTxt(cloudmersiveApiKey, opts, (error, data, response) => {
                if (error) {
                    return reject(new Error(error.message || 'Cloudmersive API error'));
                }
                resolve(data);
            });
        });

        const textContent = data.TextResult;

        if (!textContent) {
            throw new Error('Could not extract text from the document.');
        }

        // Update the course in the database
        const { error: updateError } = await supabase
            .from('courses')
            .update({ source_text: textContent, status: 'processed' })
            .eq('course_id', course_id);

        if (updateError) {
            throw updateError;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully processed file for course ${course_id}.` })
        };

    } catch (error) {
        console.error('Error processing uploaded file:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An unknown error occurred.' })
        };
    }
};

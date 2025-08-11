const { createClient } = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const cloudmersiveApiKey = process.env.CLOUDMERSIVE_API_KEY;

exports.handler = async (event) => {
    console.log('--- New Request to process-uploaded-file ---');
    console.log('Received event:', JSON.stringify(event, null, 2));

    try {
        const body = JSON.parse(event.body);
        console.log('Request body successfully parsed.');

        const record = body.record;
        if (!record || !record.name) {
            throw new Error('Invalid webhook payload. "record.name" not found in the body.');
        }

        const path = record.name;
        const course_id = path.split('/')[0];

        if (!course_id || !path) {
            throw new Error('Invalid path derived from webhook payload.');
        }
        console.log(`Processing file for course_id: ${course_id}, path: ${path}`);

        console.log('Getting public URL from Supabase...');
        const { data: urlData, error: urlError } = supabase
            .storage
            .from('1')
            .getPublicUrl(path);

        if (urlError) {
            console.error('Supabase getPublicUrl error:', urlError);
            throw urlError;
        }

        const publicURL = urlData.publicUrl;
        console.log('Got public URL:', publicURL);

        console.log('Calling Cloudmersive API...');
        const data = await new Promise((resolve, reject) => {
            const instance = new CloudmersiveConvertApiClient.ConvertDocumentApi();
            const opts = { 'inputFileUrl': publicURL };
            instance.convertDocumentAutodetectToTxt(cloudmersiveApiKey, opts, (error, data, response) => {
                if (error) {
                    console.error('Cloudmersive API error:', error);
                    return reject(new Error(error.message || 'Cloudmersive API error'));
                }
                resolve(data);
            });
        });
        console.log('Cloudmersive API call successful.');

        const textContent = data.TextResult;

        if (!textContent) {
             console.log('Cloudmersive returned empty text content.');
            throw new Error('Could not extract text from the document.');
        }
        console.log(`SUCCESS: Extracted text. Length: ${textContent.length}. Preview: "${textContent.substring(0, 100)}..."`);

        console.log('Updating course in Supabase...');
        const { data: updateData, error: updateError } = await supabase
            .from('courses')
            .update({ source_text: textContent, status: 'processed' })
            .eq('course_id', course_id)
            .select(); // Ask Supabase to return the updated row

        if (updateError) {
            console.error('Supabase update error:', updateError);
            throw updateError;
        }
        console.log('SUCCESS: Supabase database updated.', JSON.stringify(updateData, null, 2));

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully processed file for course ${course_id}.` })
        };

    } catch (error) {
        console.error('--- DETAILED ERROR ---');
        console.error('Error Message:', error.message);
        console.error('Error Stack:', error.stack);
        console.error('Full Error Object:', JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An unknown error occurred.' })
        };
    }
};

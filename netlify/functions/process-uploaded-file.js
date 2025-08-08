const { createClient } = require('@supabase/supabase-js');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const cloudmersiveApiKey = process.env.CLOUDMERSIVE_API_KEY;

exports.handler = async (event) => {
    console.log('Received request to process-uploaded-file');
    try {
        const body = JSON.parse(event.body);
        console.log('Request body:', body);
        const { path } = body;
        const parts = path.split('/');
        const course_id = parts[0];

        if (!course_id || !path) {
            throw new Error('Invalid path in webhook payload.');
        }
        console.log(`Processing file for course_id: ${course_id}, path: ${path}`);

        // Get public URL for the file from Supabase Storage
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

        // Call Cloudmersive API to extract text
        console.log('Calling Cloudmersive API...');
        const data = await new Promise((resolve, reject) => {
            const instance = new CloudmersiveConvertApiClient.ConvertDocumentApi();
            const opts = {
                'inputFileUrl': publicURL
            };
            instance.convertDocumentAutodetectToTxt(cloudmersiveApiKey, opts, (error, data, response) => {
                if (error) {
                    console.error('Cloudmersive API error:', error);
                    return reject(new Error(error.message || 'Cloudmersive API error'));
                }
                console.log('Cloudmersive API success.');
                resolve(data);
            });
        });

        const textContent = data.TextResult;

        if (!textContent) {
            throw new Error('Could not extract text from the document.');
        }
        console.log(`Extracted text length: ${textContent.length}`);

        // Update the course in the database
        console.log('Updating course in Supabase...');
        const { error: updateError } = await supabase
            .from('courses')
            .update({ source_text: textContent, status: 'processed' })
            .eq('course_id', course_id);

        if (updateError) {
            console.error('Supabase update error:', updateError);
            throw updateError;
        }
        console.log('Course updated successfully.');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully processed file for course ${course_id}.` })
        };

    } catch (error) {
        console.error('Error in process-uploaded-file:', JSON.stringify(error, null, 2));
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An unknown error occurred.' })
        };
    }
};

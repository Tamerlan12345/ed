const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const CloudmersiveConvertApiClient = require('cloudmersive-convert-api-client');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
const cloudmersiveApiKey = process.env.CLOUDMERSIVE_API_KEY;

async function uploadAndProcessFile(payload) {
    const { course_id, title, file_name, file_data } = payload;

    // 1. Decode file data
    const buffer = Buffer.from(file_data, 'base64');
    const filePath = `${course_id}/${file_name}`;

    // 2. Upload file to Supabase Storage using Service Key
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('1')
        .upload(filePath, buffer, {
            contentType: 'application/octet-stream',
            upsert: true,
        });
    if (uploadError) throw uploadError;

    // 3. Get public URL
    const { data: urlData, error: urlError } = supabase.storage
        .from('1')
        .getPublicUrl(filePath);
    if (urlError) throw urlError;
    const publicURL = urlData.publicUrl;

    // 4. Call Cloudmersive API
    const cloudmersiveData = await new Promise((resolve, reject) => {
        const instance = new CloudmersiveConvertApiClient.ConvertDocumentApi();
        const opts = { 'inputFileUrl': publicURL };
        instance.convertDocumentAutodetectToTxt(cloudmersiveApiKey, opts, (error, data, response) => {
            if (error) return reject(new Error(error.message || 'Cloudmersive API error'));
            resolve(data);
        });
    });
    const textContent = cloudmersiveData.TextResult;
    if (!textContent) throw new Error('Could not extract text from the document.');

    // 5. Upsert course data into the database
    const { error: dbError } = await supabase
        .from('courses')
        .upsert({
            course_id: course_id,
            title: title,
            source_text: textContent,
            status: 'processed'
        }, { onConflict: 'course_id' });
    if (dbError) throw dbError;

    // 6. Return the extracted text to the frontend
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

    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonString);
}

async function publishCourse(payload) {
    const { course_id, content_html, questions, admin_prompt } = payload;
    const { error } = await supabase.from('courses').update({ content_html, questions, admin_prompt, status: 'published', last_updated: new Date().toISOString() }).eq('course_id', course_id);
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
                    return { statusCode: 400, body: JSON.stringify({ error: result.error }) };
                }
                break;
            case 'publish_course':
                result = await publishCourse(payload);
                break;
            default:
                throw new Error('Unknown action.');
        }

        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        console.error('Error in admin-handler:', JSON.stringify(error, null, 2));
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

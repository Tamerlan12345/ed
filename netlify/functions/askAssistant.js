const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
const GOOGLE_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

async function getFileContentFromGoogleDrive(fileId) {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType&key=${GOOGLE_API_KEY}`;
    const metaResponse = await fetch(metaUrl);
    if (!metaResponse.ok) throw new Error(`Google API Error (metadata): ${await metaResponse.text()}`);
    const metaData = await metaResponse.json();
    const mimeType = metaData.mimeType;
    let textContent = '';
    switch (mimeType) {
        case 'application/vnd.google-apps.document':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain&key=${GOOGLE_API_KEY}`;
            const exportResponse = await fetch(exportUrl);
            if (!exportResponse.ok) throw new Error(`Google API Error (export): ${await exportResponse.text()}`);
            textContent = await exportResponse.text();
            break;
        case 'application/pdf':
            const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
            const downloadResponse = await fetch(downloadUrl);
            if (!downloadResponse.ok) throw new Error(`Google API Error (download): ${await downloadResponse.text()}`);
            const pdfBuffer = await downloadResponse.arrayBuffer();
            textContent = (await pdf(Buffer.from(pdfBuffer))).text;
            break;
        default:
            throw new Error(`Unsupported file type: ${mimeType}.`);
    }
    return textContent;
}

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');
    
        const { course_id, question } = event.queryStringParameters;
        if (!course_id || !question) return { statusCode: 400, body: JSON.stringify({ error: 'Требуется course_id и question' }) };
    
        const { data: courseData, error: courseError } = await supabase.from('courses').select('doc_id').eq('course_id', course_id).single();
        if (courseError || !courseData) throw new Error('Документ для этого курса не найден.');

        const fileContent = await getFileContentFromGoogleDrive(courseData.doc_id);
        const prompt = `Задание: Ты — дружелюбный AI-ассистент. Ответь на вопрос сотрудника, используя ТОЛЬКО текст документа ниже. Если ответа в тексте нет, скажи: "К сожалению, в предоставленных материалах я не нашел ответа на этот вопрос." ВОПРОС: "${question}" ТЕКСТ ДОКУМЕНТА: --- ${fileContent} ---`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        return { statusCode: 200, body: JSON.stringify({ answer: response.text() }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

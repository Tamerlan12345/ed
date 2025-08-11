const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function getTextFromUrl(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        if (url.endsWith('.pdf')) {
            const data = await pdf(buffer);
            return data.text;
        } else if (url.endsWith('.docx')) {
            const { value } = await mammoth.extractRawText({ buffer });
            return value;
        } else if (url.includes('docs.google.com')) {
            // Handle Google Docs by exporting as PDF
            const exportUrl = url.replace('/edit', '/export?format=pdf');
            const exportResponse = await axios.get(exportUrl, { responseType: 'arraybuffer' });
            const pdfBuffer = Buffer.from(exportResponse.data);
            const data = await pdf(pdfBuffer);
            return data.text;
        } else {
            // Fallback for other text-based urls, might not work for all cases
            return buffer.toString('utf-8');
        }
    } catch (error) {
        console.error(`Failed to fetch or parse URL content: ${url}`, error);
        return null;
    }
}

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');
    
        const { course_id, question } = event.queryStringParameters;
        if (!course_id || !question) return { statusCode: 400, body: JSON.stringify({ error: 'Требуется course_id и question' }) };
    
        const { data: courseData, error: courseError } = await supabase.from('courses').select('*').eq('course_id', course_id).single();
        if (courseError || !courseData) {
            throw new Error('Курс не найден.');
        }

        let contextText = '';
        if (courseData.document_url) {
            contextText = await getTextFromUrl(courseData.document_url);
        }

        if (!contextText) {
            console.log(`Falling back to source_text for course: ${course_id}`);
            contextText = courseData.source_text;
        }

        if (!contextText) {
            throw new Error('Исходный текст для этого курса не найден.');
        }

        const promptParts = [
            'Задание: Ты — AI-ассистент. Ответь на вопрос, используя ТОЛЬКО предоставленный исходный текст.',
            'Если ответа в тексте нет, скажи: "К сожалению, в материалах нет ответа на этот вопрос."',
            `ВОПРОС: "${question}"`,
            'ИСХОДНЫЙ ТЕКСТ:',
            '---',
            contextText,
            '---'
        ];
        const prompt = promptParts.join('\n');
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        return { statusCode: 200, body: JSON.stringify({ answer: response.text() }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message, stack: error.stack }) };
    }
};

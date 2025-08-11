const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');
    
        const { course_id, question } = event.queryStringParameters;
        if (!course_id || !question) return { statusCode: 400, body: JSON.stringify({ error: 'Требуется course_id и question' }) };
    
        const { data: courseData, error: courseError } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (courseError || !courseData || !courseData.source_text) {
            throw new Error('Исходный текст для этого курса не найден.');
        }

        const promptParts = [
            'Задание: Ты — AI-ассистент. Ответь на вопрос, используя ТОЛЬКО предоставленный исходный текст.',
            'Если ответа в тексте нет, скажи: "К сожалению, в материалах нет ответа на этот вопрос."',
            `ВОПРОС: "${question}"`,
            'ИСХОДНЫЙ ТЕКСТ:',
            '---',
            courseData.source_text,
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

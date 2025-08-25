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

        let answer = '';
        const maxRetries = 3;
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                answer = response.text();
                break; // Success, exit loop
            } catch (error) {
                lastError = error;
                console.error(`askAssistant: Attempt ${i + 1} failed. Error: ${error.message}`);
                if (i < maxRetries - 1) {
                    const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000; // Exponential backoff with jitter
                    console.log(`askAssistant: Retrying in ${Math.round(waitTime / 1000)}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        if (!answer) {
            console.error('askAssistant: All retries failed.');
            throw new Error(`Не удалось получить ответ от AI-ассистента после ${maxRetries} попыток. ${lastError ? lastError.message : ''}`);
        }

        const { error: insertError } = await supabase
            .from('user_questions')
            .insert({
                course_id: course_id,
                user_id: user.id,
                question: question,
                answer: answer
            });

        if (insertError) {
            console.error('Failed to save user question:', insertError);
        }
        
        return { statusCode: 200, body: JSON.stringify({ answer: answer }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message, stack: error.stack }) };
    }
};

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

exports.handler = async (event) => {
    try {
        // Example of admin check, assuming you pass a token
        // const token = event.headers.authorization.split(' ')[1];
        // const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        // if (authError || !user || user.email !== 'admin@cic.kz') throw new Error('Access denied');

        const { course_id, custom_prompt } = JSON.parse(event.body);

        const { data: courseData, error: courseError } = await supabase
            .from('courses')
            .select('source_text')
            .eq('course_id', course_id)
            .single();

        if (courseError || !courseData || !courseData.source_text) {
            throw new Error('Source text not found for the given course_id.');
        }

        const defaultPrompt = `Задание: Ты — опытный AI-наставник. Создай подробный и понятный пошаговый план обучения из 3-5 уроков на основе текста документа. Требования к результату: 1. Для каждого урока создай: "title" (заголовок) и "html_content" (подробный текст в HTML). 2. После всех уроков создай 5 тестовых вопросов. 3. Верни результат СТРОГО в формате JSON. Структура JSON: { "summary": [], "questions": [] } ТЕКСТ ДОКУМЕНТА: --- ${courseData.source_text} ---`;
        
        const finalPrompt = custom_prompt ? `${custom_prompt} ИСХОДНЫЙ ТЕКСТ: --- ${courseData.source_text} ---` : defaultPrompt;

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const generatedContent = JSON.parse(jsonString);

        return {
            statusCode: 200,
            body: JSON.stringify(generatedContent)
        };

    } catch (error) {
        console.error("Error in admin-generate-content:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

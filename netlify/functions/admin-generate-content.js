const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ... (инициализация клиентов Supabase и Gemini)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

exports.handler = async (event) => {
    try {
        // Проверка, что это админ
        // const token = event.headers.authorization.split(' ')[1];
        // const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        // if (authError || !user || user.email !== 'admin@cic.kz') throw new Error('Access denied');

        const { course_id, custom_prompt } = JSON.parse(event.body);

        // 1. Получаем "сырой" текст из базы
        const { data: courseData, error: courseError } = await supabase
            .from('courses')
            .select('source_text')
            .eq('course_id', course_id)
            .single();
        if (courseError || !courseData.source_text) throw new Error('Исходный текст не найден.');

        // 2. Выбираем, какой промпт использовать
        const defaultPrompt = `Задание: Ты — опытный AI-наставник. Создай подробный и понятный пошаговый план обучения из 3-5 уроков на основе текста документа. Требования к результату: 1. Для каждого урока создай: "title" (заголовок) и "html_content" (подробный текст в HTML). 2. После всех уроков создай 5 тестовых вопросов. 3. Верни результат СТРОГО в формате JSON. Структура JSON: { "summary": [], "questions": [] } ТЕКСТ ДОКУМЕНТА: --- ${courseData.source_text} ---`;
        
        const finalPrompt = custom_prompt ? `${custom_prompt} ИСХОДНЫЙ ТЕКСТ: --- ${courseData.source_text} ---` : defaultPrompt;

        // 3. Генерируем контент
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const jsonString = response.text().replace(/```json/g, '').replace(/```g, '').trim();
        const generatedContent = JSON.parse(jsonString);

        // 4. Возвращаем черновик для проверки админом
        return {
            statusCode: 200,
            body: JSON.stringify(generatedContent)
        };

    } catch (error) {
        console.error("Ошибка генерации:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

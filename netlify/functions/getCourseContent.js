const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

// Инициализация клиентов
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Функция для чтения файла с GitHub
async function getFileContentFromGitHub(fileName) {
    const user = process.env.GITHUB_USER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH;
    
    // Формируем URL к "сырому" файлу на GitHub
    const fileUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/course_materials/${fileName}`;
    
    console.log(`Загрузка файла с GitHub: ${fileUrl}`);

    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error(`Не удалось скачать файл с GitHub. Статус: ${response.statusText}. Убедитесь, что репозиторий публичный и путь к файлу верный.`);
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());

    if (fileName.toLowerCase().endsWith('.pdf')) {
        const data = await pdf(fileBuffer);
        return data.text;
    } else if (fileName.toLowerCase().endsWith('.docx')) {
        const { value } = await mammoth.extractRawText({ buffer: fileBuffer });
        return value;
    } else {
        throw new Error('Поддерживаются только .pdf и .docx файлы из GitHub.');
    }
}

// Функция для генерации курса через AI
async function generateCourseFromAI(fileContent) {
    const prompt = `Задание: Ты — опытный AI-наставник. Создай подробный и понятный пошаговый план обучения из 3-5 уроков (слайдов) на основе текста документа. Каждый раз генерируй немного разный текст и примеры, но СТРОГО в рамках документа. Требования к результату: 1. Для каждого урока-слайда создай: "title" (заголовок) и "html_content" (подробный обучающий текст в HTML-разметке). 2. После всех уроков создай 5 тестовых вопросов по всему материалу. 3. Верни результат СТРОГО в формате JSON. Структура JSON: { "summary": [ { "title": "Урок 1: Введение", "html_content": "<p>Текст...</p>" } ], "questions": [ { "question": "Вопрос 1", "options": ["A", "B", "C"], "correct_option_index": 0 } ] } ТЕКСТ ДОКУМЕНТА ДЛЯ ОБРАБОТКИ: --- ${fileContent.replace(/`/g, "'")} ---`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonString = response.text().replace(/```json/g, '').replace(/```g, '').trim();
    return JSON.parse(jsonString);
}

// Основной обработчик
exports.handler = async (event) => {
    try {
        // 1. Авторизация
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        // 2. Получение параметров
        const { course_id, force_regenerate } = event.queryStringParameters;
        if (!course_id) return { statusCode: 400, body: JSON.stringify({ error: 'course_id is required' }) };

        // 3. Поиск курса в базе данных
        const { data: courseData, error: courseError } = await supabase.from('courses').select('doc_id, content_html, questions').eq('course_id', course_id).single();
        if (courseError || !courseData) throw new Error('Курс не найден в базе данных.');

        // 4. Проверка кэша
        if (courseData.content_html && courseData.questions && force_regenerate !== 'true') {
            return { statusCode: 200, body: JSON.stringify({ summary: courseData.content_html, questions: courseData.questions }) };
        }

        // 5. Генерация нового контента
        const fileContent = await getFileContentFromGitHub(courseData.doc_id); // doc_id содержит имя файла
        const newContent = await generateCourseFromAI(fileContent);

        // 6. Сохранение нового контента в базу
        const { error: updateError } = await supabase.from('courses').update({ content_html: newContent.summary, questions: newContent.questions, last_updated: new Date().toISOString() }).eq('course_id', course_id);
        if (updateError) throw updateError;

        return { statusCode: 200, body: JSON.stringify(newContent) };
    } catch (error) {
        console.error("Сбой в getCourseContent:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message, stack: error.stack }) };
    }
};

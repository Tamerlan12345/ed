const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function getFileContentFromGitHub(fileName) {
    const user = process.env.GITHUB_USER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH;
    const fileUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/course_materials/${fileName}`;
    
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Не удалось скачать файл с GitHub: ${response.statusText}`);
    const fileBuffer = Buffer.from(await response.arrayBuffer());

    if (fileName.toLowerCase().endsWith('.pdf')) return (await pdf(fileBuffer)).text;
    if (fileName.toLowerCase().endsWith('.docx')) return (await mammoth.extractRawText({ buffer: fileBuffer })).value;
    throw new Error('Поддерживаются только .pdf и .docx.');
}

async function generateCourseFromAI(textContent) {
    // НОВАЯ ЛОГИКА: Формируем команду в виде JSON-объекта
    const command = {
        role: "AI-наставник",
        task: "Создай подробный и понятный пошаговый план обучения из 3-5 уроков (слайдов) на основе предоставленного текста. Объясняй материал немного по-разному, но СТРОГО в рамках текста.",
        output_format: {
            summary: [ { title: "Заголовок урока", html_content: "<p>HTML-текст урока...</p>" } ],
            questions: [ { question: "Текст вопроса", options: ["A", "B", "C"], correct_option_index: 0 } ]
        },
        source_text: textContent
    };
    // Превращаем команду в однострочный текст
    const prompt = JSON.stringify(command);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonString = response.text().replace(/```json/g, '').replace(/```g, '').trim();
    return JSON.parse(jsonString);
}

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        const { course_id, force_regenerate } = event.queryStringParameters;
        if (!course_id) return { statusCode: 400, body: JSON.stringify({ error: 'course_id is required' }) };

        const { data: courseData, error: courseError } = await supabase.from('courses').select('doc_id, content_html, questions').eq('course_id', course_id).single();
        if (courseError || !courseData) throw new Error('Курс не найден.');

        if (courseData.content_html && courseData.questions && force_regenerate !== 'true') {
            return { statusCode: 200, body: JSON.stringify({ summary: courseData.content_html, questions: courseData.questions }) };
        }

        const fileContent = await getFileContentFromGitHub(courseData.doc_id);
        const newContent = await generateCourseFromAI(fileContent);

        const { error: updateError } = await supabase.from('courses').update({ content_html: newContent.summary, questions: newContent.questions, last_updated: new Date().toISOString() }).eq('course_

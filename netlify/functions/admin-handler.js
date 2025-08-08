const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function processFile(payload) {
    const { course_id, title, file_name, file_data } = payload;
    const buffer = Buffer.from(file_data, 'base64');
    let textContent = '';

    if (file_name.toLowerCase().endsWith('.pdf')) {
        textContent = (await pdf(buffer)).text;
    } else if (file_name.toLowerCase().endsWith('.docx')) {
        textContent = (await mammoth.extractRawText({ buffer })).value;
    } else {
        throw new Error('Неподдерживаемый тип файла.');
    }

    const { error } = await supabase.from('courses').upsert({
        course_id: course_id,
        title: title,
        source_text: textContent,
        status: 'draft'
    }, { onConflict: 'course_id' });

    if (error) throw error;
    return { extractedText: textContent.substring(0, 500) + '...' };
}

async function generateContent(payload) {
    const { course_id, custom_prompt } = payload;
    const { data: courseData, error } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
    if (error || !courseData) throw new Error('Исходный текст не найден.');

    const defaultCommand = {
        task: "Создай пошаговый план обучения из 3-5 уроков и 5 тестов по тексту.",
        output_format: { summary: [{ title: "string", html_content: "string" }], questions: [{ question: "string", options: ["string"], correct_option_index: 0 }] },
        source_text: courseData.source_text
    };
    
    const finalPrompt = custom_prompt ? custom_prompt + ` ИСХОДНЫЙ ТЕКСТ: ${courseData.source_text}` : JSON.stringify(defaultCommand);
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const jsonString = response.text().replace(/```json/g, '').replace(/```g, '').trim();
    return JSON.parse(jsonString);
}

async function publishCourse(payload) {
    const { course_id, content_html, questions, admin_prompt } = payload;
    const { error } = await supabase.from('courses').update({
        content_html, questions, admin_prompt, status: 'published', last_updated: new Date().toISOString()
    }).eq('course_id', course_id);
    if (error) throw error;
    return { message: `Курс ${course_id} успешно опубликован.` };
}

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            throw new Error('Доступ запрещен.');
        }

        const payload = JSON.parse(event.body);
        let result;

        switch (payload.action) {
            case 'process_file': result = await processFile(payload); break;
            case 'generate_content': result = await generateContent(payload); break;
            case 'publish_course': result = await publishCourse(payload); break;
            default: throw new Error('Неизвестное действие.');
        }
        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

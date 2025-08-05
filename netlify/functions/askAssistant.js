const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function getFileContentFromGitHub(fileName) {
    const user = process.env.GITHUB_USER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH;
    const fileUrl = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/course_materials/${fileName}`;
    
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Не удалось скачать файл с GitHub. Статус: ${response.statusText}`);
    const fileBuffer = Buffer.from(await response.arrayBuffer());

    if (fileName.toLowerCase().endsWith('.pdf')) return (await pdf(fileBuffer)).text;
    if (fileName.toLowerCase().endsWith('.docx')) return (await mammoth.extractRawText({ buffer: fileBuffer })).value;
    throw new Error('Поддерживаются только .pdf и .docx файлы.');
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

        const fileContent = await getFileContentFromGitHub(courseData.doc_id);
        
        const promptParts = [
            'Задание: Ты — дружелюбный AI-ассистент. Ответь на вопрос сотрудника, используя ТОЛЬКО текст документа ниже.',
            'Если ответа в тексте нет, скажи: "К сожалению, в предоставленных материалах я не нашел ответа на этот вопрос."',
            `ВОПРОС: "${question}"`,
            'ТЕКСТ ДОКУМЕНТА:',
            '---',
            fileContent,
            '---'
        ];
        const prompt = promptParts.join('\n');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        return { statusCode: 200, body: JSON.stringify({ answer: response.text() }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

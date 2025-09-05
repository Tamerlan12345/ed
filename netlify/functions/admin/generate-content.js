const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

exports.handler = async (event) => {
    try {
        const { course_id, custom_prompt } = JSON.parse(event.body);

        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const { data: courseData, error } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (error || !courseData || !courseData.source_text) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Course source text not found or not yet processed. Please wait a moment for the file to be analyzed and try again.' }) };
        }

        let finalPrompt;
        const outputFormat = {
            summary: [{ title: "string", html_content: "string" }],
            questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
        };

        if (custom_prompt) {
            const instruction = `Задание: ${custom_prompt}\n\nИСХОДНЫЙ ТЕКСТ:\n${courseData.source_text}\n\nОбязательно верни результат в формате JSON со следующей структурой: ${JSON.stringify(outputFormat)}`;
            finalPrompt = instruction;
        } else {
            const newTask = `
            ЗАДАНИЕ: Создай исчерпывающий и профессиональный учебный курс на основе предоставленного текста.
            ТВОЯ РОЛЬ: Ты — команда экспертов...
            ТРЕБОВАНИЯ К РЕЗУЛЬТАТУ:
            1.  **Учебные слайды:** ...
            2.  **Тестовые вопросы:** ...
            ИСПОЛЬЗУЙ ТОЛЬКО ПРЕДОСТАВЛЕННЫЙ ИСХОДНЫЙ ТЕКСТ.
            `;
            const command = {
                task: newTask,
                output_format: outputFormat,
                source_text: courseData.source_text
            };
            finalPrompt = JSON.stringify(command);
        }

        const maxRetries = 5;
        let lastError = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                console.log(`Generating content, attempt ${i + 1}`);
                const result = await model.generateContent(finalPrompt);
                const response = await result.response;
                const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                const parsedJson = JSON.parse(jsonString);

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        summary: parsedJson.summary || [],
                        questions: parsedJson.questions || []
                    })
                };

            } catch (e) {
                lastError = e;
                console.error(`Attempt ${i + 1} failed. Error: ${e.message}`);
                if (i === maxRetries - 1) break;
                if (e.message && (e.message.includes('429') || e.message.includes('503'))) {
                    const waitTime = e.message.includes('429') ? 60000 : Math.pow(2, i) * 1000;
                    console.warn(`API error. Retrying in ${waitTime / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }

        console.error('All retries failed for content generation.');
        throw new Error(lastError.message || 'Unknown error during content generation.');

    } catch (error) {
        return handleError(error, 'generate-content');
    }
};

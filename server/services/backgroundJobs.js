const { createSupabaseAdminClient } = require('../lib/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient: createPexelsClient } = require('pexels');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pexelsClient = process.env.PEXELS_API_KEY ? createPexelsClient(process.env.PEXELS_API_KEY) : null;
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function handleUploadAndProcess(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`Failed to update job ${jobId} status to ${status}:`, error);
    };

    try {
        let { course_id, title, file_name, file_data } = payload;
        console.log(`[Job ${jobId}] Starting processing for course ID: ${course_id}`);

        const buffer = Buffer.from(file_data, 'base64');
        let textContent = '';

        if (file_name.endsWith('.docx')) {
            const { value } = await mammoth.extractRawText({ buffer });
            textContent = value;
        } else if (file_name.endsWith('.pdf')) {
            const data = await pdf(buffer);
            textContent = data.text;
        } else {
            throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
        }

        if (!textContent) throw new Error('Could not extract text from the document.');

        console.log(`[Job ${jobId}] Text extracted. Saving to database for course ID: ${course_id}...`);

        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ description: textContent })
            .eq('id', course_id);

        if (dbError) throw new Error(`Failed to save course content: ${dbError.message}`);

        console.log(`[Job ${jobId}] Processing completed successfully for course ID: ${course_id}.`);
        await updateJobStatus('completed', { message: `File processed for course ${course_id}` });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during processing:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

async function handleGenerateContent(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    try {
        const { course_id, custom_prompt } = payload;
        if (!course_id) {
            throw new Error('Valid course_id is required for content generation.');
        }
        console.log(`[Job ${jobId}] Starting content generation for course ${course_id}`);

        const { data: courseData, error: fetchError } = await supabaseAdmin.from('courses').select('description').eq('id', course_id).single();
        if (fetchError || !courseData?.description) {
            throw new Error('Course description not found or not yet processed.');
        }

        const outputFormat = {
            summary: [
                {
                    slide_title: "string (Заголовок слайда)",
                    html_content: "string (HTML-контент слайда...)",
                    image_search_term: "string (1-2 слова на английском для поиска картинки на Pexels)"
                }
            ],
            questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
        };
        const finalPrompt = `Задание: ${custom_prompt || 'Создай исчерпывающий учебный курс на основе текста.'}

ИСХОДНЫЙ ТЕКСТ:
${courseData.description}

ТРЕБОВАНИЯ К ФОРМАТУ ВЫВОДА:
Обязательно верни результат в формате JSON, соответствующем этой структуре: ${JSON.stringify(outputFormat)}

КЛЮЧЕВЫЕ ТРЕБОВАНИЯ К КОНТЕНТУ:
1.  **Презентация (summary):** Создай содержательную и ОЧЕНЬ информативную HTML-презентацию. Если в задании от пользователя не указано иное, сделай ровно 8 слайдов. Пользователь в своем задании может попросить изменить количество слайдов или объем контента — следуй его указаниям. В каждом слайде давай максимально подробные объяснения, приводи конкретные примеры, и раскрывай тему как можно полнее, чтобы контент был исчерпывающим и полезным. Активно используй теги <h2>, <p>, <ul>, <li>, <strong>.
2.  **Тест (questions):** Массив "questions" должен содержать как минимум 5 вопросов для теста с 4 вариантами ответа каждый.
3.  **Поиск картинок (image_search_term):** Для каждого слайда придумай простой поисковый запрос из 1-2 слов на английском языке для поиска релевантной фотографии на сайте Pexels.
`;

        console.log(`[Job ${jobId}] Generating content with Gemini...`);
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const jsonString = response.text().replace(/```json\n|```/g, '').trim();

        const parsedContent = JSON.parse(jsonString);

        if (pexelsClient && parsedContent.summary && Array.isArray(parsedContent.summary)) {
            for (const slide of parsedContent.summary) {
                if (slide.image_search_term) {
                    try {
                        const query = slide.image_search_term;
                        const pexelsResponse = await pexelsClient.photos.search({ query, per_page: 1 });
                        if (pexelsResponse.photos && pexelsResponse.photos.length > 0) {
                            slide.image_url = pexelsResponse.photos[0].src.large;
                        }
                    } catch (pexelsError) {
                        console.error(`Pexels API call failed for term "${slide.image_search_term}":`, pexelsError);
                    }
                }
            }
        }

        console.log(`[Job ${jobId}] Content generated, now with images. Saving to database...`);
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ content: parsedContent })
            .eq('id', course_id);

        if (dbError) throw new Error(`Failed to save generated content: ${dbError.message}`);

        console.log(`[Job ${jobId}] Content generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Content generated and saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during content generation:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

async function handleGenerateSummary(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    try {
        const { course_id } = payload;
        if (!course_id) {
            throw new Error('Valid course_id is required for summary generation.');
        }
        console.log(`[Job ${jobId}] Starting summary generation for course ${course_id}`);

        // Fetch the full description to generate a summary from it.
        const { data: courseData, error: fetchError } = await supabaseAdmin
            .from('courses')
            .select('description')
            .eq('id', course_id)
            .single();

        if (fetchError || !courseData?.description) {
            throw new Error('Course description not found or not yet processed.');
        }

        const finalPrompt = `На основе предоставленного текста, напиши краткое и емкое саммари (аннотацию) для учебного курса. Объем — 2-3 предложения. Стиль — деловой, привлекательный для пользователя. ИСХОДНЫЙ ТЕКСТ: ${courseData.description}`;

        console.log(`[Job ${jobId}] Generating summary with Gemini...`);
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const summaryText = response.text().trim();

        console.log(`[Job ${jobId}] Summary generated. Saving to database...`);
        // We update the 'description' field with the newly generated summary.
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ description: summaryText })
            .eq('id', course_id);

        if (dbError) throw new Error(`Failed to save generated summary: ${dbError.message}`);

        console.log(`[Job ${jobId}] Summary generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Summary generated and saved.', new_description: summaryText });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during summary generation:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

module.exports = {
    handleUploadAndProcess,
    handleGenerateContent,
    handleGenerateSummary,
};

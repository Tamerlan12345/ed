const { createSupabaseAdminClient } = require('../lib/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient: createPexelsClient } = require('pexels');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const axios = require('axios');
const cheerio = require('cheerio');


// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pexelsClient = process.env.PEXELS_API_KEY ? createPexelsClient(process.env.PEXELS_API_KEY) : null;
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function handlePresentationProcessing(jobId, payload) {
    const supabaseAdmin = createSupabaseAdminClient();
    const { course_id, presentation_url } = payload;

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabaseAdmin
            .from('background_jobs')
            .update({ status, payload: data, last_error: errorMessage, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        if (error) console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
    };

    try {
        console.log(`[Job ${jobId}] Starting PDF-based presentation processing for course ${course_id} from URL: ${presentation_url}`);

        // 1. Extract the presentation ID from any valid Google Slides URL.
        const match = presentation_url.match(/\/d\/(.*?)\//);
        if (!match || !match[1]) {
            throw new Error('Invalid Google Slides URL. Could not extract presentation ID.');
        }
        const presentationId = match[1];

        // 2. Construct the PDF export URL.
        const pdfUrl = `https://docs.google.com/presentation/d/${presentationId}/export/pdf`;
        console.log(`[Job ${jobId}] Converted to PDF URL: ${pdfUrl}`);


        // 3. Fetch the PDF content from the export URL
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
        const pdfBuffer = response.data;

        // 4. Extract text using pdf-parse
        const data = await pdf(pdfBuffer);
        const textContent = data.text.replace(/\s+/g, ' ').trim();

        if (!textContent) {
            throw new Error('Could not extract any text from the presentation PDF. The presentation might be empty or image-based.');
        }

        console.log(`[Job ${jobId}] Extracted text length: ${textContent.length}. Saving to course description...`);

        // 5. Save the extracted text to the course's description
        const { error: updateError } = await supabaseAdmin
            .from('courses')
            .update({ description: textContent })
            .eq('id', course_id);

        if (updateError) throw new Error(`Failed to save extracted text to course: ${updateError.message}`);

        console.log(`[Job ${jobId}] Text saved. Triggering content generation for questions only.`);

        // 6. Trigger the handleGenerateContent job for questions only
        const newJobId = require('crypto').randomUUID();
        const newJobPayload = { course_id, generation_mode: 'questions_only' };

        await supabaseAdmin.from('background_jobs').insert({
            id: newJobId,
            job_type: 'content_generation_questions_only',
            status: 'pending',
            payload: newJobPayload
        });

        // Asynchronously start the job without awaiting its completion
        handleGenerateContent(newJobId, newJobPayload).catch(console.error);

        await updateJobStatus('completed', { message: `Presentation processed for course ${course_id}. Question generation started.` });

    } catch (error) {
        console.error(`[Job ${jobId}] Error during presentation processing:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}


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
        console.log(`[Job ${jobId}] Starting processing for course ID: ${course_id}, File: ${file_name}`);

        const buffer = Buffer.from(file_data, 'base64');
        let textContent = '';

        console.log(`[Job ${jobId}] Buffer created, size: ${buffer.length}. Detecting file type.`);
        if (file_name.endsWith('.docx')) {
            console.log(`[Job ${jobId}] Processing .docx file with mammoth...`);
            const { value } = await mammoth.extractRawText({ buffer });
            textContent = value;
            console.log(`[Job ${jobId}] .docx processing complete. Text length: ${textContent.length}`);
        } else if (file_name.endsWith('.pdf')) {
            console.log(`[Job ${jobId}] Processing .pdf file with pdf-parse...`);
            const data = await pdf(buffer);
            textContent = data.text;
            console.log(`[Job ${jobId}] .pdf processing complete. Text length: ${textContent.length}`);
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
        const { course_id, custom_prompt, generation_mode } = payload;
        if (!course_id) {
            throw new Error('Valid course_id is required for content generation.');
        }
        console.log(`[Job ${jobId}] Starting content generation for course ${course_id} with mode: ${generation_mode || 'full'}`);

        const { data: courseData, error: fetchError } = await supabaseAdmin.from('courses').select('description, content').eq('id', course_id).single();
        if (fetchError || !courseData?.description) {
            throw new Error('Course description not found or not yet processed.');
        }

        let finalPrompt;
        let parsedContent;

        if (generation_mode === 'questions_only') {
            const outputFormat = {
                questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
            };
            finalPrompt = `ЗАДАНИЕ: На основе ИСХОДНОГО ТЕКСТА, сгенерируй набор тестовых вопросов.

ИСХОДНЫЙ ТЕКСТ:
${courseData.description}

ТРЕБОВАНИЯ К ФОРМАТУ ВЫВОДА:
- Обязательно верни результат в формате JSON, соответствующем этой структуре: ${JSON.stringify(outputFormat)}
- Массив "questions" должен содержать как минимум 5 вопросов для теста.
- У каждого вопроса должно быть 4 варианта ответа.
- Укажи правильный вариант ответа в "correct_option_index".
- Не добавляй в вывод никаких других полей или секций, только "questions".
`;
            console.log(`[Job ${jobId}] Generating questions only with Gemini...`);
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const jsonString = response.text().replace(/```json\n|```/g, '').trim();

            // Merge new questions with existing content (which might have summary)
            const newContent = JSON.parse(jsonString);
            parsedContent = {
                ...courseData.content, // Preserve existing content like summary
                questions: newContent.questions
            };

        } else {
            // Full generation logic (summary + questions)
            const outputFormat = {
                summary: {
                    slides: [{
                        slide_title: "string (Заголовок слайда)",
                        html_content: "string (HTML-контент слайда...)",
                        image_search_term: "string (1-2 слова на английском для поиска картинки на Pexels)"
                    }]
                },
                questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
            };
            finalPrompt = `Задание: ${custom_prompt || 'Создай исчерпывающий учебный курс на основе текста.'}

ИСХОДНЫЙ ТЕКСТ:
${courseData.description}

ТРЕБОВАНИЯ К ФОРМАТУ ВЫВОДА:
Обязательно верни результат в формате JSON, соответствующем этой структуре: ${JSON.stringify(outputFormat)}

КЛЮЧЕВЫЕ ТРЕБОВАНИЯ К КОНТЕНТУ:
1.  **Презентация (summary):** Создай содержательную и ОЧЕНЬ информативную HTML-презентацию. Если в задании от пользователя не указано иное, сделай ровно 8 слайдов. Пользователь в своем задании может попросить изменить количество слайдов или объем контента — следуй его указаниям. В каждом слайде давай максимально подробные объяснения, приводи конкретные примеры, и раскрывай тему как можно полнее, чтобы контент был исчерпывающим и полезным. Активно используй теги <h2>, <p>, <ul>, <li>, <strong>.
2.  **Тест (questions):** Массив "questions" должен содержать как минимум 5 вопросов для теста с 4 вариантами ответа каждый.
3.  **Поиск картинок (image_search_term):** Для каждого слайда придумай простой поисковый запрос из 1-2 слов на английском языке для поиска релевантной фотографии на сайте Pexels.
`;
            console.log(`[Job ${jobId}] Generating full content with Gemini...`);
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const jsonString = response.text().replace(/```json\n|```/g, '').trim();
            parsedContent = JSON.parse(jsonString);

            if (pexelsClient && parsedContent.summary && Array.isArray(parsedContent.summary.slides)) {
                for (const slide of parsedContent.summary.slides) {
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
        }

        console.log(`[Job ${jobId}] Content generated. Saving to database...`);
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ content: parsedContent, draft_content: parsedContent }) // Also save to draft
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
    handlePresentationProcessing,
    handleUploadAndProcess,
    handleGenerateContent,
    handleGenerateSummary,
};

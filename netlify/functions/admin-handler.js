const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');

// Initialize Supabase and Gemini AI
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function uploadAndProcessFile(payload) {
    const { course_id, title, product_line, file_name, file_data } = payload;
    const buffer = Buffer.from(file_data, 'base64');
    let textContent = '';

    try {
        if (file_name.endsWith('.docx')) {
            const { value } = await mammoth.extractRawText({ buffer });
            textContent = value;
        } else if (file_name.endsWith('.pdf')) {
            const data = await pdf(buffer);
            textContent = data.text;
        } else {
            throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
        }

        if (!textContent) {
            throw new Error('Could not extract text from the document. The file might be empty or corrupted.');
        }
    } catch (e) {
        console.error('File parsing error:', e);
        throw new Error(`Failed to process file: ${e.message}`);
    }

    // Upsert course data into the database
    const { error: dbError } = await supabase
        .from('courses')
        .upsert({
            course_id: course_id,
            title: title,
            product_line: product_line,
            source_text: textContent,
            status: 'processed'
        }, { onConflict: 'course_id' });

    if (dbError) {
        console.error('Supabase upsert error:', dbError);
        throw new Error('Failed to save course content to the database.');
    }

    // Return the extracted text to the frontend
    return { extractedText: textContent };
}


async function generateContent(payload) {
    const { course_id, custom_prompt } = payload;
    const { data: courseData, error } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
    if (error || !courseData || !courseData.source_text) {
        return { error: 'Course source text not found or not yet processed. Please wait a moment for the file to be analyzed and try again.' };
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

        ТВОЯ РОЛЬ: Ты — команда экспертов, состоящая из:
        1.  **Профессионального методолога:** Твоя задача — структурировать материал в логические, легко усваиваемые учебные блоки (слайды). Каждый слайд должен иметь четкий заголовок и содержать отформатированный HTML-контент. Структура должна быть последовательной и вести ученика от основ к сложным темам.
        2.  **Опытного андеррайтера и юриста:** Твоя задача — обеспечить точность, полноту и юридическую корректность всего материала. Ты должен выделить ключевые моменты, правила, исключения и важные детали, которые критичны для понимания темы. Убедись, что контент является авторитетным и надежным.

        ТРЕБОВАНИЯ К РЕЗУЛЬТАТУ:
        1.  **Учебные слайды:** Сгенерируй чрезвычайно подробный и исчерпывающий учебный материал. Разбей его на 15-30 логических слайдов. Каждый слайд должен быть объектом с полями "title" и "html_content". Контент должен быть максимально детализированным, профессиональным, и полностью раскрывать все аспекты исходного текста. Удели особое внимание объяснению сложных терминов, примерам и практическим деталям.
        2.  **Тестовые вопросы:** Создай ровно 30 (тридцать) тестовых вопросов для проверки знаний по всему материалу. Вопросы должны быть сложными, разнообразными и охватывать все ключевые аспекты учебного курса. Каждый вопрос должен иметь 4 варианта ответа и указание на правильный.

        ИСПОЛЬЗУЙ ТОЛЬКО ПРЕДОСТАВЛЕННЫЙ ИСХОДНЫЙ ТЕКСТ. Не добавляй информацию извне.
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

            // Try to parse the JSON. If it fails, the catch block will trigger a retry.
            const parsedJson = JSON.parse(jsonString);
            return parsedJson; // Success

        } catch (e) {
            lastError = e;
            console.error(`Attempt ${i + 1} failed. Error: ${e.message}`);

            // If this is the last attempt, break the loop and report the error.
            if (i === maxRetries - 1) {
                console.error('All retries failed for content generation.');
                break;
            }

            // Handle specific API errors with backoff, or retry immediately for parsing errors
            if (e.message && e.message.includes('429')) {
                const waitTime = 60 * 1000;
                console.warn(`Quota exceeded (429). Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else if (e.message && e.message.includes('503')) {
                const waitTime = Math.pow(2, i) * 1000;
                console.warn(`Service unavailable (503). Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                // For other errors (like JSON parsing), wait a short moment before retrying
                console.warn('An error occurred. Retrying in 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // If all retries fail, return an informative error object
    console.error('All retries failed for content generation.');
    if (lastError.message && lastError.message.includes('429')) {
        return { error: { message: 'Failed to generate content due to API quota limits. Please try using a smaller document or try again later.', statusCode: 429 } };
    }
    if (lastError.message && lastError.message.includes('503')) {
        return { error: { message: 'The content generation service is temporarily overloaded. Please try again in a few moments.', statusCode: 503 } };
    }
    // For any other error that broke the loop
    return { error: { message: lastError.message, statusCode: 500 } };
}

const axios = require('axios');

async function textToSpeech(payload) {
    const { text } = payload;
    if (!text) throw new Error('No text provided for speech synthesis.');
    if (!process.env.VOICERSS_API_KEY) throw new Error('VoiceRSS API key is not configured.');

    try {
        const response = await axios.get('http://api.voicerss.org/', {
            params: {
                key: process.env.VOICERSS_API_KEY,
                src: text,
                hl: 'ru-ru', // Russian language
                c: 'MP3',   // MP3 format
                f: '16khz_16bit_stereo', // Good quality
                b64: true   // Base64 output
            }
        });

        if (response.data.startsWith('ERROR')) {
            throw new Error(`VoiceRSS API Error: ${response.data}`);
        }

        // The response is already a Base64 Data URI when b64=true
        return { audioUrl: response.data };

    } catch (error) {
        console.error('VoiceRSS API error:', error.message);
        throw new Error('Failed to generate audio file.');
    }
}

async function publishCourse(payload) {
    const { course_id, content_html, questions, admin_prompt, product_line } = payload;
    const courseContent = {
        summary: content_html,
        questions: questions,
        admin_prompt: admin_prompt || ''
    };
    const { error } = await supabase.from('courses').update({
        content_html: courseContent,
        status: 'published',
        product_line: product_line
    }).eq('course_id', course_id);
    if (error) throw error;
    return { message: `Course ${course_id} successfully published.` };
}

async function deleteCourse(payload) {
    const { course_id } = payload;

    // 1. Delete related user progress
    const { error: progressError } = await supabase.from('user_progress').delete().eq('course_id', course_id);
    if (progressError) {
        console.error('Error deleting user progress:', progressError);
        throw new Error('Failed to delete user progress for the course.');
    }

    // 2. Delete the course itself
    const { error: courseError } = await supabase.from('courses').delete().eq('course_id', course_id);
    if (courseError) {
        console.error('Error deleting course:', courseError);
        throw new Error('Failed to delete the course.');
    }

    return { message: `Course ${course_id} and all related progress have been successfully deleted.` };
}

exports.handler = async (event) => {
    try {
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const authHeader = event.headers.authorization;
        if (!authHeader) throw new Error('Authorization header is missing.');
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            throw new Error('Access denied.');
        }

        const payload = JSON.parse(event.body);
        let result;

        switch (payload.action) {
            case 'upload_and_process':
                result = await uploadAndProcessFile(payload);
                break;
            case 'generate_content':
                result = await generateContent(payload);
                if (result.error) {
                    // The error object from generateContent now contains a message and a statusCode
                    const statusCode = result.error.statusCode || 400;
                    return { statusCode: statusCode, body: JSON.stringify({ error: result.error.message || result.error }) };
                }
                break;
            case 'publish_course':
                result = await publishCourse(payload);
                break;
            case 'text_to_speech':
                result = await textToSpeech(payload);
                break;
            case 'get_courses_admin':
                const { data, error } = await supabase.from('courses').select('course_id, title');
                if (error) throw error;
                result = data;
                break;
            case 'get_course_details':
                const { course_id: details_course_id } = payload;
                const { data: details_data, error: details_error } = await supabase
                    .from('courses')
                    .select('*, course_materials(*)')
                    .eq('course_id', details_course_id)
                    .single();
                if (details_error) throw details_error;
                result = details_data;
                break;
            case 'delete_course':
                result = await deleteCourse(payload);
                break;
            // --- Course Group Management ---
            case 'get_course_groups':
                const { data: groups, error: groupsError } = await supabase.from('course_groups').select('*');
                if (groupsError) throw groupsError;
                result = groups;
                break;
            case 'create_course_group':
                const { group_name, is_for_new_employees } = payload;
                const { data: newGroup, error: newGroupError } = await supabase
                    .from('course_groups')
                    .insert({ group_name, is_for_new_employees })
                    .select()
                    .single();
                if (newGroupError) throw newGroupError;
                result = newGroup;
                break;
            case 'update_course_group':
                const { group_id: update_group_id, group_name: update_group_name, is_for_new_employees: update_is_new } = payload;
                const { data: updatedGroup, error: updatedGroupError } = await supabase
                    .from('course_groups')
                    .update({ group_name: update_group_name, is_for_new_employees: update_is_new })
                    .eq('id', update_group_id)
                    .select()
                    .single();
                if (updatedGroupError) throw updatedGroupError;
                result = updatedGroup;
                break;
            case 'delete_course_group':
                const { group_id: delete_group_id } = payload;
                // Deletion will cascade thanks to DB constraints
                const { error: deleteGroupError } = await supabase.from('course_groups').delete().eq('id', delete_group_id);
                if (deleteGroupError) throw deleteGroupError;
                result = { message: `Group ${delete_group_id} deleted.` };
                break;
            case 'get_group_details':
                const { group_id: details_group_id } = payload;
                const { data: groupDetails, error: groupDetailsError } = await supabase
                    .from('course_groups')
                    .select('*, course_group_items(course_id)')
                    .eq('id', details_group_id)
                    .single();
                if (groupDetailsError) throw groupDetailsError;
                result = groupDetails;
                break;
            case 'update_courses_in_group':
                const { group_id: update_courses_group_id, course_ids } = payload;
                // 1. Delete existing entries for the group
                await supabase.from('course_group_items').delete().eq('group_id', update_courses_group_id);
                // 2. Insert new entries
                const itemsToInsert = course_ids.map(cid => ({ group_id: update_courses_group_id, course_id: cid }));
                const { error: updateItemsError } = await supabase.from('course_group_items').insert(itemsToInsert);
                if (updateItemsError) throw updateItemsError;
                result = { message: 'Courses in group updated.' };
                break;
            case 'assign_group_to_department':
                const { group_id: assign_group_id, department } = payload;
                const { error: assignError } = await supabase.from('group_assignments').insert({ group_id: assign_group_id, department });
                if (assignError) throw assignError;
                result = { message: `Group assigned to ${department}.` };
                break;
            // --- Course Materials Management ---
            case 'upload_course_material':
                const { course_id: material_course_id, file_name: material_file_name, file_data: material_file_data } = payload;
                const materialBuffer = Buffer.from(material_file_data, 'base64');
                const storagePath = `${material_course_id}/${material_file_name}`;

                // Upload to Supabase Storage
                const { error: storageError } = await supabase.storage
                    .from('course-materials')
                    .upload(storagePath, materialBuffer, { upsert: true });
                if (storageError) throw storageError;

                // Save metadata to our table
                const { error: dbErrorMaterial } = await supabase.from('course_materials').upsert({
                    course_id: material_course_id,
                    file_name: material_file_name,
                    storage_path: storagePath
                }, { onConflict: 'storage_path' });
                if (dbErrorMaterial) throw dbErrorMaterial;

                result = { message: 'Материал успешно загружен.' };
                break;
            case 'delete_course_material':
                const { material_id, storage_path } = payload;
                // Delete from storage
                await supabase.storage.from('course-materials').remove([storage_path]);
                // Delete from our table
                await supabase.from('course_materials').delete().eq('id', material_id);
                result = { message: 'Материал удален.' };
                break;
            default:
                throw new Error('Unknown action.');
        }

        // Defensive check to prevent empty responses
        if (result === undefined) {
            throw new Error(`Server Error: Result is undefined for action '${payload.action}'. This indicates a logic error in the handler.`);
        }

        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        console.error('Error in admin-handler:', error); // Log the full error object
        // Provide more detailed error messages to the client for easier debugging
        const errorMessage = {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
        };
        return { statusCode: 500, body: JSON.stringify({ error: errorMessage }) };
    }
};

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const axios = require('axios');

// This client is initialized with the SERVICE_ROLE_KEY and should only be used for operations
// that require bypassing RLS. For user-specific operations, a new client is created in the handler.
const supabaseServiceRole = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// All helper functions that interact with Supabase now accept an authenticated client
async function uploadAndProcessFile(supabase, payload) {
    const { course_id, title, file_name, file_data } = payload;
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

    const { error: dbError } = await supabase
        .from('courses')
        .upsert({
            course_id: course_id,
            title: title,
            source_text: textContent,
            status: 'processed'
        }, { onConflict: 'course_id' });

    if (dbError) {
        console.error('Supabase upsert error:', dbError);
        throw new Error('Failed to save course content to the database.');
    }

    return { extractedText: textContent };
}


async function generateContent(supabase, payload) {
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

            // Ensure the response has the expected structure to prevent 'undefined' on the frontend.
            return {
                summary: parsedJson.summary || [],
                questions: parsedJson.questions || []
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
    return { error: { message: lastError.message || 'Unknown error during content generation.', statusCode: 500 } };
}

async function textToSpeech(supabase, payload) {
    const { text } = payload;
    if (!text) throw new Error('No text provided for speech synthesis.');
    if (!process.env.VOICERSS_API_KEY) throw new Error('VoiceRSS API key is not configured.');

    try {
        const response = await axios.get('http://api.voicerss.org/', {
            params: { key: process.env.VOICERSS_API_KEY, src: text, hl: 'ru-ru', c: 'MP3', f: '16khz_16bit_stereo', b64: true },
            responseType: 'text'
        });
        if (response.data.startsWith('ERROR')) throw new Error(response.data);
        return { audioUrl: response.data };
    } catch (error) {
        console.error('VoiceRSS API error:', error.message);
        throw new Error('Failed to generate audio file.');
    }
}

async function publishCourse(supabase, payload) {
    const { course_id, content_html, questions, admin_prompt } = payload;
    const courseContent = { summary: content_html, questions: questions, admin_prompt: admin_prompt || '' };
    const updateData = {
        content_html: courseContent,
        status: 'published'
    };

    const { error } = await supabase.from('courses').update(updateData).eq('course_id', course_id);
    if (error) throw error;
    return { message: `Course ${course_id} successfully published.` };
}

async function deleteCourse(supabase, payload) {
    const { course_id } = payload;
    // RLS policy allows admin to delete from user_progress.
    const { error: progressError } = await supabase.from('user_progress').delete().eq('course_id', course_id);
    if (progressError) throw new Error('Failed to delete user progress for the course.');

    const { error: courseError } = await supabase.from('courses').delete().eq('course_id', course_id);
    if (courseError) throw new Error('Failed to delete the course.');

    return { message: `Course ${course_id} and all related progress have been successfully deleted.` };
}

exports.handler = async (event) => {
    try {
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is missing.' }) };
        }
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);

        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        // Create a new Supabase client for this authenticated user.
        // This ensures all subsequent requests respect the user's RLS policies.
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        const payload = JSON.parse(event.body);
        let result;

        // Pass the authenticated supabase client to the helper functions
        const actionMap = {
            'upload_and_process': (p) => uploadAndProcessFile(supabase, p),
            'generate_content': (p) => generateContent(supabase, p),
            'publish_course': (p) => publishCourse(supabase, p),
            'text_to_speech': (p) => textToSpeech(supabase, p),
            'delete_course': (p) => deleteCourse(supabase, p),
        };

        if (actionMap[payload.action]) {
            result = await actionMap[payload.action](payload);
        } else {
            // Handle actions defined directly in the switch
            switch (payload.action) {
                case 'get_courses_admin':
                    const { data, error } = await supabase.from('courses').select('*');
                    if (error) throw error;
                    result = data;
                    break;
                case 'get_course_details':
                    const { data: details, error: details_error } = await supabase
                        .from('courses').select('*, course_materials(*)').eq('course_id', payload.course_id).single();
                    if (details_error) throw details_error;
                    result = details;
                    break;
                // --- Course Group Management ---
                case 'get_course_groups':
                    const { data: groups, error: ge } = await supabase.from('course_groups').select('*');
                    if (ge) throw ge;
                    result = groups;
                    break;
                case 'create_course_group':
                    const { data: ng, error: nge } = await supabase.from('course_groups').insert({
                        group_name: payload.group_name,
                        is_for_new_employees: payload.is_for_new_employees,
                        start_date: payload.start_date || null,
                        recurrence_period: payload.recurrence_period || null
                    }).select().single();
                    if (nge) throw nge;
                    result = ng;
                    break;
                case 'update_course_group':
                    const { data: ug, error: uge } = await supabase.from('course_groups').update({
                        group_name: payload.group_name,
                        is_for_new_employees: payload.is_for_new_employees,
                        start_date: payload.start_date || null,
                        recurrence_period: payload.recurrence_period || null
                    }).eq('id', payload.group_id).select().single();
                    if (uge) throw uge;
                    result = ug;
                    break;
                case 'delete_course_group':
                    const { error: dge } = await supabase.from('course_groups').delete().eq('id', payload.group_id);
                    if (dge) throw dge;
                    result = { message: `Group ${payload.group_id} deleted.` };
                    break;
                case 'get_group_details':
                    const { data: gd, error: gde } = await supabase.from('course_groups').select('*, course_group_items(course_id)').eq('id', payload.group_id).single();
                    if (gde) throw gde;
                    result = gd;
                    break;
                case 'update_courses_in_group':
                    await supabase.from('course_group_items').delete().eq('group_id', payload.group_id);
                    const items = payload.course_ids.map(cid => ({ group_id: payload.group_id, course_id: cid }));
                    const { error: ucie } = await supabase.from('course_group_items').insert(items);
                    if (ucie) throw ucie;
                    result = { message: 'Courses in group updated.' };
                    break;
                case 'assign_group_to_department':
                    const { error: age } = await supabase.from('group_assignments').insert({ group_id: payload.group_id, department: payload.department });
                    if (age) throw age;
                    result = { message: `Group assigned to ${payload.department}.` };
                    break;
                // --- Course Materials Management ---
                case 'upload_course_material':
                    const materialBuffer = Buffer.from(payload.file_data, 'base64');
                    const storagePath = `${payload.course_id}/${payload.file_name}`;
                    const { error: se } = await supabaseServiceRole.storage.from('course-materials').upload(storagePath, materialBuffer, { upsert: true });
                    if (se) throw se;
                    const { error: dbe } = await supabase.from('course_materials').upsert({ course_id: payload.course_id, file_name: payload.file_name, storage_path: storagePath }, { onConflict: 'storage_path' });
                    if (dbe) throw dbe;
                    result = { message: 'Материал успешно загружен.' };
                    break;
                case 'delete_course_material':
                    await supabaseServiceRole.storage.from('course-materials').remove([payload.storage_path]);
                    await supabase.from('course_materials').delete().eq('id', payload.material_id);
                    result = { message: 'Материал удален.' };
                    break;
                // --- Leaderboard Settings ---
                case 'get_leaderboard_settings':
                    const { data: s, error: se2 } = await supabase.from('leaderboard_settings').select('setting_value').eq('setting_key', 'metrics').single();
                    if (se2 && se2.code !== 'PGRST116') throw se2;
                    // Ensure we always return an object, even if setting_value is null.
                    result = s?.setting_value || {};
                    break;
                case 'save_leaderboard_settings':
                    const { error: se3 } = await supabase.from('leaderboard_settings').upsert({ setting_key: 'metrics', setting_value: payload.metrics });
                    if (se3) throw se3;
                    result = { message: 'Настройки лидерборда сохранены.' };
                    break;
                // --- Simulator Results ---
                case 'get_simulation_results':
                    const { data: sims, error: simsError } = await supabase.from('dialogue_simulations').select('*').order('created_at', { ascending: false });
                    if (simsError) throw simsError;
                    if (!sims || sims.length === 0) {
                        result = [];
                        break;
                    }

                    const simUserIds = [...new Set(sims.map(s => s.user_id))];

                    // Use service role client to fetch user emails
                    const { data: usersData, error: usersError } = await supabaseServiceRole
                        .from('users')
                        .select('id, email')
                        .in('id', simUserIds);
                    if (usersError) throw usersError;

                    // Use regular client to fetch profiles (respects RLS, but might be needed if service role can't access it)
                    const { data: simProfiles, error: simProfilesError } = await supabase
                        .from('user_profiles')
                        .select('id, full_name')
                        .in('id', simUserIds);
                    if (simProfilesError) throw simProfilesError;

                    const simUserMap = new Map(usersData.map(u => [u.id, u.email]));
                    const simProfileMap = new Map(simProfiles.map(p => [p.id, p.full_name]));

                    result = sims.map(sim => ({
                        ...sim,
                        user_email: simUserMap.get(sim.user_id) || 'Unknown',
                        full_name: simProfileMap.get(sim.user_id) || 'Unknown'
                    }));
                    break;
                // --- Student Management ---
                case 'get_all_users':
                    // This requires service role to bypass RLS and get all users.
                    const { data: users, error: getAllUsersError } = await supabaseServiceRole
                        .from('users')
                        .select('id, email, raw_user_meta_data, user_profiles(full_name, department)')
                        .eq('role', 'authenticated'); // or whatever role your users have
                    if (getAllUsersError) throw getAllUsersError;
                    result = users.map(u => ({
                        id: u.id,
                        email: u.email,
                        full_name: u.user_profiles?.full_name || u.raw_user_meta_data?.full_name || 'N/A',
                        department: u.user_profiles?.department || 'N/A'
                    }));
                    break;
                case 'assign_course_to_user':
                    const { user_email, course_id } = payload;
                    if (!user_email || !course_id) throw new Error('user_email and course_id are required.');
                    // Use service role to assign course, bypassing RLS.
                    const { error: assignError } = await supabaseServiceRole
                        .from('user_progress')
                        .upsert({ user_email, course_id }, { onConflict: 'user_email, course_id', ignoreDuplicates: true });
                    if (assignError) throw assignError;
                    result = { message: `Course ${course_id} assigned to ${user_email}.` };
                    break;
                default:
                    throw new Error(`Unknown action: ${payload.action}`);
            }
        }

        if (result === undefined) {
            throw new Error(`Result is undefined for action '${payload.action}'. Logic error in handler.`);
        }

        return { statusCode: 200, body: JSON.stringify(result) };
    } catch (error) {
        console.error('Error in admin-handler:', error);
        const errorMessage = { message: error.message, details: error.details, hint: error.hint, code: error.code };
        return { statusCode: 500, body: JSON.stringify({ error: errorMessage }) };
    }
};

// --- Начало ИСПРАВЛЕННОГО файла /server/index.js ---

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const crypto = require('crypto');
const cron = require('node-cron');

// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Рекомендуется использовать актуальную модель

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

// --- API Роутер ---
const apiRouter = express.Router();

// --- Helper для создания Supabase клиента для пользователя ---
const createSupabaseClient = (token) => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
        throw new Error('Supabase URL or Anon Key is not configured.');
    }
    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
};

// --- Helper для создания Service Role клиента (для админских операций) ---
const createSupabaseAdminClient = () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        throw new Error('Supabase Service Key is not configured for admin operations.');
    }
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
};


// Главный эндпоинт админки
apiRouter.post('/admin', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Проверка, является ли пользователь админом
    const { data: adminCheck, error: adminCheckError } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
    if (adminCheckError || !adminCheck?.is_admin) {
        return res.status(403).json({ error: 'Forbidden: User is not an admin.' });
    }

    const { action, ...payload } = req.body;

    try {
        let data;
        // Используем админский клиент для операций, требующих полных прав
        const supabaseAdmin = createSupabaseAdminClient();

        switch (action) {
            case 'get_courses_admin': {
                const { data: courses, error } = await supabaseAdmin.from('courses').select('*');
                if (error) throw error;
                data = courses;
                break;
            }

            case 'get_all_users': {
                const { data: users, error } = await supabaseAdmin.rpc('get_all_users_for_admin');
                if (error) throw error;
                data = users;
                break;
            }

            case 'get_course_details': {
                const { course_id } = payload;
                if (!course_id || isNaN(parseInt(course_id))) return res.status(400).json({ error: 'A valid numeric course_id is required.' });
                const { data: courseDetails, error } = await supabaseAdmin.from('courses').select('*, course_materials(*)').eq('id', course_id).single();
                if (error) throw error;
                data = courseDetails;
                break;
            }

             case 'publish_course': { // Логика требует уточнений, но исправлено под схему
                const { course_id, content_html, questions, admin_prompt } = payload;
                if (!course_id) return res.status(400).json({ error: 'course_id is required.' });
                const courseContent = { summary: content_html, questions: questions, admin_prompt: admin_prompt || '' };
                const { error } = await supabaseAdmin.from('courses').update({ generated_content: courseContent }).eq('id', course_id);
                if (error) throw error;
                data = { message: `Course ${course_id} successfully published.` };
                break;
            }


            case 'delete_course': {
                const { course_id } = payload;
                if (!course_id) return res.status(400).json({ error: 'course_id is required.' });
                await supabaseAdmin.from('course_materials').delete().eq('course_id', course_id);
                await supabaseAdmin.from('user_progress').delete().eq('course_id', course_id);
                await supabaseAdmin.from('courses').delete().eq('id', course_id);
                data = { message: `Course ${course_id} deleted.` };
                break;
            }

            case 'upload_and_process': {
                const jobId = crypto.randomUUID();
                await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'file_upload', status: 'pending', payload });
                handleUploadAndProcess(jobId, payload, token).catch(console.error); // Fire and forget
                return res.status(202).json({ jobId });
            }

            case 'generate_content': {
                const jobId = crypto.randomUUID();
                await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'content_generation', status: 'pending', payload });
                handleGenerateContent(jobId, payload, token).catch(console.error); // Fire and forget
                return res.status(202).json({ jobId });
            }

            case 'get_course_groups': {
                const { data: groups, error } = await supabaseAdmin.from('course_groups').select('*');
                if (error) throw error;
                data = groups;
                break;
            }

            case 'get_simulation_results': {
                const { data: results, error } = await supabaseAdmin.rpc('get_simulation_results_for_admin');
                if (error) throw error;
                data = results;
                break;
            }

            case 'get_leaderboard_settings': { // Исправлено под реальную схему
                const { data: settings, error } = await supabaseAdmin.from('leaderboard_settings').select('*');
                if (error) throw error;
                data = settings;
                break;
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
        res.status(200).json(data);
    } catch (error) {
        console.error(`Error processing action "${action}":`, error);
        res.status(500).json({ error: 'An internal server error occurred.', errorMessage: error.message });
    }
});


// POST /api/get-job-status
apiRouter.post('/get-job-status', async (req, res) => {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data: job, error } = await supabaseAdmin
            .from('background_jobs')
            .select('id, status, payload, last_error, updated_at')
            .eq('id', jobId)
            .single();

        if (error) return res.status(404).json({ error: 'Job not found.' });
        res.status(200).json(job);
    } catch (error) {
        console.error(`Error getting job status for ${jobId}:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// POST /api/get-leaderboard
apiRouter.post('/get-leaderboard', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        const supabase = createSupabaseClient(token);
        const { course_id } = req.body; // Ожидаем course_id для лидерборда по курсу
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });

        const { data: leaderboardData, error: rpcError } = await supabase.rpc('get_leaderboard', {
            p_course_id: course_id
        });

        if (rpcError) throw rpcError;

        res.status(200).json(leaderboardData);
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/getCourses
apiRouter.post('/getCourses', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        const supabase = createSupabaseClient(token);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // Запрос курсов, доступных пользователю через группы
        const { data: courses, error: coursesError } = await supabase.from('courses').select('id, title');
        if (coursesError) throw coursesError;

        const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('course_id, score, attempts, completed_at')
            .eq('user_id', user.id);
        if (progressError) throw progressError;

        const userProgress = {};
        progressData.forEach(p => {
            userProgress[p.course_id] = { completed: !!p.completed_at, score: p.score, attempts: p.attempts };
        });

        const formattedCourses = courses.map(course => ({
            id: course.id,
            title: course.title,
            isAssigned: userProgress.hasOwnProperty(course.id), // Проверяем, есть ли прогресс
        }));

        res.status(200).json({ courses: formattedCourses, userProgress });
    } catch (error) {
        console.error('Error getting courses:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// POST /api/assign-course
apiRouter.post('/assign-course', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        const supabase = createSupabaseClient(token);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id } = req.body;
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });

        const { error: insertError } = await supabase
            .from('user_progress')
            .insert({ user_id: user.id, course_id: course_id });

        if (insertError) {
             if (insertError.code === '23505') { // Код ошибки для unique violation
                return res.status(200).json({ message: 'Course already assigned.' });
            }
            throw insertError;
        }

        res.status(200).json({ message: `Successfully assigned to course ${course_id}` });
    } catch (error) {
        console.error('Error assigning course:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});


// POST /api/saveTestResult
apiRouter.post('/saveTestResult', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        const supabase = createSupabaseClient(token);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id, score } = req.body;
        if (course_id === undefined || score === undefined) {
            return res.status(400).json({ error: 'Missing required fields: course_id, score.' });
        }

        const supabaseAdmin = createSupabaseAdminClient();
        const { data: existingRecord, error: selectError } = await supabaseAdmin
            .from('user_progress').select('attempts').eq('user_id', user.id).eq('course_id', course_id).maybeSingle();
        if (selectError) throw selectError;

        const dataToUpsert = {
            user_id: user.id,
            course_id: course_id,
            score: score,
            completed_at: new Date().toISOString(),
            attempts: (existingRecord?.attempts || 0) + 1
        };

        const { error: upsertError } = await supabaseAdmin.from('user_progress').upsert(dataToUpsert);
        if (upsertError) throw upsertError;

        res.status(200).json({ message: 'Результат успешно сохранен' });
    } catch (error) {
        console.error('Error saving test result:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// ... Остальные эндпоинты (уведомления, симулятор диалогов и т.д. остаются без изменений, если не было ошибок)
// ... Я их опущу для краткости, но они должны быть в вашем файле.

// --- Background Job Handlers ---
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

        let numeric_course_id;

        // Если course_id не число, значит это новый курс. Создаем его.
        if (isNaN(parseInt(course_id))) {
            console.log(`[Job ${jobId}] New course detected with temporary ID: "${course_id}". Creating new course entry...`);
            const { data: newCourse, error: createError } = await supabaseAdmin
                .from('courses')
                .insert({ title: title || 'Новый курс' })
                .select('id')
                .single();

            if (createError) throw createError;
            numeric_course_id = newCourse.id;
            console.log(`[Job ${jobId}] New course created successfully with ID: ${numeric_course_id}`);
        } else {
            numeric_course_id = parseInt(course_id);
        }

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

        console.log(`[Job ${jobId}] Text extracted. Saving to database for course ID: ${numeric_course_id}...`);

        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ source_text: textContent })
            .eq('id', numeric_course_id);

        if (dbError) throw new Error(`Failed to save course content: ${dbError.message}`);

        console.log(`[Job ${jobId}] Processing completed successfully for course ID: ${numeric_course_id}.`);
        await updateJobStatus('completed', { message: `File processed for course ${numeric_course_id}` });

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
        if (!course_id || isNaN(parseInt(course_id))) {
            throw new Error('Valid numeric course_id is required for content generation.');
        }
        console.log(`[Job ${jobId}] Starting content generation for course ${course_id}`);

        const { data: courseData, error: fetchError } = await supabaseAdmin.from('courses').select('source_text').eq('id', course_id).single();
        if (fetchError || !courseData?.source_text) {
            throw new Error('Course source text not found or not yet processed.');
        }

        const outputFormat = {
            summary: [{ title: "string", html_content: "string" }],
            questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
        };
        const finalPrompt = `Задание: ${custom_prompt || 'Создай исчерпывающий учебный курс на основе текста.'}\n\nИСХОДНЫЙ ТЕКСТ:\n${courseData.source_text}\n\nОбязательно верни результат в формате JSON: ${JSON.stringify(outputFormat)}`;

        console.log(`[Job ${jobId}] Generating content with Gemini...`);
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const jsonString = response.text().replace(/```json\n|```/g, '').trim();

        let parsedJson = JSON.parse(jsonString);

        console.log(`[Job ${jobId}] Content generated. Saving to database...`);
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ generated_content: parsedJson })
            .eq('id', course_id);

        if (dbError) throw new Error(`Failed to save generated content: ${dbError.message}`);

        console.log(`[Job ${jobId}] Content generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Content generated and saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during content generation:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}


// Mount the API router
app.use('/api', apiRouter);

// --- Frontend Routes ---
app.get('/admin*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});

// --- Конец ИСПРАВЛЕННОГО файла /server/index.js ---

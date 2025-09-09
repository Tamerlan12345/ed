// --- Начало файла /server/index.js ---

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

// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Отдаем статику из корневой папки (где лежат index.html, admin.html)
app.use(express.static(path.join(__dirname, '..')));

// --- API Роутер ---
const apiRouter = express.Router();

// Главный эндпоинт, который заменяет /netlify/functions/admin
apiRouter.post('/admin', async (req, res) => {
    // 1. Authentication and Supabase Client Initialization
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }
    const token = authHeader.split(' ')[1];

    // Create a Supabase client with the user's token
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Action Dispatching
    const { action, ...payload } = req.body;

    try {
        let data;
        switch (action) {
            case 'get_courses_admin': {
                const { data: courses, error } = await supabase.from('courses').select('*');
                if (error) throw error;
                data = courses;
                break;
            }

            case 'get_all_users': {
                const { data: users, error } = await supabase.rpc('get_all_users_with_profiles');
                if (error) throw error;
                data = users;
                break;
            }

            case 'get_course_details': {
                const { course_id } = payload;
                const { data: courseDetails, error } = await supabase.from('courses').select('*, course_materials(*)').eq('course_id', course_id).single();
                if (error) throw error;
                data = courseDetails;
                break;
            }

            case 'publish_course': {
                const { course_id, content_html, questions, admin_prompt } = payload;
                const courseContent = { summary: content_html, questions: questions, admin_prompt: admin_prompt || '' };
                const { error } = await supabase.from('courses').update({ content_html: courseContent, status: 'published' }).eq('course_id', course_id);
                if (error) throw error;
                data = { message: `Course ${course_id} successfully published.` };
                break;
            }

            case 'delete_course': {
                const { course_id } = payload;
                if (!course_id) return res.status(400).json({ error: 'course_id is required.' });
                await supabase.from('user_progress').delete().eq('course_id', course_id);
                await supabase.from('courses').delete().eq('course_id', course_id);
                data = { message: `Course ${course_id} and all related progress have been successfully deleted.` };
                break;
            }

            case 'text_to_speech': {
                const { text } = payload;
                if (!text) return res.status(400).json({ error: 'No text provided.' });
                if (!process.env.VOICERSS_API_KEY) throw new Error('VoiceRSS API key is not configured.');
                const response = await axios.get('http://api.voicerss.org/', {
                    params: { key: process.env.VOICERSS_API_KEY, src: text, hl: 'ru-ru', c: 'MP3', f: '16khz_16bit_stereo', b64: true },
                    responseType: 'text'
                });
                if (response.data.startsWith('ERROR')) throw new Error(response.data);
                data = { audioUrl: response.data };
                break;
            }

            case 'upload_and_process': {
                const jobId = crypto.randomUUID();
                const { course_id } = payload;

                await supabase.from('background_jobs').insert({
                    job_id: jobId,
                    job_type: 'file_upload',
                    status: 'pending',
                    created_by: user.id,
                    related_entity_id: course_id
                });

                // Fire and forget
                handleUploadAndProcess(jobId, payload, token);

                return res.status(202).json({ jobId });
            }

            case 'generate_content': {
                const jobId = crypto.randomUUID();
                const { course_id } = payload;

                await supabase.from('background_jobs').insert({
                    job_id: jobId,
                    job_type: 'content_generation',
                    status: 'pending',
                    created_by: user.id,
                    related_entity_id: course_id
                });

                // Fire and forget
                handleGenerateContent(jobId, payload, token);

                return res.status(202).json({ jobId });
            }

            // TODO: Migrate course group, materials, and background job handlers

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
        res.status(200).json(data);
    } catch (error) {
        console.error(`Error processing action "${action}":`, error);
        res.status(500).json({
            error: 'An internal server error occurred.',
            errorMessage: error.message,
        });
    }
});

// --- Standalone Function Routes ---

// POST /api/get-job-status
apiRouter.post('/get-job-status', async (req, res) => {
    const { jobId } = req.body;
    if (!jobId) {
        return res.status(400).json({ error: 'Missing required parameter: jobId' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: job, error } = await supabase
            .from('background_jobs')
            .select('job_id, status, result, error_message, updated_at')
            .eq('job_id', jobId)
            .single();

        if (error) {
            console.warn(`Could not retrieve job ${jobId}. Error: ${error.message}`);
            return res.status(404).json({ error: 'Job not found or access denied.' });
        }
        res.status(200).json(job);
    } catch (error) {
        console.error(`Error getting job status for ${jobId}:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/getDetailedReport
apiRouter.post('/getDetailedReport', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { user_email, department, course_id, format } = req.body;
        const { data, error } = await supabase.rpc('get_detailed_report_data', {
            user_email_filter: user_email,
            department_filter: department,
            course_id_filter: course_id
        });

        if (error) throw error;

        if (format === 'csv') {
            const csv = convertToCSV(data); // Assuming convertToCSV is defined in this file
            res.header('Content-Type', 'text/csv');
            res.attachment(`report-${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csv);
        } else {
            res.status(200).json(data);
        }
    } catch (error) {
        console.error(`Error getting detailed report:`, error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = ['Full Name', 'Email', 'Department', 'Course Title', 'Progress (%)', 'Time Spent (min)', 'Completed At'];
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const timeSpentMinutes = row.time_spent_seconds ? Math.round(row.time_spent_seconds / 60) : 0;
        const values = [
            `"${row.user_profiles?.full_name || 'N/A'}"`, `"${row.user_email}"`, `"${row.user_profiles?.department || 'N/A'}"`,
            `"${row.courses.title}"`, row.percentage, timeSpentMinutes, `"${row.completed_at ? new Date(row.completed_at).toLocaleString() : 'In Progress'}"`
        ];
        csvRows.push(values.join(','));
    }
    return csvRows.join('\\n');
}


// POST /api/getNotifications
apiRouter.post('/getNotifications', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { data, error } = await supabase
            .from('notifications')
            .select('id, message, is_read, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/markNotificationsAsRead
apiRouter.post('/markNotificationsAsRead', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { notification_ids } = req.body;
        if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
            return res.status(400).json({ error: 'Bad Request: notification_ids must be a non-empty array.' });
        }

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', notification_ids)
            .eq('user_id', user.id);

        if (error) throw error;
        res.status(200).json({ message: 'Notifications marked as read.' });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// NOTE FOR DBA: The `get_weekly_leaderboard` RPC function requires read access to the `users` table.
// If you see 'permission denied for table users' errors, run the following SQL command:
// GRANT SELECT ON TABLE users TO authenticated;
// POST /api/get-leaderboard
apiRouter.post('/get-leaderboard', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { data: settings, error: settingsError } = await supabase
            .from('leaderboard_settings')
            .select('setting_value')
            .eq('setting_key', 'metrics')
            .single();

        if (settingsError) console.error('Could not fetch leaderboard settings:', settingsError);

        const metrics = settings?.setting_value?.metrics || { courses_completed: true };
        let orderBy = 'courses_completed';
        const validMetrics = ['courses_completed', 'time_spent', 'avg_score'];
        for (const metric of validMetrics) {
            if (metrics[metric]) {
                orderBy = metric;
                break;
            }
        }

        const { data: leaderboardData, error: rpcError } = await supabase.rpc('get_weekly_leaderboard', {
            p_order_by: orderBy
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
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { data: courses, error: coursesError } = await supabase
            .from('courses')
            .select('course_id, title, status');
        if (coursesError) throw coursesError;

        const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('course_id, percentage, attempts')
            .eq('user_id', user.id);
        if (progressError) throw progressError;

        const userProgress = {};
        progressData.forEach(p => {
            userProgress[p.course_id] = { completed: p.percentage === 100, percentage: p.percentage, attempts: p.attempts };
        });

        const formattedCourses = courses.map(course => ({
            id: course.course_id,
            title: course.title,
            isAssigned: userProgress.hasOwnProperty(course.course_id),
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
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id } = req.body;
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });

        const { error: insertError } = await supabase
            .from('user_progress')
            .upsert({
                user_id: user.id,
                user_email: user.email,
                course_id: course_id
            }, {
                onConflict: 'user_id, course_id',
                ignoreDuplicates: true
            });

        if (insertError) throw insertError;

        res.status(200).json({ message: `Successfully assigned to course ${course_id}` });
    } catch (error) {
        console.error('Error assigning course:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/update-time-spent
apiRouter.post('/update-time-spent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        // Authenticate user with anon key first
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id, seconds_spent } = req.body;
        if (!course_id || typeof seconds_spent !== 'number' || seconds_spent <= 0) {
            return res.status(400).json({ error: 'course_id and a positive number of seconds_spent are required' });
        }

        // Use the service key to perform the update via RPC, bypassing RLS
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { error: rpcError } = await supabase.rpc('increment_time_spent', {
            c_id: course_id,
            u_email: user.email,
            seconds: Math.round(seconds_spent)
        });

        if (rpcError) throw rpcError;

        res.status(200).json({ message: 'Time updated successfully.' });
    } catch (error) {
        console.error('Error updating time spent:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/getCourseContent
apiRouter.post('/getCourseContent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id } = req.body;
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });

        const { data, error } = await supabase
            .from('courses')
            .select('content_html')
            .eq('course_id', course_id)
            .eq('status', 'published')
            .single();

        if (error || !data) return res.status(404).json({ error: 'Опубликованный курс не найден.' });

        let courseContent = data.content_html;
        if (typeof courseContent === 'string') {
            try { courseContent = JSON.parse(courseContent); } catch (e) { return res.status(500).json({ error: 'Ошибка парсинга контента курса. Контент поврежден.' }); }
        }

        const summary = (courseContent && typeof courseContent === 'object' && courseContent.summary) ? courseContent.summary : courseContent;
        const questions = (courseContent && typeof courseContent === 'object' && courseContent.questions) ? courseContent.questions : [];

        if (!summary) return res.status(404).json({ error: 'Контент для данного курса не найден.' });

        const { data: materials, error: materialsError } = await supabase.from('course_materials').select('file_name, storage_path').eq('course_id', course_id);
        if (materialsError) throw materialsError;

        const materialsWithUrls = materials.map(m => {
            const { data: { publicUrl } } = supabase.storage.from('course-materials').getPublicUrl(m.storage_path);
            return { file_name: m.file_name, public_url: publicUrl };
        });

        res.status(200).json({ summary, questions, materials: materialsWithUrls });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function for text-to-speech
async function textToSpeech(text) {
    if (!text) throw new Error('No text provided for speech synthesis.');
    if (!process.env.SPEECHIFY_API_KEY) throw new Error('Speechify API key is not configured.');
    const speechifyApiKey = process.env.SPEECHIFY_API_KEY;
    const truncatedText = text.substring(0, 2000);
    try {
        const response = await axios.post('https://api.sws.speechify.com/v1/audio/speech', {
            input: truncatedText, voice_id: 'mikhail', language: 'ru-RU', model: 'simba-multilingual', audio_format: 'mp3'
        }, {
            headers: { 'Authorization': `Bearer ${speechifyApiKey}`, 'Content-Type': 'application/json' }
        });
        if (response.data && response.data.audio_data) {
            return { audioUrl: `data:audio/mp3;base64,${response.data.audio_data}` };
        } else {
            throw new Error('Speechify API did not return audio data.');
        }
    } catch (error) {
        console.error('Speechify API request error:', error.message);
        throw new Error('Failed to generate audio file from Speechify.');
    }
}

// POST /api/text-to-speech-user
apiRouter.post('/text-to-speech-user', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id } = req.body;
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data: courseData, error: courseError } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (courseError || !courseData || !courseData.source_text) {
            return res.status(404).json({ error: 'Source text for this course not found.' });
        }

        if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' }); // Corrected model name

        const summarizationPrompt = `Ты — AI-ассистент. Сделай краткий пересказ предоставленного текста. Пересказ должен быть строго в рамках документа и занимать примерно 5 минут при чтении (около 750 слов). ИСХОДНЫЙ ТЕКСТ: \n---\n${courseData.source_text}\n---`;
        const summaryResult = await model.generateContent(summarizationPrompt);
        const summaryText = summaryResult.response.text();
        const result = await textToSpeech(summaryText);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error in text-to-speech-user:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/askAssistant
apiRouter.post('/askAssistant', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id, question } = req.body;
        if (!course_id || !question) return res.status(400).json({ error: 'Требуется course_id и question' });

        const { data: courseData, error: courseError } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (courseError || !courseData || !courseData.source_text) {
            return res.status(404).json({ error: 'Исходный текст для этого курса не найден.' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = [
            'Задание: Ты — AI-ассистент. Ответь на вопрос, используя ТОЛЬКО предоставленный исходный текст.',
            'Если ответа в тексте нет, скажи: "К сожалению, в материалах нет ответа на этот вопрос."',
            `ВОПРОС: "${question}"`, 'ИСХОДНЫЙ ТЕКСТ:', '---', courseData.source_text, '---'
        ].join('\n');

        let answer = '';
        const maxRetries = 3;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await model.generateContent(prompt);
                answer = result.response.text();
                break;
            } catch (error) {
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000 + Math.random() * 1000));
                } else {
                    throw error;
                }
            }
        }

        await supabase.from('user_questions').insert({ course_id, user_id: user.id, question, answer });

        res.status(200).json({ answer });
    } catch (error) {
        console.error('Error in askAssistant:', error);
        res.status(500).json({ error: 'Не удалось получить ответ от AI-ассистента.' });
    }
});

// POST /api/saveTestResult
apiRouter.post('/saveTestResult', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { course_id, score, total_questions, percentage } = req.body;
        if (course_id === undefined || score === undefined || total_questions === undefined || percentage === undefined) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const { data: existingRecord, error: selectError } = await supabase
            .from('user_progress').select('id, attempts').eq('user_email', user.email).eq('course_id', course_id).maybeSingle();
        if (selectError) throw selectError;

        if (existingRecord) {
            const { error: updateError } = await supabase.from('user_progress').update({
                score, total_questions, percentage, completed_at: new Date().toISOString(), attempts: (existingRecord.attempts || 0) + 1
            }).eq('id', existingRecord.id);
            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await supabase.from('user_progress').insert({
                user_email: user.email, user_id: user.id, course_id, score, total_questions, percentage, completed_at: new Date().toISOString(), attempts: 1
            });
            if (insertError) throw insertError;
        }

        res.status(200).json({ message: 'Результат успешно сохранен' });
    } catch (error) {
        console.error('Error saving test result:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Dialogue Simulator ---
const PERSONALITIES = {
    'cold': `Ты не заинтересован в продукте, отвечаешь коротко, без энтузиазма. Твоя цель -- как можно скорее закончить разговор. Не груби, но будь отстраненным.`,
    'interested': `Ты слышал о продукте и задаешь много уточняющих вопросов о цене, условиях, преимуществах. Ты хочешь понять все детали.`,
    'aggressive': `У тебя был негативный опыт со страховыми компаниями. Ты настроен скептически, перебиваешь, выражаешь сомнения и требуешь гарантий.`
};
const EVALUATOR_PROMPT = `
Ты -- опытный бизнес-тренер. Проанализируй следующий диалог между менеджером по продажам и клиентом.
Твоя задача — оценить работу менеджера по 5 ключевым критериям по 10-балльной шкале.
ВЕРНИ РЕЗУЛЬТАТ СТРОГО В ФОРМАТЕ JSON. Не добавляй никаких других слов или комментариев вне JSON.
Критерии для оценки:
1.  **Установление контакта:** Насколько хорошо менеджер начал диалог, создал доверительную атмосферу.
2.  **Выявление потребностей:** Задавал ли менеджер открытые и уточняющие вопросы, чтобы понять ситуацию и потребности клиента.
3.  **Презентация продукта:** Насколько убедительно и релевантно потребностям клиента была представлена услуга страхования.
4.  **Работа с возражениями:** Как менеджер обрабатывал сомнения, скепсис или прямые отказы клиента.
5.  **Завершение диалога:** Была ли попытка завершить сделку, договориться о следующем шаге или позитивно закончить разговор.
Формат JSON для ответа:
{
  "evaluation_criteria": [
    { "criterion": "Установление контакта", "score": 1, "comment": "<краткий комментарий>" },
    { "criterion": "Выявление потребностей", "score": 1, "comment": "<краткий комментарий>" },
    { "criterion": "Презентация продукта", "score": 1, "comment": "<краткий комментарий>" },
    { "criterion": "Работа с возражениями", "score": 1, "comment": "<краткий комментарий>" },
    { "criterion": "Завершение диалога", "score": 1, "comment": "<краткий комментарий>" }
  ],
  "average_score": 1.0,
  "general_comment": "<общий вывод и главная рекомендация для менеджера>"
}
`;

apiRouter.post('/dialogueSimulator', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { history, persona, scenario, action = 'chat' } = req.body;
        if (!history || !Array.isArray(history)) return res.status(400).json({ error: 'Bad Request: history must be an array.' });
        if (action === 'chat' && (!PERSONALITIES[persona] || !scenario)) return res.status(400).json({ error: 'Bad Request: Invalid persona or missing scenario.' });

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        let prompt, answer;

        if (action === 'evaluate') {
            const dialogueText = history.map(h => `${h.role}: ${h.text}`).join('\n');
            prompt = `${EVALUATOR_PROMPT}\n\nДИАЛОГ ДЛЯ АНАЛИЗА:\n${dialogueText}`;
            const result = await model.generateContent(prompt);
            const responseText = (await result.response).text().replace(/```json/g, '').replace(/```/g, '').trim();
            try {
                answer = JSON.parse(responseText);
            } catch (e) {
                return res.status(500).json({ error: "Evaluation failed: AI returned an invalid format." });
            }
            await supabase.from('dialogue_simulations').insert({ user_id: user.id, persona, scenario, dialogue_history: history, evaluation: answer });
        } else { // chat
            const personalityInstruction = PERSONALITIES[persona];
            const dialogueContext = history.map(h => `* ${h.role}: ${h.text}`).join('\n');
            prompt = `Твоя роль: клиент страховой компании...\nТвой сценарий: "${scenario}"\nТвой характер: "${personalityInstruction}"\nИстория диалога:\n${dialogueContext}\n\nТвоя следующая реплика (отвечай как клиент, только текст, без указания роли):`;
            const result = await model.generateContent(prompt);
            answer = (await result.response).text();
        }
        res.status(200).json({ answer });
    } catch (error) {
        console.error('Error in dialogue simulator:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- Background Job Handlers ---
async function handleUploadAndProcess(jobId, payload, token) {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabase
            .from('background_jobs')
            .update({ status, result: data, error_message: errorMessage, updated_at: new Date().toISOString() })
            .eq('job_id', jobId);
        if (error) {
            console.error(`Failed to update job ${jobId} status to ${status}:`, error);
        }
    };

    try {
        const { course_id, title, file_name, file_data } = payload;
        console.log(`[Job ${jobId}] Starting processing for course ${course_id}`);

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
            console.error(`[Job ${jobId}] File parsing error:`, e);
            throw new Error(`Failed to process file: ${e.message}`);
        }

        console.log(`[Job ${jobId}] Text extracted successfully. Saving to database...`);
        const { error: dbError } = await supabase
            .from('courses')
            .upsert({
                course_id: course_id,
                title: title,
                source_text: textContent,
                status: 'processed'
            }, { onConflict: 'course_id' });

        if (dbError) {
            console.error(`[Job ${jobId}] Supabase upsert error:`, dbError);
            throw new Error('Failed to save course content to the database.');
        }

        console.log(`[Job ${jobId}] Processing completed successfully.`);
        await updateJobStatus('completed', { message: 'File processed and content saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during processing:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

async function handleGenerateContent(jobId, payload, token) {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const updateJobStatus = async (status, data = null, errorMessage = null) => {
        const { error } = await supabase
            .from('background_jobs')
            .update({ status, result: data, error_message: errorMessage, updated_at: new Date().toISOString() })
            .eq('job_id', jobId);
        if (error) {
            console.error(`[Job ${jobId}] Failed to update job status to ${status}:`, error);
        }
    };

    try {
        const { course_id, custom_prompt } = payload;
        console.log(`[Job ${jobId}] Starting content generation for course ${course_id}`);

        const { data: courseData, error: fetchError } = await supabase.from('courses').select('source_text').eq('course_id', course_id).single();
        if (fetchError || !courseData || !courseData.source_text) {
            const errorMessage = 'Course source text not found or not yet processed.';
            console.warn(`[Job ${jobId}] ${errorMessage}`);
            await updateJobStatus('failed', null, errorMessage);
            return;
        }

        const outputFormat = {
            summary: [{ title: "string", html_content: "string" }],
            questions: [{ question: "string", options: ["string"], correct_option_index: 0 }]
        };
        const finalPrompt = `Задание: ${custom_prompt || 'Создай исчерпывающий учебный курс...'}\n\nИСХОДНЫЙ ТЕКСТ:\n${courseData.source_text}\n\nОбязательно верни результат в формате JSON: ${JSON.stringify(outputFormat)}`;

        console.log(`[Job ${jobId}] Generating content with Gemini...`);
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const jsonString = response.text().replace(/\\`\\`\\`json/g, '').replace(/\\`\\`\\`/g, '').trim();

        let parsedJson;
        try {
            parsedJson = JSON.parse(jsonString);
        } catch (e) {
            console.error(`[Job ${jobId}] Failed to parse JSON string. Raw string was: "${jsonString}"`, e);
            throw new Error('AI model returned malformed JSON.');
        }

        if (!parsedJson.summary || !parsedJson.questions) {
            throw new Error('AI model returned an invalid or incomplete JSON structure.');
        }

        console.log(`[Job ${jobId}] Content generated. Saving to database...`);
        const { error: dbError } = await supabase
            .from('courses')
            .update({
                content_html: parsedJson,
                status: 'generated'
            })
            .eq('course_id', course_id);

        if (dbError) {
            throw new Error(`Failed to save generated content: ${dbError.message}`);
        }

        console.log(`[Job ${jobId}] Content generation completed successfully.`);
        await updateJobStatus('completed', { message: 'Content generated and saved.' });

    } catch (error) {
        console.error(`[Job ${jobId}] Unhandled error during content generation:`, error);
        await updateJobStatus('failed', null, error.message);
    }
}

// Mount the API router after all routes have been defined
app.use('/api', apiRouter);

// --- Frontend Routes ---
// Serve admin.html for any /admin path to support client-side routing
app.get('/admin*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Serve index.html for the root path
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// --- Cron Jobs ---
const cron = require('node-cron');

async function sendReminders() {
    console.log('Running daily reminder cron job...');
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: incompleteProgress, error: progressError } = await supabase
            .from('user_progress').select(`user_email, created_at, courses ( title ), user_profiles ( user_id:id )`)
            .lt('percentage', 100).lte('created_at', sevenDaysAgo.toISOString());
        if (progressError) throw progressError;

        if (!incompleteProgress || incompleteProgress.length === 0) {
            console.log('No overdue courses found. No reminders to send.');
            return;
        }

        const notificationsToInsert = incompleteProgress
            .filter(p => p.user_profiles && p.user_profiles.user_id)
            .map(p => ({ user_id: p.user_profiles.user_id, message: `Напоминание: Пожалуйста, завершите курс "${p.courses.title}".` }));

        if (notificationsToInsert.length > 0) {
            await supabase.from('notifications').insert(notificationsToInsert);
            console.log(`Successfully inserted ${notificationsToInsert.length} reminders.`);
        }
    } catch (error) {
        console.error('Failed to send reminders:', error);
    }
}

// Schedule to run once a day at midnight
cron.schedule('0 0 * * *', sendReminders);
console.log('Cron job for reminders scheduled.');


// --- Запуск сервера ---
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});

// --- Конец файла /server/index.js ---

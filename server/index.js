// --- Начало ИСПРАВЛЕННОГО файла /server/index.js ---
console.log('--- SERVER.JS EXECUTING ---');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient: createPexelsClient } = require('pexels');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const crypto = require('crypto');
const cron = require('node-cron');

// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const pexelsClient = process.env.PEXELS_API_KEY ? createPexelsClient(process.env.PEXELS_API_KEY) : null;
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Рекомендуется использовать актуальную модель

// --- Service URLs ---
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'https://special-pancake-69pp66w7x4qvf5gw7-5001.app.github.dev/generate-audio';

const simulationScenarios = [
    "Клиент хочет застраховать новый автомобиль (Hyundai Tucson) по КАСКО от всех рисков. Он впервые покупает КАСКО и хочет знать все детали: что покрывается, какие есть франшизы, от чего зависит цена.",
    "У клиента заканчивается срок действующего полиса ОГПО ВТС. Он ищет, где можно продлить его онлайн и подешевле. Слышал, что у разных компаний могут быть разные скидки.",
    "Клиент недавно купил квартиру в ипотеку и банк требует оформить страховку. Он не понимает, зачем это нужно и что именно нужно страховать (стены, отделку, ответственность перед соседями).",
    "Семья (2 взрослых, 1 ребенок) летит в отпуск в Турцию на 10 дней. Им нужна туристическая страховка. Интересуются, покрывает ли она случаи, связанные с COVID-19 или другими внезапными заболеваниями.",
    "Клиент (35 лет) думает о будущем и хочет начать копить на образование ребенка. Слышал о программах накопительного страхования, но не понимают, чем они лучше обычного банковского депозита.",
    "Клиент попал в небольшое ДТП (другой водитель поцарапал ему дверь на парковке). Он уже подал документы, но выплата задерживается. Он звонит, чтобы узнать статус и выразить недовольство.",
    "Клиент работает на стройке и хочет застраховать себя от травм. Ему важно знать, какие травмы покрываются и какая будет выплата в случае перелома руки.",
    "Представитель небольшой IT-компании (20 сотрудников) хочет оформить для своих работников добровольное медицинское страхование (ДМС). Ему нужен 'социальный пакет', чтобы удерживать ценных специалистов.",
    "Индивидуальный предприниматель занимается перевозкой товаров из Китая в Казахстан. Он хочет застрахоить партию электроники на время транспортировки.",
    "Клиент уже получил предложение по страхованию дома от другой компании ('Халык'). Он звонит, чтобы узнать, можете ли вы предложить условия лучше или дешевле."
];

const app = express();
const PORT = process.env.PORT || 3002;

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


// --- Middleware for Admin Auth ---
const adminAuthMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: adminCheck, error: adminCheckError } = await supabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();

    if (adminCheckError || !adminCheck?.is_admin) {
        return res.status(403).json({ error: 'Forbidden: User is not an admin.' });
    }

    req.user = user;
    req.token = token; // Pass token for background jobs
    next();
};

// --- Admin Action Handlers ---
const adminActionHandlers = {
    create_course: async ({ payload, supabaseAdmin }) => {
        const { title } = payload;
        if (!title) throw { status: 400, message: 'Title is required to create a course.' };
        const { data, error } = await supabaseAdmin.from('courses').insert({ title }).select().single();
        if (error) throw error;
        return data;
    },
    get_courses_admin: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('courses').select('*');
        if (error) throw error;
        return data;
    },
    get_all_users: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.rpc('get_all_users_with_details');
        if (error) throw error;
        return data;
    },
    get_departments: async ({ supabaseAdmin }) => {
        const { data: users, error } = await supabaseAdmin.from('users').select('department');
        if (error) throw error;
        return [...new Set(users.map(u => u.department).filter(d => d && d.trim() !== ''))].sort();
    },
    get_course_details: async ({ payload, supabaseAdmin }) => {
        const { course_id } = payload;
        if (!course_id) throw { status: 400, message: 'A valid course_id is required.' };
        const { data, error } = await supabaseAdmin.from('courses').select('*, course_materials(*)').eq('id', course_id).single();
        if (error) throw error;
        return data;
    },
    save_course_draft: async ({ payload, supabaseAdmin }) => {
        const { course_id, draft_data } = payload;
        if (!course_id || !draft_data) {
            throw { status: 400, message: 'course_id and draft_data are required.' };
        }
        const { data, error } = await supabaseAdmin.from('courses').update({ draft_content: draft_data, updated_at: new Date().toISOString() }).eq('id', course_id).select('updated_at').single();
        if (error) throw error;
        return data;
    },
    publish_course: async ({ payload, supabaseAdmin }) => {
        const { course_id, is_visible } = payload;
        if (!course_id) {
            throw { status: 400, message: 'course_id is required.' };
        }
        const { data: course, error: fetchError } = await supabaseAdmin.from('courses').select('draft_content').eq('id', course_id).single();
        if (fetchError || !course) throw { status: 404, message: 'Course not found.' };
        if (!course.draft_content) throw { status: 400, message: 'No draft content to publish.' };

        const { title, description, content } = course.draft_content;

        const { error: updateError } = await supabaseAdmin
            .from('courses')
            .update({
                title,
                description,
                content,
                status: 'published',
                draft_content: null,
                is_visible: !!is_visible,
                updated_at: new Date().toISOString()
            })
            .eq('id', course_id);
        if (updateError) throw updateError;
        return { message: `Course ${course_id} successfully published.` };
    },
    delete_course: async ({ payload, supabaseAdmin }) => {
        const { course_id } = payload;
        if (!course_id) throw { status: 400, message: 'course_id is required.' };
        await supabaseAdmin.from('course_materials').delete().eq('course_id', course_id);
        await supabaseAdmin.from('user_progress').delete().eq('course_id', course_id);
        await supabaseAdmin.from('courses').delete().eq('id', course_id);
        return { message: `Course ${course_id} deleted.` };
    },
    upload_and_process: async ({ payload, token, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'file_upload', status: 'pending', payload });
        handleUploadAndProcess(jobId, payload, token).catch(console.error); // Fire and forget
        res.status(202).json({ jobId });
        return null; // Signal that response has been sent
    },
    generate_content: async ({ payload, token, res }) => {
        const jobId = crypto.randomUUID();
        const supabaseAdmin = createSupabaseAdminClient();
        await supabaseAdmin.from('background_jobs').insert({ id: jobId, job_type: 'content_generation', status: 'pending', payload });
        handleGenerateContent(jobId, payload, token).catch(console.error); // Fire and forget
        res.status(202).json({ jobId });
        return null; // Signal that response has been sent
    },
    get_course_groups: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('course_groups').select('*');
        if (error) throw error;
        return data;
    },
    create_course_group: async ({ payload, supabaseAdmin }) => {
        const { group_name, is_for_new_employees, start_date, recurrence_period, enforce_order, deadline_days, is_visible } = payload;
        if (!group_name) throw { status: 400, message: 'Group name is required.' };
        const insertData = {
            group_name,
            is_for_new_employees: !!is_for_new_employees,
            start_date: start_date || null,
            recurrence_period: recurrence_period || null,
            enforce_order: !!enforce_order,
            deadline_days: deadline_days || null,
            is_visible: !!is_visible
        };
        const { data, error } = await supabaseAdmin.from('course_groups').insert(insertData).select().single();
        if (error) throw error;
        return data;
    },
    update_course_group: async ({ payload, supabaseAdmin }) => {
        const { group_id, group_name, is_for_new_employees, start_date, recurrence_period, enforce_order, deadline_days, is_visible } = payload;
        if (!group_id || !group_name) throw { status: 400, message: 'Group ID and name are required.' };
        const updateData = { group_name, is_for_new_employees, start_date, recurrence_period, enforce_order, deadline_days, is_visible };
        const { data, error } = await supabaseAdmin.from('course_groups').update(updateData).eq('id', group_id).select().single();
        if (error) throw error;
        return data;
    },
    delete_course_group: async ({ payload, supabaseAdmin }) => {
        const { group_id } = payload;
        if (!group_id) throw { status: 400, message: 'Group ID is required.' };
        await supabaseAdmin.from('course_group_items').delete().eq('group_id', group_id);
        await supabaseAdmin.from('course_groups').delete().eq('id', group_id);
        return { message: 'Group deleted successfully.' };
    },
    get_group_details: async ({ payload, supabaseAdmin }) => {
        const { group_id } = payload;
        if (!group_id) throw { status: 400, message: 'Group ID is required.' };
        const { data, error } = await supabaseAdmin.from('course_groups').select('*, course_group_items(course_id)').eq('id', group_id).single();
        if (error) throw error;
        return data;
    },
    update_courses_in_group: async ({ payload, supabaseAdmin }) => {
        const { group_id, course_ids } = payload;
        if (!group_id || !Array.isArray(course_ids)) throw { status: 400, message: 'Group ID and ordered course_ids array are required.' };

        await supabaseAdmin.from('course_group_items').delete().eq('group_id', group_id);

        if (course_ids.length > 0) {
            const itemsToInsert = course_ids.map((course_id, index) => ({
                group_id,
                course_id,
                order_index: index
            }));
            await supabaseAdmin.from('course_group_items').insert(itemsToInsert);
        }
        return { message: 'Courses in group updated successfully.' };
    },
    assign_group_to_department: async ({ payload, supabaseAdmin }) => {
        const { group_id, department } = payload;
        if (!group_id || !department) {
            throw { status: 400, message: 'group_id and department are required.' };
        }
        await supabaseAdmin.from('group_assignments').upsert({ group_id, department }, { onConflict: 'group_id, department' });
        const { data: group, error: groupError } = await supabaseAdmin.from('course_groups').select('deadline_days, course_group_items(course_id)').eq('id', group_id).single();
        if (groupError || !group) throw { status: 404, message: 'Course group not found.' };
        const courseIds = group.course_group_items.map(item => item.course_id);
        if (courseIds.length === 0) return { message: 'Group has no courses to assign.' };
        const { data: users, error: usersError } = await supabaseAdmin.from('users').select('id').eq('department', department);
        if (usersError) throw usersError;
        if (users.length === 0) return { message: `No users found in department: ${department}` };
        let deadlineDate = null;
        if (group.deadline_days) {
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + group.deadline_days);
            deadlineDate = deadline.toISOString();
        }
        const progressRecords = users.flatMap(user => courseIds.map(courseId => ({ user_id: user.id, course_id: courseId, deadline_date: deadlineDate })));
        if (progressRecords.length > 0) {
            await supabaseAdmin.from('user_progress').upsert(progressRecords, { onConflict: 'user_id, course_id' });
        }
        return { message: `Group assigned to department ${department}. ${progressRecords.length} course assignments created/updated.` };
    },
    delete_course_material: async ({ payload, supabaseAdmin }) => {
        const { material_id, storage_path } = payload;
        if (!material_id || !storage_path) throw { status: 400, message: 'Material ID and storage path are required.' };
        await supabaseAdmin.storage.from('course-materials').remove([storage_path]);
        await supabaseAdmin.from('course_materials').delete().eq('id', material_id);
        return { message: 'Material deleted successfully.' };
    },
    save_leaderboard_settings: async ({ payload, supabaseAdmin }) => {
        const { metrics } = payload;
        if (!metrics) throw { status: 400, message: 'Metrics object is required.' };
        const { error } = await supabaseAdmin.from('leaderboard_settings').upsert({ id: 1, metrics, updated_at: new Date().toISOString() });
        if (error) throw error;
        return { message: 'Leaderboard settings saved.' };
    },
    assign_course_to_user: async ({ payload, supabaseAdmin }) => {
        const { user_email, course_id } = payload;
        if (!user_email || !course_id) throw { status: 400, message: 'User email and course ID are required.' };
        const { data: users, error: userError } = await supabaseAdmin.rpc('get_all_users_with_details').eq('email', user_email);
        if (userError || !users || users.length === 0) throw { status: 404, message: 'User not found by email.' };
        await supabaseAdmin.from('user_progress').insert({ user_id: users[0].id, course_id: course_id });
        return { message: `Course assigned to ${user_email}.` };
    },
    text_to_speech: async ({ payload }) => {
        const { text, course_id } = payload;
        if (!text || !course_id) throw { status: 400, message: 'Text and course_id are required for TTS.' };
        try {
            const ttsResponse = await axios.post(TTS_SERVICE_URL, { text, course_id });
            return { audioUrl: ttsResponse.data.url };
        } catch (ttsError) {
            console.error('Error calling Python TTS service:', ttsError);
            throw new Error('Failed to generate audio summary.');
        }
    },
    get_simulation_results: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('simulation_results').select('created_at, scenario, persona, evaluation, users(full_name)');
        if (error) throw error;
        return data;
    },
    get_leaderboard_settings: async ({ supabaseAdmin }) => {
        const { data, error } = await supabaseAdmin.from('leaderboard_settings').select('*');
        if (error) throw error;
        return data;
    },
    upload_course_material: async ({ payload, supabaseAdmin }) => {
        const { course_id, file_name, file_data } = payload;
        if (!course_id || !file_name || !file_data) throw { status: 400, message: 'Missing required fields for material upload.' };
        const buffer = Buffer.from(file_data, 'base64');
        const storagePath = `course-materials/${course_id}/${Date.now()}-${file_name}`;
        const { error: uploadError } = await supabaseAdmin.storage.from('course-materials').upload(storagePath, buffer);
        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
        const { data: urlData } = supabaseAdmin.storage.from('course-materials').getPublicUrl(storagePath);
        const { data: dbRecord, error: dbError } = await supabaseAdmin.from('course_materials').insert({ course_id, file_name, storage_path: storagePath, public_url: urlData.publicUrl }).select().single();
        if (dbError) throw dbError;
        return dbRecord;
    },
};

// Главный эндпоинт админки
apiRouter.post('/admin', adminAuthMiddleware, async (req, res) => {
    const { action, ...payload } = req.body;
    const handler = adminActionHandlers[action];

    if (!handler) {
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const handlerPayload = {
            payload,
            supabaseAdmin,
            user: req.user,
            token: req.token,
            res // Pass response object for handlers that need to send a response early
        };
        const data = await handler(handlerPayload);

        // If handler returns null, it means the response was already sent (e.g., for background jobs)
        if (data !== null) {
            res.status(200).json(data);
        }
    } catch (error) {
        console.error(`Error processing action "${action}":`, error);
        const status = error.status || 500;
        const message = error.message || 'An internal server error occurred.';
        res.status(status).json({ error: message });
    }
});


// POST /api/getCourseContent
apiRouter.post('/getCourseContent', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { course_id } = req.body;
        if (!course_id) {
            return res.status(400).json({ error: 'course_id is required.' });
        }

        const { data: course, error } = await supabase
            .from('courses')
            .select('content, course_materials (*)')
            .eq('id', course_id)
            .single();

        if (error) throw error;
        if (!course) return res.status(404).json({ error: 'Course not found.' });

        // The 'content' field in the DB is a JSON string. Parse it.
        let parsedContent = { summary: [], questions: [] };
        if (course.content) {
            try {
                // The 'content' field is a JSON string, which needs to be parsed
                parsedContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
            } catch(e) {
                console.error(`Failed to parse content for course ${course_id}:`, e);
                // Return empty content if parsing fails, to prevent crash
            }
        }

        res.status(200).json({
            summary: parsedContent.summary || [],
            questions: parsedContent.questions || [],
            materials: course.course_materials || []
        });

    } catch (error) {
        console.error(`Error getting course content for ${req.body.course_id}:`, error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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

        const { data, error } = await supabase.rpc('get_leaderboard_data');

        if (error) throw error;

        res.status(200).json(data);
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/getDetailedReport
apiRouter.post('/getDetailedReport', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];

    const supabase = createSupabaseClient(token);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Admin check
    const { data: adminCheck, error: adminCheckError } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
    if (adminCheckError || !adminCheck?.is_admin) {
        return res.status(403).json({ error: 'Forbidden: User is not an admin.' });
    }

    try {
        const { user_email, department, course_id, format } = req.body;
        const supabaseAdmin = createSupabaseAdminClient();

        let query = supabaseAdmin
            .from('user_progress')
            .select(`
                percentage,
                time_spent_seconds,
                completed_at,
                courses ( title ),
                users ( id, full_name, department )
            `);

        if (course_id) {
            query = query.eq('course_id', course_id);
        }
        if (department) {
            query = query.ilike('users.department', `%${department}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Note: Filtering by user_email is not directly supported here as email is in auth.users.
        // The frontend can filter the results if needed. A more complex query would be needed for server-side filtering.
        let filteredData = data;
        if (user_email) {
            // This part is tricky. We don't have the email. We'd need another query to get user by email.
            // For now, let's assume this is handled client-side or we enhance this later.
        }

        // The frontend expects user_profiles, let's remap the data for consistency.
        const formattedData = filteredData.map(row => ({
            ...row,
            user_profiles: row.users,
            user_email: 'N/A' // Placeholder
        }));

        if (format === 'csv') {
            const csvHeader = "User Name,User Department,Course Title,Percentage,Time Spent (min),Completed At\n";
            const csvBody = formattedData.map(d => {
                const userName = d.user_profiles?.full_name?.replace(/"/g, '""') || 'N/A';
                const department = d.user_profiles?.department?.replace(/"/g, '""') || 'N/A';
                const courseTitle = d.courses?.title?.replace(/"/g, '""') || 'N/A';
                const percentage = d.percentage || 0;
                const timeSpent = d.time_spent_seconds ? Math.round(d.time_spent_seconds / 60) : 0;
                const completedAt = d.completed_at ? new Date(d.completed_at).toISOString() : 'In Progress';
                return `"${userName}","${department}","${courseTitle}",${percentage},${timeSpent},"${completedAt}"`;
            }).join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
            res.status(200).send(csvHeader + csvBody);
        } else {
            res.status(200).json(formattedData);
        }

    } catch (error) {
        console.error('Error getting detailed report:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});


// POST /api/getCourses
apiRouter.post('/getCourses', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        const supabase = createSupabaseClient(token);
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

        const { data: userProfile, error: profileError } = await supabase.from('users').select('department').eq('id', user.id).single();
        if (profileError) throw profileError;

        if (!userProfile.department) {
            return res.status(200).json([]); // User has no department, so no department-assigned groups
        }

        const { data: assignments, error: assignmentError } = await supabase
            .from('group_assignments')
            .select('group_id')
            .eq('department', userProfile.department);

        if (assignmentError) throw assignmentError;
        const assignedGroupIds = assignments.map(a => a.group_id);

        if (assignedGroupIds.length === 0) {
            return res.status(200).json([]); // No groups assigned to this department
        }

        const { data: groups, error: groupsError } = await supabase
            .from('course_groups')
            .select(`
                id,
                group_name,
                enforce_order,
                course_group_items (
                    order_index,
                    courses (
                        id,
                        title,
                        description,
                        status,
                        is_visible
                    )
                )
            `)
            .in('id', assignedGroupIds)
            .eq('is_visible', true)
            .order('order_index', { referencedTable: 'course_group_items', ascending: true });

        if (groupsError) throw groupsError;

        const visibleGroupsAndCourses = groups.map(group => {
            const filteredItems = group.course_group_items
                .filter(item => item.courses && item.courses.status === 'published' && item.courses.is_visible)
                .sort((a, b) => a.order_index - b.order_index);

            return {
                id: group.id,
                group_name: group.group_name,
                enforce_order: group.enforce_order,
                courses: filteredItems.map(item => item.courses)
            };
        }).filter(group => group.courses.length > 0);

        const allCourseIds = visibleGroupsAndCourses.flatMap(g => g.courses.map(c => c.id));
        if (allCourseIds.length === 0) {
            return res.status(200).json([]);
        }

        const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('course_id, completed_at, score, percentage, deadline_date')
            .eq('user_id', user.id)
            .in('course_id', allCourseIds);

        if (progressError) throw progressError;

        const userProgressMap = new Map(progressData.map(p => [p.course_id, p]));

        const finalResult = visibleGroupsAndCourses.map(group => {
            let isPreviousCourseCompleted = true;

            const coursesWithStatus = group.courses.map(course => {
                const progress = userProgressMap.get(course.id);
                let isLocked = false;

                if (group.enforce_order) {
                    if (!isPreviousCourseCompleted) {
                        isLocked = true;
                    }
                    isPreviousCourseCompleted = !!progress?.completed_at;
                }

                const { status, is_visible, ...courseDetails } = course;

                return {
                    ...courseDetails,
                    progress: progress || null,
                    is_locked: isLocked
                };
            });

            return { ...group, courses: coursesWithStatus };
        });

        res.status(200).json(finalResult);

    } catch (error) {
        console.error('Error in /api/getCourses:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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

        // Check if the course exists before trying to assign it
        const { data: course, error: courseError } = await supabase
            .from('courses')
            .select('id')
            .eq('id', course_id)
            .single();

        if (courseError || !course) {
            return res.status(404).json({ error: `Course with id ${course_id} not found.` });
        }

        const { error: insertError } = await supabase
            .from('user_progress')
            .insert({ user_id: user.id, course_id: course_id });

        if (insertError) {
             if (insertError.code === '23505') { // Unique violation
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

        const { percentage } = req.body;
        const dataToUpsert = {
            user_id: user.id,
            course_id: course_id,
            score: score,
            percentage: percentage,
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

// POST /api/getNotifications
apiRouter.post('/getNotifications', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
        const token = authHeader.split(' ')[1];

        const supabase = createSupabaseClient(token);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        // RLS-политика в Supabase автоматически отфильтрует уведомления для текущего user_id
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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

        // The course_id is now a UUID, so we don't need to check if it's a number.
        // The logic to create a new course if the ID is temporary is handled by the client.
        // Here we assume a valid UUID is passed for an existing course, or a new one is created before this job.
        // A more robust implementation would check if the course exists before proceeding.
        // For now, we trust the client to provide a valid course_id.

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

        // The 'content' column is TEXT, so we store the JSON as a string.
        console.log(`[Job ${jobId}] Content generated, now with images. Saving to database...`);
        const { error: dbError } = await supabaseAdmin
            .from('courses')
            .update({ content: JSON.stringify(parsedContent) })
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

// --- User-Facing API Endpoints ---

apiRouter.post('/askAssistant', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];
    const supabase = createSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { course_id, question } = req.body;
        if (!course_id || !question) return res.status(400).json({ error: 'course_id and question are required.' });

        const { data: courseData, error: courseError } = await supabase.from('courses').select('description, content').eq('id', course_id).single();
        if (courseError || !courseData) return res.status(404).json({ error: 'Course not found.' });

        // Улучшенная сборка контекста
        const courseContent = courseData.content || '';
        const context = `КОНТЕКСТ КУРСА:\n${courseData.description}\n\n${courseContent}`;
        const prompt = `Основываясь СТРОГО на предоставленном КОНТЕКСТЕ КУРСА, ответь на вопрос студента. Если ответ нельзя найти в тексте, скажи "Извините, я не могу ответить на этот вопрос на основе имеющихся материалов.". Вопрос студента: "${question}"`;

        const result = await model.generateContent(prompt);
        const response = result.response;

        if (!response || !response.text) {
            console.error('AI response was blocked, empty, or invalid for askAssistant. Full result:', JSON.stringify(result, null, 2));
            return res.status(200).json({ answer: "Извините, не удалось получить ответ от AI. Возможно, ваш запрос нарушает политику безопасности или произошла временная ошибка. Попробуйте переформулировать." });
        }

        const answer = response.text();
        res.status(200).json({ answer });
    } catch (error) {
        console.error('Detailed error in /api/askAssistant:', error);
        res.status(503).json({ error: 'AI service is currently unavailable.', details: error.message });
    }
});

apiRouter.post('/dialogueSimulator', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];
    const supabase = createSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { history, disposition, action, scenario } = req.body; // 'scenario' is passed back from client during chat/eval
        const supabaseAdmin = createSupabaseAdminClient();

        const dispositionMap = { '0': 'холодный и скептичный', '1': 'нейтральный и любопытный', '2': 'горячий и заинтересованный' };
        const persona = `Клиент (${dispositionMap[disposition] || 'нейтральный'})`;

        if (action === 'start') {
            const randomScenario = simulationScenarios[Math.floor(Math.random() * simulationScenarios.length)];
            const prompt = `Ты - симулятор диалога. Ты играешь роль клиента. Твое настроение: "${persona}". Твоя ситуация: "${randomScenario}". Начни диалог с ОДНОЙ короткой фразы, которая описывает твою проблему или вопрос.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;

            res.status(200).json({ first_message: response.text(), scenario: randomScenario });

        } else if (action === 'chat') {
            if (!scenario) return res.status(400).json({ error: 'Scenario is required for chat.' });
            const formattedHistory = history.map(h => `${h.role === 'user' ? 'Менеджер' : 'Клиент'}: ${h.text}`).join('\n');
            const prompt = `Ты — симулятор диалога в роли клиента.
Твоя личность: ${persona}.
Твой сценарий: "${scenario}".

Продолжи диалог, основываясь на истории. Отвечай коротко, по делу и только за себя (клиента).

ИСТОРИЯ ДИАЛОГА:
${formattedHistory}

Твой следующий ответ от имени клиента:`;

            const result = await model.generateContent(prompt);
            const response = result.response;

            if (!response || !response.text) {
                console.error('AI response was blocked, empty, or invalid. Full result:', JSON.stringify(result, null, 2));
                return res.status(200).json({ answer: "Извините, не удалось получить ответ от AI. Возможно, ваш запрос нарушает политику безопасности или произошла временная ошибка. Попробуйте переформулировать." });
            }

            res.status(200).json({ answer: response.text() });

        } else if (action === 'evaluate') {
            if (!scenario) return res.status(400).json({ error: 'Scenario is required for evaluation.' });
            const evaluationPrompt = `Оцени диалог по 10-бальной шкале по критериям: установление контакта, выявление потребностей, презентация решения, работа с возражениями, завершение сделки. Предоставь JSON с полями "evaluation_criteria" (массив объектов с "criterion", "score", "comment"), "average_score", "general_comment". Диалог: ${JSON.stringify(history)}`;

            const result = await model.generateContent(evaluationPrompt);
            const response = await result.response;
            const jsonString = response.text().replace(/(\`\`\`json\n|\`\`\`)/g, '').trim();
            const evaluation = JSON.parse(jsonString);

            await supabaseAdmin.from('simulation_results').insert({
                user_id: user.id,
                scenario,
                persona,
                evaluation
            });

            res.status(200).json({ answer: evaluation });
        } else {
            res.status(400).json({ error: 'Invalid action.' });
        }
    } catch (error) {
        console.error('Detailed error in /api/dialogueSimulator:', error);
        res.status(503).json({ error: 'AI service is currently unavailable.', details: error.message });
    }
});

apiRouter.post('/update-time-spent', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];
    const supabase = createSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { course_id, seconds_spent } = req.body;
        const { error } = await supabase.rpc('increment_time_spent', {
            p_course_id: course_id,
            p_user_id: user.id,
            p_seconds_spent: seconds_spent
        });
        if (error) throw error;
        res.status(200).json({ message: 'Time updated.' });
    } catch (error) {
        console.error('Error updating time spent:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

apiRouter.post('/markNotificationsAsRead', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const token = authHeader.split(' ')[1];
    const supabase = createSupabaseClient(token);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { notification_ids } = req.body;
        if (!Array.isArray(notification_ids)) return res.status(400).json({ error: 'notification_ids must be an array.' });

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', notification_ids)
            .eq('user_id', user.id);

        if (error) throw error;
        res.status(200).json({ message: 'Notifications marked as read.' });
    } catch (error) {
        console.error('Error marking notifications:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

apiRouter.post('/text-to-speech-user', async (req, res) => {
    try {
        const { text, course_id } = req.body;
        if (!text || !course_id) {
            return res.status(400).json({ error: 'Text and course_id are required.' });
        }

        const ttsResponse = await axios.post(TTS_SERVICE_URL, {
            text: text,
            course_id: course_id
        });

        res.status(200).json({ audioUrl: ttsResponse.data.url });

    } catch (error) {
        console.error('Error calling TTS service for user:', error);
        res.status(500).json({ error: 'Failed to generate audio summary.' });
    }
});


// --- Frontend Routes ---
app.get('/admin*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});


// --- Запуск сервера ---
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Сервер запущен и слушает порт ${PORT}`);
    });
}

module.exports = app;
// --- Конец ИСПРАВЛЕННОГО файла /server/index.js ---

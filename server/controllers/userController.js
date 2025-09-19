const { createSupabaseClient, createSupabaseAdminClient } = require('../lib/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// --- Service URLs ---
const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || 'https://special-pancake-69pp66w7x4qvf5gw7-5001.app.github.dev/generate-audio';

// --- Simulation Scenarios ---
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


// POST /api/getCourseContent
const getCourseContent = async (req, res) => {
    const supabase = req.supabase; // Assuming middleware adds this
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

        let parsedContent = { summary: [], questions: [] };
        if (course.content) {
            try {
                parsedContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
            } catch(e) {
                console.error(`Failed to parse content for course ${course_id}:`, e);
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
};

// POST /api/get-job-status
const getJobStatus = async (req, res) => {
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
};

// POST /api/get-leaderboard
const getLeaderboard = async (req, res) => {
    try {
        const supabase = req.supabase;
        const { data, error } = await supabase.rpc('get_leaderboard_data');
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// POST /api/getCourses
const getCourses = async (req, res) => {
    try {
        const supabase = req.supabase;
        const user = req.user;

        const { data: allProgress, error: progressError } = await supabase
            .from('user_progress')
            .select('course_id, completed_at, score, percentage, deadline_date')
            .eq('user_id', user.id);

        if (progressError) throw progressError;
        if (!allProgress || allProgress.length === 0) {
            return res.status(200).json([]);
        }

        const allCourseIds = allProgress.map(p => p.course_id);
        const userProgressMap = new Map(allProgress.map(p => [p.course_id, p]));

        const { data: coursesWithGroups, error: coursesError } = await supabase
            .from('courses')
            .select(`
                id, title, description,
                course_group_items (order_index, course_groups (id, group_name, enforce_order))
            `)
            .in('id', allCourseIds)
            .eq('status', 'published');

        if (coursesError) throw coursesError;

        const groupsMap = new Map();
        const individualCourses = [];

        for (const course of coursesWithGroups) {
            const { course_group_items, ...courseDetails } = course;
            const courseWithProgress = {
                ...courseDetails,
                progress: userProgressMap.get(course.id) || null,
                is_locked: false,
                _group_item: course_group_items && course_group_items.length > 0 ? course_group_items[0] : null
            };

            if (course.course_group_items && course.course_group_items.length > 0) {
                for (const item of course.course_group_items) {
                    const group = item.course_groups;
                    if (!groupsMap.has(group.id)) {
                        groupsMap.set(group.id, { ...group, courses: [] });
                    }
                    groupsMap.get(group.id).courses.push(courseWithProgress);
                }
            } else {
                individualCourses.push(courseWithProgress);
            }
        }

        if (individualCourses.length > 0) {
            groupsMap.set('individual', {
                id: 'individual',
                group_name: 'Индивидуальные курсы',
                enforce_order: false,
                courses: individualCourses
            });
        }

        for (const group of groupsMap.values()) {
            group.courses.sort((a, b) => (a._group_item?.order_index ?? 0) - (b._group_item?.order_index ?? 0));
            if (group.enforce_order) {
                let isPreviousCourseCompleted = true;
                group.courses.forEach(course => {
                    if (!isPreviousCourseCompleted) course.is_locked = true;
                    isPreviousCourseCompleted = !!course.progress?.completed_at;
                });
            }
        }

        res.status(200).json(Array.from(groupsMap.values()));

    } catch (error) {
        console.error('Error in /api/getCourses:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

// POST /api/assign-course
const assignCourse = async (req, res) => {
    try {
        const supabase = req.supabase;
        const user = req.user;
        const { course_id } = req.body;
        if (!course_id) return res.status(400).json({ error: 'course_id is required' });

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
             if (insertError.code === '23505') {
                return res.status(200).json({ message: 'Course already assigned.' });
            }
            throw insertError;
        }

        res.status(200).json({ message: `Successfully assigned to course ${course_id}` });
    } catch (error) {
        console.error('Error assigning course:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

// POST /api/saveTestResult
const saveTestResult = async (req, res) => {
    try {
        const user = req.user;
        const { course_id, score, percentage } = req.body;
        if (course_id === undefined || score === undefined || percentage === undefined) {
            return res.status(400).json({ error: 'Missing required fields: course_id, score, percentage.' });
        }

        const supabaseAdmin = createSupabaseAdminClient();
        const { data: existingRecord, error: selectError } = await supabaseAdmin
            .from('user_progress').select('attempts').eq('user_id', user.id).eq('course_id', course_id).maybeSingle();
        if (selectError) throw selectError;

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
};

// POST /api/getNotifications
const getNotifications = async (req, res) => {
    try {
        const supabase = req.supabase;
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
};

// POST /api/getCourseCatalog
const getCourseCatalog = async (req, res) => {
    try {
        const supabase = req.supabase;
        const user = req.user;

        const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('course_id, completed_at')
            .eq('user_id', user.id);
        if (progressError) throw progressError;
        const userProgressMap = new Map(progressData.map(p => [p.course_id, p]));

        const { data: allCatalogCourses, error: coursesError } = await supabase
            .from('courses')
            .select(`id, title, description, course_group_items(course_groups(group_name))`)
            .eq('status', 'published')
            .eq('is_visible', true);

        if (coursesError) throw coursesError;

        const finalCatalog = allCatalogCourses.map(course => {
            const progress = userProgressMap.get(course.id);
            let user_status = 'not_assigned';
            if (progress) {
                user_status = progress.completed_at ? 'completed' : 'assigned';
            }
            const groupName = course.course_group_items?.[0]?.course_groups?.group_name || null;
            return { id: course.id, title: course.title, description: course.description, group_name: groupName, user_status };
        });

        res.status(200).json(finalCatalog);
    } catch (error) {
        console.error('Error in /api/getCourseCatalog:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

// POST /api/askAssistant
const askAssistant = async (req, res) => {
    const supabase = req.supabase;
    try {
        const { course_id, question } = req.body;
        if (!course_id || !question) return res.status(400).json({ error: 'course_id and question are required.' });

        const { data: courseData, error: courseError } = await supabase.from('courses').select('description, content').eq('id', course_id).single();
        if (courseError || !courseData) return res.status(404).json({ error: 'Course not found.' });

        let courseTextContent = '';
        if (courseData.content && typeof courseData.content === 'object' && courseData.content.summary) {
            // Extract text from presentation slides
            courseTextContent = courseData.content.summary.map(slide => {
                const slideTitle = slide.slide_title || '';
                const slideContent = slide.html_content || '';
                // Basic HTML tag stripping and combine title + content
                const fullText = `${slideTitle}\n${slideContent}`;
                return fullText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            }).join('\n\n');
        } else if (typeof courseData.content === 'string') {
            // Fallback for plain text content that might be stored
            courseTextContent = courseData.content;
        }

        if (!courseData.description && !courseTextContent) {
             return res.status(200).json({ answer: "Материалы для этого курса еще не готовы, поэтому я не могу ответить на ваш вопрос." });
        }

        const context = `ОПИСАНИЕ КУРСА:
${courseData.description || 'Нет описания.'}

МАТЕРИАЛЫ КУРСА (СЛАЙДЫ ПРЕЗЕНТАЦИИ):
${courseTextContent || 'Нет текстовых материалов.'}`;

        const prompt = `Ты — русскоязычный чат-бот ассистент для образовательной платформы. Твоя главная задача — помогать студентам, отвечая на их вопросы СТРОГО в рамках предоставленных учебных материалов.

ЗАДАНИЕ:
1. Внимательно изучи "ОПИСАНИЕ КУРСА" и "МАТЕРИАЛЫ КУРСА". Это твой единственный источник знаний.
2. Ответь на "ВОПРОС СТУДЕНТА", основываясь ИСКЛЮЧИТЕЛЬНО на этой информации.
3. Если информация для ответа есть, дай четкий, полезный и лаконичный ответ. Цитируй или пересказывай информацию из текста.
4. Если в предоставленном контексте нет информации для ответа на вопрос, ты ОБЯЗАН ответить только одной фразой: "К сожалению, я не могу ответить на этот вопрос, так как информация выходит за рамки данного курса."
5. Не придумывай ничего, не делай предположений и не используй свои общие знания. Не извиняйся и не добавляй лишних фраз. Просто дай ответ по существу или стандартный отказ.

${context}

ВОПРОС СТУДЕНТА: "${question}"`;

        const result = await model.generateContent(prompt);
        const response = result.response;

        if (!response || !response.text()) {
            console.error('AI response was blocked or empty for askAssistant:', JSON.stringify(result, null, 2));
            return res.status(200).json({ answer: "Извините, не удалось получить ответ от AI. Попробуйте переформулировать." });
        }

        res.status(200).json({ answer: response.text() });
    } catch (error) {
        console.error('Detailed error in /api/askAssistant:', error);
        res.status(503).json({ error: 'AI service is currently unavailable.', details: error.message });
    }
};

// POST /api/dialogueSimulator
const dialogueSimulator = async (req, res) => {
    const supabaseAdmin = createSupabaseAdminClient();
    const user = req.user;
    try {
        const { history, disposition, action, scenario } = req.body;
        const dispositionMap = { '0': 'холодный и скептичный', '1': 'нейтральный и любопытный', '2': 'горячий и заинтересованный' };
        const persona = `Клиент (${dispositionMap[disposition] || 'нейтральный'})`;

        if (action === 'start') {
            const randomScenario = simulationScenarios[Math.floor(Math.random() * simulationScenarios.length)];
            const prompt = `Ты - симулятор диалога. Ты играешь роль клиента. Твое настроение: "${persona}". Твоя ситуация: "${randomScenario}". Начни диалог с ОДНОЙ короткой фразы, которая описывает твою проблему или вопрос.`;
            const result = await model.generateContent(prompt);
            res.status(200).json({ first_message: result.response.text(), scenario: randomScenario });

        } else if (action === 'chat') {
            if (!scenario) return res.status(400).json({ error: 'Scenario is required for chat.' });
            const formattedHistory = history.map(h => `${h.role === 'user' ? 'Менеджер' : 'Клиент'}: ${h.text}`).join('\n');
            const prompt = `Ты — симулятор диалога в роли клиента. Твоя личность: ${persona}. Твой сценарий: "${scenario}". Продолжи диалог, основываясь на истории. Отвечай коротко, по делу и только за себя (клиента).\n\nИСТОРИЯ ДИАЛОГА:\n${formattedHistory}\n\nТвой следующий ответ от имени клиента:`;
            const result = await model.generateContent(prompt);
            res.status(200).json({ answer: result.response.text() });

        } else if (action === 'evaluate') {
            if (!scenario) return res.status(400).json({ error: 'Scenario is required for evaluation.' });
            const evaluationPrompt = `Оцени диалог по 10-бальной шкале по критериям: установление контакта, выявление потребностей, презентация решения, работа с возражениями, завершение сделки. Предоставь JSON с полями "evaluation_criteria" (массив объектов с "criterion", "score", "comment"), "average_score", "general_comment". Диалог: ${JSON.stringify(history)}`;
            const result = await model.generateContent(evaluationPrompt);
            const jsonString = result.response.text().replace(/(\`\`\`json\n|\`\`\`)/g, '').trim();
            const evaluation = JSON.parse(jsonString);
            await supabaseAdmin.from('simulation_results').insert({ user_id: user.id, scenario, persona, evaluation });
            res.status(200).json({ answer: evaluation });
        } else {
            res.status(400).json({ error: 'Invalid action.' });
        }
    } catch (error) {
        console.error('Detailed error in /api/dialogueSimulator:', error);
        res.status(503).json({ error: 'AI service is currently unavailable.', details: error.message });
    }
};

// POST /api/update-time-spent
const updateTimeSpent = async (req, res) => {
    const supabase = req.supabase;
    const user = req.user;
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
};

// POST /api/markNotificationsAsRead
const markNotificationsAsRead = async (req, res) => {
    const supabase = req.supabase;
    const user = req.user;
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
};

// POST /api/text-to-speech-user
const textToSpeechUser = async (req, res) => {
    try {
        const { text, course_id } = req.body;
        if (!text || !course_id) {
            return res.status(400).json({ error: 'Text and course_id are required.' });
        }
        const ttsResponse = await axios.post(TTS_SERVICE_URL, { text, course_id });
        res.status(200).json({ audioUrl: ttsResponse.data.url });
    } catch (error) {
        console.error('Error calling TTS service for user:', error);
        res.status(500).json({ error: 'Failed to generate audio summary.' });
    }
};

module.exports = {
    getCourseContent,
    getJobStatus,
    getLeaderboard,
    getCourses,
    assignCourse,
    saveTestResult,
    getNotifications,
    getCourseCatalog,
    askAssistant,
    dialogueSimulator,
    updateTimeSpent,
    markNotificationsAsRead,
    textToSpeechUser,
};

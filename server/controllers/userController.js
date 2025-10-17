const { createSupabaseClient, createSupabaseAdminClient } = require('../lib/supabaseClient');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// --- AI/External Service Clients ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

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

        let parsedContent = { summary: { slides: [] }, questions: [] };
        if (course.content) {
            try {
                parsedContent = typeof course.content === 'string' ? JSON.parse(course.content) : course.content;
            } catch(e) {
                console.error(`Failed to parse content for course ${course_id}:`, e);
                // If parsing fails, we'll send empty content to avoid crashing the client
                parsedContent = { summary: { slides: [] }, questions: [] };
            }
        }

        res.status(200).json({
            summary: (parsedContent.summary && parsedContent.summary.slides) ? parsedContent.summary.slides : [],
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
                id, title, description, presentation_url,
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
            .select('id, deadline_days')
            .eq('id', course_id)
            .single();

        if (courseError || !course) {
            return res.status(404).json({ error: `Course with id ${course_id} not found.` });
        }

        const insertData = { user_id: user.id, course_id: course_id };

        // Only calculate deadline if the course is assigned individually (not via a group)
        // A simple check is to see if the course has a deadline_days value. Group deadlines are handled elsewhere.
        if (course.deadline_days) {
            const deadline = new Date();
            deadline.setDate(deadline.getDate() + course.deadline_days);
            insertData.deadline_date = deadline.toISOString();
        }

        const { error: insertError } = await supabase
            .from('user_progress')
            .insert(insertData);

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

        // Step 1: Get user's progress for all courses
        const { data: progressData, error: progressError } = await supabase
            .from('user_progress')
            .select('course_id, completed_at')
            .eq('user_id', user.id);
        if (progressError) throw progressError;
        const userProgressMap = new Map(progressData.map(p => [p.course_id, p]));

        // Step 2: Get all visible courses with their group info
        const { data: allCatalogCourses, error: coursesError } = await supabase
            .from('courses')
            .select(`
                id, title, description,
                course_group_items ( order_index, course_groups (id, group_name) )
            `)
            .eq('status', 'published')
            .eq('is_visible', true);

        if (coursesError) throw coursesError;

        const groupsMap = new Map();
        const individualCourses = [];

        // Step 3: Process and group the courses
        for (const course of allCatalogCourses) {
            const progress = userProgressMap.get(course.id);
            let user_status = 'not_assigned';
            if (progress) {
                user_status = progress.completed_at ? 'completed' : 'assigned';
            }

            const { course_group_items, ...courseDetails } = course;
            const courseWithStatus = { ...courseDetails, user_status };

            if (course.course_group_items && course.course_group_items.length > 0) {
                 for (const item of course.course_group_items) {
                    const group = item.course_groups;
                    if (!group) continue; // Skip if group data is missing
                    if (!groupsMap.has(group.id)) {
                        groupsMap.set(group.id, { ...group, courses: [] });
                    }
                    groupsMap.get(group.id).courses.push(courseWithStatus);
                }
            } else {
                individualCourses.push(courseWithStatus);
            }
        }

        // Step 4: Add individual courses as a separate group
        if (individualCourses.length > 0) {
            groupsMap.set('individual', {
                id: 'individual',
                group_name: 'Индивидуальные курсы',
                courses: individualCourses
            });
        }

        // Step 5: Return the grouped structure
        res.status(200).json(Array.from(groupsMap.values()));

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
        if (courseData.content && typeof courseData.content === 'object' && courseData.content.summary && Array.isArray(courseData.content.summary.slides)) {
            // Extract text from presentation slides
            courseTextContent = courseData.content.summary.slides.map(slide => {
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
        console.error('Error in /api/askAssistant:', error);
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
            const evaluationPrompt = `
You are a dialogue evaluation expert. Your task is to analyze the following conversation between a Manager and a Client and provide a structured evaluation in JSON format.

**Instructions:**
1.  **Analyze the Dialogue:** Carefully read the dialogue provided below.
2.  **Evaluate Based on Criteria:** Rate the Manager's performance on a scale of 1 to 10 for each of the following criteria:
    *   Установление контакта (Building Rapport)
    *   Выявление потребностей (Identifying Needs)
    *   Презентация решения (Presenting the Solution)
    *   Работа с возражениями (Handling Objections)
    *   Завершение сделки (Closing the Deal)
3.  **Provide Comments:** For each criterion, provide a brief, constructive comment in Russian explaining the score.
4.  **Calculate Average Score:** Calculate the average of the five scores.
5.  **Write a General Comment:** Provide an overall summary and feedback in Russian.
6.  **Format as JSON:** Your final output MUST be a single, valid JSON object. Do not include any text or explanations before or after the JSON object. The JSON object must have the following structure:
{
    "evaluation_criteria": [
        { "criterion": "...", "score": 1-10, "comment": "..." }
    ],
    "average_score": <number>,
    "general_comment": "..."
}

**Dialogue to Evaluate:**
${JSON.stringify(history)}

**JSON Output:**
`;
            const result = await model.generateContent(evaluationPrompt);
            const rawResponse = result.response.text();

            // Find the start and end of the JSON object
            const jsonStart = rawResponse.indexOf('{');
            const jsonEnd = rawResponse.lastIndexOf('}');

            if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
                throw new Error('Could not find a valid JSON object in the AI response.');
            }

            const jsonString = rawResponse.substring(jsonStart, jsonEnd + 1);
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
    const { text } = req.body;

    // FR-9: Validate input
    if (!text || text.trim() === '') {
        return res.status(400).json({ error: 'Text for speech synthesis is required.' });
    }

    // New: Configuration check
    if (!process.env.BYTEZ_API_URL || !process.env.BYTEZ_API_KEY || process.env.BYTEZ_API_KEY === 'your_bytez_api_key_here') {
        console.error('Bytez API is not configured. Please check .env file.');
        return res.status(500).json({ error: 'The Text-to-Speech service is not configured on the server.' });
    }

    try {
        // FR-2, FR-3, FR-4, FR-5: Call Bytez API
        const bytezResponse = await axios.post(
            process.env.BYTEZ_API_URL,
            {
                model: "suno/bark",
                input: text
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.BYTEZ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        );

        // NFR-4: Log API interaction
        console.log(`Bytez API call successful for user TTS.`);

        // FR-6, FR-7: Process successful response
        const { output, error: bytezError } = bytezResponse.data;

        if (bytezError) {
            // FR-8: Handle error from Bytez
            console.error('Bytez API returned an error:', bytezError);
            return res.status(502).json({ error: 'Failed to generate audio due to an external service error.' });
        }

        if (!output) {
             console.error('Bytez API response missing output field:', bytezResponse.data);
             return res.status(502).json({ error: 'Received an invalid response from the audio generation service.' });
        }

        res.status(200).json({ url: output });

    } catch (error) {
        // NFR-3, NFR-4: Handle network/timeout errors
        if (error.code === 'ECONNABORTED' || error.response?.status === 503) {
            console.error('Bytez API is unavailable or timed out:', error.message);
            return res.status(503).json({ error: 'The audio generation service is currently unavailable.' });
        }

        // FR-8: Handle specific API errors (like invalid key) by checking the response status
        if (error.response) {
            console.error(`Bytez API returned an error: Status ${error.response.status}`, error.response.data);
            return res.status(502).json({ error: 'Failed to generate audio due to an external service error.' });
        }

        // Handle other potential errors (e.g., config issues, no response)
        console.error('Error calling Bytez TTS service for user:', error.message);
        res.status(500).json({ error: 'An internal error occurred while generating the audio summary.' });
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

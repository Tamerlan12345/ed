const { createSupabaseAdminClient } = require('../lib/supabaseClient');

// POST /api/getTestHistory
const getTestHistory = async (req, res) => {
    const { user_id, course_id } = req.body;
    if (!user_id || !course_id) {
        return res.status(400).json({ error: 'user_id and course_id are required.' });
    }

    try {
        const supabaseAdmin = createSupabaseAdminClient();
        const { data, error } = await supabaseAdmin
            .from('user_test_answers')
            .select('*')
            .eq('user_id', user_id)
            .eq('course_id', course_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.status(200).json(data);
    } catch (error) {
        console.error('Error getting test history:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getDetailedReport = async (req, res) => {
    // 1. Извлекаем параметры из тела POST-запроса
    const { courseId, userId } = req.body;

    if (!courseId) {
        return res.status(400).json({ message: 'courseId is required' });
    }

    try {
        // 2. Здесь будет ваша логика запросов к БД для сбора данных
        //    Например, получить все ответы конкретного пользователя по курсу.
        const reportData = {
            message: "Report data for course " + courseId,
            user: userId || "all users",
            // ...реальные данные отчета
        };

        // 3. Отправляем успешный ответ
        res.status(200).json(reportData);

    } catch (error) {
        console.error('Error generating detailed report:', error);
        res.status(500).json({ message: 'Failed to generate report' });
    }
};

module.exports = {
    getTestHistory,
    getDetailedReport,
};
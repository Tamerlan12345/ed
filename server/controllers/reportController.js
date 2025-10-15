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

module.exports = {
    getTestHistory,
};
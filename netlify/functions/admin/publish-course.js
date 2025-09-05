const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, course_id, content_html, questions, admin_prompt } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin', 'editor'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        const courseContent = { summary: content_html, questions: questions, admin_prompt: admin_prompt || '' };
        const updateData = {
            content_html: courseContent,
            status: 'published'
        };

        const { error } = await supabase.from('courses').update(updateData).eq('course_id', course_id);
        if (error) throw error;

        return { statusCode: 200, body: JSON.stringify({ message: `Course ${course_id} successfully published.` }) };
    } catch (error) {
        return handleError(error, 'publish-course');
    }
};

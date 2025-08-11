const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
    try {
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) throw new Error('Unauthorized');

        const { course_id } = event.queryStringParameters;
        if (!course_id) return { statusCode: 400, body: JSON.stringify({ error: 'course_id is required' }) };

        const { data, error } = await supabase
            .from('courses')
            .select('content_html')
            .eq('course_id', course_id)
            .eq('status', 'published')
            .single();

        if (error || !data) {
            throw new Error('Опубликованный курс не найден.');
        }

        const courseContent = data.content_html;
        if (!courseContent || typeof courseContent !== 'object' || !courseContent.summary) {
            throw new Error('Формат контента курса неверный. Обратитесь к администратору.');
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ summary: courseContent.summary, questions: courseContent.questions || [] })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

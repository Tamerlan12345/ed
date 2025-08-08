const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    try {
        // ... (проверка, что это админ)

        const { course_id, status, content_html, questions, admin_prompt } = JSON.parse(event.body);

        if (!course_id || !content_html || !questions) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Необходимы все поля для сохранения.' }) };
        }

        const { data, error } = await supabase
            .from('courses')
            .update({
                content_html: content_html,
                questions: questions,
                status: status, // 'draft' или 'published'
                admin_prompt: admin_prompt,
                last_updated: new Date().toISOString()
            })
            .eq('course_id', course_id);

        if (error) throw error;

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Курс успешно сохранен со статусом: ${status}` })
        };

    } catch (error) {
        console.error("Ошибка сохранения:", error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

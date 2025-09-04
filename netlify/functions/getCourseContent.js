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

        let courseContent = data.content_html;

        // Handle case where content_html is a JSON string
        if (typeof courseContent === 'string') {
            try {
                courseContent = JSON.parse(courseContent);
            } catch (e) {
                throw new Error('Ошибка парсинга контента курса. Контент поврежден.');
            }
        }

        let summary, questions;

        if (courseContent && typeof courseContent === 'object' && courseContent.summary) {
            // New format: { summary: ..., questions: ... }
            summary = courseContent.summary;
            questions = courseContent.questions || [];
        } else {
            // Old format (content is just the summary array) or null
            summary = courseContent;
            questions = []; // No questions available in old format
        }

        if (!summary) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Контент для данного курса не найден.' }) };
        }

        // Fetch course materials
        const { data: materials, error: materialsError } = await supabase
            .from('course_materials')
            .select('file_name, storage_path')
            .eq('course_id', course_id);

        if (materialsError) throw materialsError;

        // Get public URLs for the materials
        const materialsWithUrls = materials.map(m => {
            const { data: { publicUrl } } = supabase.storage.from('course-materials').getPublicUrl(m.storage_path);
            return { file_name: m.file_name, public_url: publicUrl };
        });

        return { 
            statusCode: 200, 
            body: JSON.stringify({ summary, questions, materials: materialsWithUrls })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

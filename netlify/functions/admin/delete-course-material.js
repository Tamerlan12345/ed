const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { storage_path, material_id } = JSON.parse(event.body);
        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        await supabase.storage.from('course-materials').remove([storage_path]);
        await supabase.from('course_materials').delete().eq('id', material_id);

        return { statusCode: 200, body: JSON.stringify({ message: 'Материал удален.' }) };
    } catch (error) {
        return handleError(error, 'delete-course-material');
    }
};

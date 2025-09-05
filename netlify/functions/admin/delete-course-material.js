const { createClient } = require('@supabase/supabase-js');
const { isAuthorized } = require('../utils/auth');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { roles, storage_path, material_id } = JSON.parse(event.body);

        if (!isAuthorized(roles, ['admin', 'editor'])) {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

        await supabase.storage.from('course-materials').remove([storage_path]);
        await supabase.from('course_materials').delete().eq('id', material_id);

        return { statusCode: 200, body: JSON.stringify({ message: 'Материал удален.' }) };
    } catch (error) {
        return handleError(error, 'delete-course-material');
    }
};

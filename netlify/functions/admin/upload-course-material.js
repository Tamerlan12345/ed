const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { course_id, file_name, file_data } = JSON.parse(event.body);

        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );


        const materialBuffer = Buffer.from(file_data, 'base64');
        const storagePath = `${course_id}/${file_name}`;
        const { error: se } = await supabase.storage.from('course-materials').upload(storagePath, materialBuffer, { upsert: true });
        if (se) throw se;

        const { error: dbe } = await supabase.from('course_materials').upsert({ course_id: course_id, file_name: file_name, storage_path: storagePath }, { onConflict: 'storage_path' });
        if (dbe) throw dbe;

        return { statusCode: 200, body: JSON.stringify({ message: 'Материал успешно загружен.' }) };
    } catch (error) {
        return handleError(error, 'upload-course-material');
    }
};

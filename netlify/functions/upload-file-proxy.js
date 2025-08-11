const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    try {
        // First, verify the user is an admin, as this function has elevated privileges.
        // We can't use the service key for this, we must use the anon key and the user's token.
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        const authHeader = event.headers.authorization;
        if (!authHeader) {
            throw new Error('Authorization header is missing.');
        }
        const token = authHeader.split(' ')[1];

        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);

        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            throw new Error('Access denied.');
        }

        const { course_id, file_name, file_data } = JSON.parse(event.body);

        if (!course_id || !file_name || !file_data) {
            throw new Error('Missing required fields: course_id, file_name, or file_data.');
        }

        const buffer = Buffer.from(file_data, 'base64');
        const filePath = `${course_id}/${file_name}`;

        // Use the privileged client (with the service key) to upload the file.
        const { data, error } = await supabase.storage
            .from('1')
            .upload(filePath, buffer, {
                contentType: 'application/octet-stream', // Let Supabase determine the type from the extension
                upsert: true,
            });

        if (error) {
            throw error;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'File uploaded successfully via proxy.', path: data.path })
        };

    } catch (error) {
        console.error('Error in upload-file-proxy:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An unknown error occurred.' })
        };
    }
};

const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

exports.handler = async (event) => {
    // 1. Check for POST request
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    try {
        // 2. Get user from token
        const token = event.headers.authorization.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // 3. Get course_id from request body
        const { course_id } = JSON.parse(event.body);
        if (!course_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'course_id is required' }) };
        }

        // 4. Insert into user_progress table
        // The primary key is now on (user_id, course_id).
        // We must insert the user's UUID (user.id) and their email for convenience.
        const { error: insertError } = await supabase
            .from('user_progress')
            .upsert({
                user_id: user.id, // Correct UUID from auth.users
                user_email: user.email, // Still useful to have
                course_id: course_id
            }, {
                onConflict: 'user_id, course_id', // Use the new composite primary key
                ignoreDuplicates: true // Prevents errors on re-assignment
            });

        if (insertError) {
            throw insertError;
        }

        // 5. Return success
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully assigned to course ${course_id}` })
        };

    } catch (error) {
        return handleError(error, 'assign-course');
    }
};

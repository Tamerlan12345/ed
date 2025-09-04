const { createClient } = require('@supabase/supabase-js');

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
        // The table has default values for score, percentage, etc.
        // Using ON CONFLICT DO NOTHING prevents an error if the user is already enrolled,
        // which makes the operation idempotent and safe.
        const { error: insertError } = await supabase
            .from('user_progress')
            .insert({
                user_email: user.email,
                course_id: course_id
            }, { returning: 'minimal' }) // Use returning 'minimal' for Supabase v2
            .onConflict('user_email, course_id')
            .ignore();

        if (insertError) {
            // Log the actual error on the server
            console.error('Supabase insert error:', insertError);
            // Return a generic error to the client
            return { statusCode: 500, body: JSON.stringify({ error: 'Could not assign course.' }) };
        }

        // 5. Return success
        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Successfully assigned to course ${course_id}` })
        };

    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

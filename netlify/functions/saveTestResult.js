const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Use the service key for database operations
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        // Use the anon key just for getting the user from the token
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        const token = event.headers.authorization.split(' ')[1];
        if (!token) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Missing authorization token.' }) };
        }

        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);
        if (authError || !user) {
            console.error('Auth error:', authError);
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
        }

        const data = JSON.parse(event.body);
        const { course_id, score, total_questions, percentage } = data;

        if (!course_id || score === undefined || !total_questions || percentage === undefined) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields in request body.' }) };
        }

        // Step 1: Check if a record already exists
        const { data: existingRecord, error: selectError } = await supabase
            .from('user_progress')
            .select('id')
            .eq('user_email', user.email)
            .eq('course_id', course_id)
            .maybeSingle();

        if (selectError) {
            console.error('Supabase select error:', selectError);
            throw selectError;
        }

        const recordPayload = {
            user_email: user.email,
            course_id: course_id,
            score: score,
            total_questions: total_questions,
            percentage: percentage,
            completed_at: new Date().toISOString(),
        };

        if (existingRecord) {
            // Step 2a: Update existing record
            const { error: updateError } = await supabase
                .from('user_progress')
                .update(recordPayload)
                .eq('id', existingRecord.id);

            if (updateError) {
                console.error('Supabase update error:', updateError);
                throw updateError;
            }
        } else {
            // Step 2b: Insert new record
            const { error: insertError } = await supabase
                .from('user_progress')
                .insert(recordPayload);

            if (insertError) {
                console.error('Supabase insert error:', insertError);
                throw insertError;
            }
        }

        return { statusCode: 200, body: JSON.stringify({ message: 'Результат успешно сохранен' }) };

    } catch (error) {
        console.error('Error in saveTestResult handler:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Не удалось сохранить результат. ' + error.message }) };
    }
};

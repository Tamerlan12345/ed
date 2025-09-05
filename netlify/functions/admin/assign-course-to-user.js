const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('../utils/errors');

exports.handler = async (event) => {
    try {
        const { user_email, course_id } = JSON.parse(event.body);

        if (!user_email || !course_id) {
            return { statusCode: 400, body: JSON.stringify({ error: 'user_email and course_id are required.' }) };
        }

        const token = event.headers.authorization.split(' ')[1];
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // First, get the user ID for the given email.
        // Note: This requires an RLS policy that allows admins to view user profiles.
        const { data: userData, error: userError } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('email', user_email) // Assuming user_profiles has an email column. If not, this needs adjustment.
            .single();

        // Let's check the schema. user_profiles does not have email. auth.users has it.
        // We need to query auth.users, which can only be done with service_key or in a SECURITY DEFINER function.
        // Let's use the get_all_users_with_profiles RPC which we already secured.

        const { data: allUsers, error: rpcError } = await supabase.rpc('get_all_users_with_profiles');
        if (rpcError) throw rpcError;

        const targetUser = allUsers.find(u => u.email === user_email);

        if (!targetUser) {
            return { statusCode: 404, body: JSON.stringify({ error: `User with email ${user_email} not found.` }) };
        }

        const user_id = targetUser.id;

        // Now, upsert into user_progress using the correct user_id.
        // Note: This requires an RLS policy allowing admins to INSERT/UPDATE user_progress.
        const { error: upsertError } = await supabase
            .from('user_progress')
            .upsert({ user_id, course_id, user_email }, { onConflict: 'user_id, course_id' });

        if (upsertError) throw upsertError;

        return { statusCode: 200, body: JSON.stringify({ message: `Course ${course_id} assigned to ${user_email}.` }) };
    } catch (error) {
        return handleError(error, 'assign-course-to-user');
    }
};

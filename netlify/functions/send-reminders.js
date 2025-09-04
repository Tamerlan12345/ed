const { createClient } = require('@supabase/supabase-js');

// This function requires the SERVICE_ROLE_KEY to bypass RLS and insert notifications for any user.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    try {
        // Define the threshold for reminders, e.g., 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // 1. Find all user progress records for courses assigned more than 7 days ago and still not complete.
        const { data: incompleteProgress, error: progressError } = await supabase
            .from('user_progress')
            .select(`
                user_email,
                created_at,
                courses ( title ),
                user_profiles ( user_id:id )
            `)
            .lt('percentage', 100) // less than 100% complete
            .lte('created_at', sevenDaysAgo.toISOString()); // assigned on or before 7 days ago

        if (progressError) {
            console.error('Error fetching incomplete progress:', progressError);
            throw progressError;
        }

        if (!incompleteProgress || incompleteProgress.length === 0) {
            console.log('No overdue courses found. No reminders to send.');
            return { statusCode: 200, body: 'No reminders to send.' };
        }

        // 2. Prepare notifications for each overdue course
        const notificationsToInsert = incompleteProgress
            .filter(p => p.user_profiles && p.user_profiles.user_id) // Ensure we have a user_id to insert
            .map(p => ({
                user_id: p.user_profiles.user_id,
                message: `Напоминание: Пожалуйста, завершите курс "${p.courses.title}".`
            }));

        if (notificationsToInsert.length === 0) {
            console.log('Filtered out all potential reminders (missing user_id).');
            return { statusCode: 200, body: 'No valid users for reminders.' };
        }

        // 3. Insert notifications into the database
        const { error: insertError } = await supabase
            .from('notifications')
            .insert(notificationsToInsert);

        if (insertError) {
            console.error('Error inserting notifications:', insertError);
            throw insertError;
        }

        console.log(`Successfully inserted ${notificationsToInsert.length} reminders.`);
        return { statusCode: 200, body: `Inserted ${notificationsToInsert.length} reminders.` };

    } catch (error) {
        console.error('Error in send-reminders function:', error.message);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};

const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const token = event.headers.authorization.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { notification_ids } = JSON.parse(event.body);

    if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
      return { statusCode: 400, body: 'Bad Request: notification_ids must be a non-empty array.' };
    }

    // RLS policy ensures users can only update their own notifications.
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', notification_ids)
      .eq('user_id', user.id); // Double-check ownership on the server-side

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ message: 'Notifications marked as read.' }) };
  } catch (error) {
    return handleError(error, 'markNotificationsAsRead');
  }
};

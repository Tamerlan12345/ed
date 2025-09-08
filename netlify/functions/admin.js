const { createClient } = require('@supabase/supabase-js');
const actionHandlers = require('./admin/actionHandlers');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch (error) {
        console.error('Error parsing request body:', error);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON format in request body.' }) };
    }

    const { action } = payload;
    const handlerPath = actionHandlers[action];

    if (!action || !handlerPath) {
        return { statusCode: 400, body: JSON.stringify({ error: `Invalid action: ${action}` }) };
    }

    try {
        // Authenticate user
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is missing.' }) };
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);

        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // Lazy load the specific handler
        const handler = require(handlerPath).handler;

        // The original event, which contains the vital Authorization header,
        // is passed directly to the sub-handler.
        // The sub-handler is responsible for creating its own user-scoped Supabase client
        // and for relying on RLS for authorization.
        // This router's only job is to validate the user token and route the request.
        return await handler(event);

    } catch (error) {
        console.error(`Error processing action "${action}":`, error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'An internal server error occurred.',
                action: action,
                errorMessage: error.message,
                errorStack: error.stack
            })
        };
    }
};

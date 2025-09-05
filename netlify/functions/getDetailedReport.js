const { createClient } = require('@supabase/supabase-js');

// This function requires the SERVICE_ROLE_KEY to bypass RLS and join user profiles.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function convertToCSV(data) {
    if (!data || data.length === 0) {
        return '';
    }
    const headers = ['Full Name', 'Email', 'Department', 'Course Title', 'Progress (%)', 'Time Spent (min)', 'Completed At'];
    const csvRows = [headers.join(',')];

    for (const row of data) {
        const timeSpentMinutes = row.time_spent_seconds ? Math.round(row.time_spent_seconds / 60) : 0;
        const values = [
            `"${row.user_profiles?.full_name || 'N/A'}"`,
            `"${row.user_email}"`,
            `"${row.user_profiles?.department || 'N/A'}"`,
            `"${row.courses.title}"`,
            row.percentage,
            timeSpentMinutes,
            `"${row.completed_at ? new Date(row.completed_at).toLocaleString() : 'In Progress'}"`
        ];
        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}

exports.handler = async (event) => {
    try {
        // Proper security check for an admin-only function
        const anonSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is missing.' }) };
        }
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await anonSupabase.auth.getUser(token);

        if (authError || !user || user.email.toLowerCase() !== 'admin@cic.kz') {
            return { statusCode: 403, body: JSON.stringify({ error: 'Access denied.' }) };
        }

        const { user_email, department, course_id } = event.queryStringParameters || {};

        // Call the RPC function with the filter parameters.
        // The main 'supabase' client uses the SERVICE_ROLE_KEY to bypass RLS for reporting.
        const { data, error } = await supabase.rpc('get_detailed_report_data', {
            user_email_filter: user_email,
            department_filter: department,
            course_id_filter: course_id
        });

        if (error) {
            // Log the detailed error on the server
            console.error('Supabase RPC error:', error);
            // Return a more detailed error to the client for debugging
            const errorMessage = error.message || 'An unknown database error occurred.';
            return { statusCode: 500, body: JSON.stringify({ error: `Failed to fetch report data: ${errorMessage}` }) };
        }

        const { format } = event.queryStringParameters || {};

        if (format === 'csv') {
            const csv = convertToCSV(data);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="report-${new Date().toISOString().split('T')[0]}.csv"`
                },
                body: csv
            };
        } else {
            // Default to JSON
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            };
        }
    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An unexpected error occurred.' }) };
    }
};

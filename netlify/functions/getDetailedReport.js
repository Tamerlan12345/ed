const { createClient } = require('@supabase/supabase-js');
const { handleError } = require('./utils/errors');

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
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header is missing.' }) };
        }
        const token = authHeader.split(' ')[1];

        // Create a single, user-scoped Supabase client.
        // This client will be used for all database operations.
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY,
            { global: { headers: { Authorization: `Bearer ${token}` } } }
        );

        // Verify user authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
        }

        // The RPC call below will be protected by RLS.
        // The policies for user_progress, courses, and user_profiles will be checked.
        // If the user does not have the required role ('admin', 'editor', or 'viewer'),
        // the RPC call will fail or return empty data, which is the desired secure behavior.
        // The explicit role check is removed to make RLS the single source of truth.

        const { user_email, department, course_id, format } = event.queryStringParameters || {};

        // Call the RPC function using the user-scoped client.
        // RLS policies will be enforced by Supabase for this call.
        const { data, error } = await supabase.rpc('get_detailed_report_data', {
            user_email_filter: user_email,
            department_filter: department,
            course_id_filter: course_id
        });

        if (error) {
            throw error;
        }

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
        return handleError(error, 'getDetailedReport');
    }
};

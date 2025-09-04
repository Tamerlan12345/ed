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
    //
    // Security check: This is a privileged function. Ensure only admins can call it.
    // In a real app, you'd use a more robust RBAC check here.
    // For now, we rely on the obscurity of the function URL and the admin-only frontend.
    // A proper check would involve validating an admin JWT.
    //

    try {
        const { user_email, department, course_id } = event.queryStringParameters || {};

        // Call the RPC function with the filter parameters.
        // This is more robust than building a complex join in JS.
        const { data, error } = await supabase.rpc('get_detailed_report_data', {
            user_email_filter: user_email,
            department_filter: department,
            course_id_filter: course_id
        });

        if (error) {
            // Log the detailed error on the server
            console.error('Supabase RPC error:', error);
            // Return a generic error to the client
            return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch report data.' }) };
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

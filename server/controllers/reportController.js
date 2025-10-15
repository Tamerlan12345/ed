const { createSupabaseAdminClient } = require('../lib/supabaseClient');

const getDetailedReport = async (req, res) => {
    // Note: admin access is already verified by the adminAuthMiddleware in the router.
    try {
        const { user_email, department, course_id, format } = req.body;
        const supabaseAdmin = createSupabaseAdminClient();

        let query = supabaseAdmin
            .from('user_progress')
            .select(`
                percentage,
                time_spent_seconds,
                completed_at,
                courses ( title ),
                users ( id, full_name, department )
            `);

        if (course_id) {
            query = query.eq('course_id', course_id);
        }
        if (department) {
            // Using 'ilike' for case-insensitive matching on the nested user's department
            query = query.ilike('users.department', `%${department}%`);
        }
        // Note: Filtering by user_email is not directly supported in this query structure
        // because the email is in a separate table (auth.users).
        // A more complex RPC function would be needed for efficient server-side email filtering.
        // The original code also acknowledged this limitation.

        const { data, error } = await query;
        if (error) throw error;

        const formattedData = data.map(row => ({
            ...row,
            user_profiles: row.users, // Keep consistency with old frontend expectations
        }));

        if (format === 'csv') {
            const csvHeader = "User Name,User Department,Course Title,Percentage,Time Spent (min),Completed At\n";
            const csvBody = formattedData.map(d => {
                const userName = d.user_profiles?.full_name?.replace(/"/g, '""') || 'N/A';
                const dept = d.user_profiles?.department?.replace(/"/g, '""') || 'N/A';
                const courseTitle = d.courses?.title?.replace(/"/g, '""') || 'N/A';
                const percentage = d.percentage || 0;
                const timeSpent = d.time_spent_seconds ? Math.round(d.time_spent_seconds / 60) : 0;
                const completedAt = d.completed_at ? new Date(d.completed_at).toISOString() : 'In Progress';
                return `"${userName}","${dept}","${courseTitle}",${percentage},${timeSpent},"${completedAt}"`;
            }).join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
            // Add BOM for Excel to recognize UTF-8
            res.status(200).send('\uFEFF' + csvHeader + csvBody);
        } else {
            res.status(200).json(formattedData);
        }

    } catch (error) {
        console.error('Error getting detailed report:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

module.exports = {
    getDetailedReport,
};

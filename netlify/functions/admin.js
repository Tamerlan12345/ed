const { createClient } = require('@supabase/supabase-js');

// Course and Content Management
const getCoursesHandler = require('./admin/get-courses').handler;
const getCourseDetailsHandler = require('./admin/get-course-details').handler;
const uploadAndProcessHandler = require('./admin/upload-and-process').handler;
const generateContentHandler = require('./admin/generate-content').handler;
const publishCourseHandler = require('./admin/publish-course').handler;
const deleteCourseHandler = require('./admin/delete-course').handler;

// Course Group Management
const getCourseGroupsHandler = require('./admin/get-course-groups').handler;
const createCourseGroupHandler = require('./admin/create-course-group').handler;
const updateCourseGroupHandler = require('./admin/update-course-group').handler;
const deleteCourseGroupHandler = require('./admin/delete-course-group').handler;
const getGroupDetailsHandler = require('./admin/get-group-details').handler;
const updateCoursesInGroupHandler = require('./admin/update-courses-in-group').handler;
const assignGroupToDepartmentHandler = require('./admin/assign-group-to-department').handler;

// Course Materials Management
const uploadCourseMaterialHandler = require('./admin/upload-course-material').handler;
const deleteCourseMaterialHandler = require('./admin/delete-course-material').handler;

// Leaderboard Settings
const getLeaderboardSettingsHandler = require('./admin/get-leaderboard-settings').handler;
const saveLeaderboardSettingsHandler = require('./admin/save-leaderboard-settings').handler;

// Simulation Results
const getSimulationResultsHandler = require('./admin/get-simulation-results').handler;

// User Management
const getAllUsersHandler = require('./admin/get-all-users').handler;
const assignCourseToUserHandler = require('./admin/assign-course-to-user').handler;

// Other
const textToSpeechHandler = require('./admin/text-to-speech').handler;


const actionMap = {
    // Course and Content Management
    'get_courses_admin': getCoursesHandler,
    'get_course_details': getCourseDetailsHandler,
    'upload_and_process': uploadAndProcessHandler,
    'generate_content': generateContentHandler,
    'publish_course': publishCourseHandler,
    'delete_course': deleteCourseHandler,

    // Course Group Management
    'get_course_groups': getCourseGroupsHandler,
    'create_course_group': createCourseGroupHandler,
    'update_course_group': updateCourseGroupHandler,
    'delete_course_group': deleteCourseGroupHandler,
    'get_group_details': getGroupDetailsHandler,
    'update_courses_in_group': updateCoursesInGroupHandler,
    'assign_group_to_department': assignGroupToDepartmentHandler,

    // Course Materials Management
    'upload_course_material': uploadCourseMaterialHandler,
    'delete_course_material': deleteCourseMaterialHandler,

    // Leaderboard Settings
    'get_leaderboard_settings': getLeaderboardSettingsHandler,
    'save_leaderboard_settings': saveLeaderboardSettingsHandler,

    // Simulation Results
    'get_simulation_results': getSimulationResultsHandler,

    // User Management
    'get_all_users': getAllUsersHandler,
    'assign_course_to_user': assignCourseToUserHandler,

    // Other
    'text_to_speech': textToSpeechHandler,
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const payload = JSON.parse(event.body);
        const { action } = payload;

        if (!action || !actionMap[action]) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) };
        }

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

        // The original event, which contains the vital Authorization header,
        // is passed directly to the sub-handler.
        // The sub-handler is responsible for creating its own user-scoped Supabase client
        // and for relying on RLS for authorization.
        // This router's only job is to validate the user token and route the request.
        return await actionMap[action](event);

    } catch (error) {
        console.error('Error in admin router:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred.' }) };
    }
};

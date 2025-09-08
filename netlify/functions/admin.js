const { createClient } = require('@supabase/supabase-js');
const { ACTIONS } = require('../shared/constants');

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
    [ACTIONS.GET_COURSES_ADMIN]: getCoursesHandler,
    [ACTIONS.GET_COURSE_DETAILS]: getCourseDetailsHandler,
    [ACTIONS.UPLOAD_AND_PROCESS]: uploadAndProcessHandler,
    [ACTIONS.GENERATE_CONTENT]: generateContentHandler,
    [ACTIONS.PUBLISH_COURSE]: publishCourseHandler,
    [ACTIONS.DELETE_COURSE]: deleteCourseHandler,

    // Course Group Management
    [ACTIONS.GET_COURSE_GROUPS]: getCourseGroupsHandler,
    [ACTIONS.CREATE_COURSE_GROUP]: createCourseGroupHandler,
    [ACTIONS.UPDATE_COURSE_GROUP]: updateCourseGroupHandler,
    [ACTIONS.DELETE_COURSE_GROUP]: deleteCourseGroupHandler,
    [ACTIONS.GET_GROUP_DETAILS]: getGroupDetailsHandler,
    [ACTIONS.UPDATE_COURSES_IN_GROUP]: updateCoursesInGroupHandler,
    [ACTIONS.ASSIGN_GROUP_TO_DEPARTMENT]: assignGroupToDepartmentHandler,

    // Course Materials Management
    [ACTIONS.UPLOAD_COURSE_MATERIAL]: uploadCourseMaterialHandler,
    [ACTIONS.DELETE_COURSE_MATERIAL]: deleteCourseMaterialHandler,

    // Leaderboard Settings
    [ACTIONS.GET_LEADERBOARD_SETTINGS]: getLeaderboardSettingsHandler,
    [ACTIONS.SAVE_LEADERBOARD_SETTINGS]: saveLeaderboardSettingsHandler,

    // Simulation Results
    [ACTIONS.GET_SIMULATION_RESULTS]: getSimulationResultsHandler,

    // User Management
    [ACTIONS.GET_ALL_USERS]: getAllUsersHandler,
    [ACTIONS.ASSIGN_COURSE_TO_USER]: assignCourseToUserHandler,

    // Other
    [ACTIONS.TEXT_TO_SPEECH]: textToSpeechHandler,
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

const { createClient } = require('@supabase/supabase-js');
const { ACTIONS } = require('../../shared/constants');

// Statically import all handlers
const assignCourseToUserHandler = require('./admin/assign-course-to-user.js');
const assignGroupToDepartmentHandler = require('./admin/assign-group-to-department.js');
const createCourseGroupHandler = require('./admin/create-course-group.js');
const deleteCourseGroupHandler = require('./admin/delete-course-group.js');
const deleteCourseMaterialHandler = require('./admin/delete-course-material.js');
const deleteCourseHandler = require('./admin/delete-course.js');
const generateContentHandler = require('./admin/generate-content-background.js');
const getAllUsersHandler = require('./admin/get-all-users.js');
const getCourseDetailsHandler = require('./admin/get-course-details.js');
const getCourseGroupsHandler = require('./admin/get-course-groups.js');
const getCoursesAdminHandler = require('./admin/get-courses.js');
const getGroupDetailsHandler = require('./admin/get-group-details.js');
const getLeaderboardSettingsHandler = require('./admin/get-leaderboard-settings.js');
const getSimulationResultsHandler = require('./admin/get-simulation-results.js');
const publishCourseHandler = require('./admin/publish-course.js');
const saveLeaderboardSettingsHandler = require('./admin/save-leaderboard-settings.js');
const textToSpeechHandler = require('./admin/text-to-speech.js');
const updateCourseGroupHandler = require('./admin/update-course-group.js');
const updateCoursesInGroupHandler = require('./admin/update-courses-in-group.js');
const uploadAndProcessHandler = require('./admin/upload-and-process-background.js');
const uploadCourseMaterialHandler = require('./admin/upload-course-material.js');

// Create the map of action -> handler function
const actionHandlers = {
    // Course and Content Management
    [ACTIONS.GET_COURSES_ADMIN]: getCoursesAdminHandler.handler,
    [ACTIONS.GET_COURSE_DETAILS]: getCourseDetailsHandler.handler,
    [ACTIONS.UPLOAD_AND_PROCESS]: uploadAndProcessHandler.handler,
    [ACTIONS.GENERATE_CONTENT]: generateContentHandler.handler,
    [ACTIONS.PUBLISH_COURSE]: publishCourseHandler.handler,
    [ACTIONS.DELETE_COURSE]: deleteCourseHandler.handler,

    // Course Group Management
    [ACTIONS.GET_COURSE_GROUPS]: getCourseGroupsHandler.handler,
    [ACTIONS.CREATE_COURSE_GROUP]: createCourseGroupHandler.handler,
    [ACTIONS.UPDATE_COURSE_GROUP]: updateCourseGroupHandler.handler,
    [ACTIONS.DELETE_COURSE_GROUP]: deleteCourseGroupHandler.handler,
    [ACTIONS.GET_GROUP_DETAILS]: getGroupDetailsHandler.handler,
    [ACTIONS.UPDATE_COURSES_IN_GROUP]: updateCoursesInGroupHandler.handler,
    [ACTIONS.ASSIGN_GROUP_TO_DEPARTMENT]: assignGroupToDepartmentHandler.handler,

    // Course Materials Management
    [ACTIONS.UPLOAD_COURSE_MATERIAL]: uploadCourseMaterialHandler.handler,
    [ACTIONS.DELETE_COURSE_MATERIAL]: deleteCourseMaterialHandler.handler,

    // Leaderboard Settings
    [ACTIONS.GET_LEADERBOARD_SETTINGS]: getLeaderboardSettingsHandler.handler,
    [ACTIONS.SAVE_LEADERBOARD_SETTINGS]: saveLeaderboardSettingsHandler.handler,

    // Simulation Results
    [ACTIONS.GET_SIMULATION_RESULTS]: getSimulationResultsHandler.handler,

    // User Management
    [ACTIONS.GET_ALL_USERS]: getAllUsersHandler.handler,
    [ACTIONS.ASSIGN_COURSE_TO_USER]: assignCourseToUserHandler.handler,

    // Other
    [ACTIONS.TEXT_TO_SPEECH]: textToSpeechHandler.handler,
};

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
    const handler = actionHandlers[action];

    if (!action || !handler) {
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

        // The original event, which contains the vital Authorization header,
        // is passed directly to the sub-handler.
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

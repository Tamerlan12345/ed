const { ACTIONS } = require('../../../shared/constants');

const actionHandlers = {
    // Course and Content Management
    [ACTIONS.GET_COURSES_ADMIN]: './admin/get-courses',
    [ACTIONS.GET_COURSE_DETAILS]: './admin/get-course-details',
    [ACTIONS.UPLOAD_AND_PROCESS]: './admin/upload-and-process-background',
    [ACTIONS.GENERATE_CONTENT]: './admin/generate-content-background',
    [ACTIONS.PUBLISH_COURSE]: './admin/publish-course',
    [ACTIONS.DELETE_COURSE]: './admin/delete-course',

    // Course Group Management
    [ACTIONS.GET_COURSE_GROUPS]: './admin/get-course-groups',
    [ACTIONS.CREATE_COURSE_GROUP]: './admin/create-course-group',
    [ACTIONS.UPDATE_COURSE_GROUP]: './admin/update-course-group',
    [ACTIONS.DELETE_COURSE_GROUP]: './admin/delete-course-group',
    [ACTIONS.GET_GROUP_DETAILS]: './admin/get-group-details',
    [ACTIONS.UPDATE_COURSES_IN_GROUP]: './admin/update-courses-in-group',
    [ACTIONS.ASSIGN_GROUP_TO_DEPARTMENT]: './admin/assign-group-to-department',

    // Course Materials Management
    [ACTIONS.UPLOAD_COURSE_MATERIAL]: './admin/upload-course-material',
    [ACTIONS.DELETE_COURSE_MATERIAL]: './admin/delete-course-material',

    // Leaderboard Settings
    [ACTIONS.GET_LEADERBOARD_SETTINGS]: './admin/get-leaderboard-settings',
    [ACTIONS.SAVE_LEADERBOARD_SETTINGS]: './admin/save-leaderboard-settings',

    // Simulation Results
    [ACTIONS.GET_SIMULATION_RESULTS]: './admin/get-simulation-results',

    // User Management
    [ACTIONS.GET_ALL_USERS]: './admin/get-all-users',
    [ACTIONS.ASSIGN_COURSE_TO_USER]: './admin/assign-course-to-user',

    // Other
    [ACTIONS.TEXT_TO_SPEECH]: './admin/text-to-speech',
};

module.exports = actionHandlers;

// This file is designed to be used in both Node.js (server-side) and in the browser (client-side).

const ACTIONS = {
    // Course Actions
    CREATE_COURSE: 'create_course',
    GET_COURSES_ADMIN: 'get_courses_admin',
    GET_COURSE_DETAILS: 'get_course_details',
    SAVE_COURSE_DRAFT: 'save_course_draft',
    PUBLISH_COURSE: 'publish_course',
    DELETE_COURSE: 'delete_course',

    // Content Generation
    UPLOAD_AND_PROCESS: 'upload_and_process',
    PROCESS_PRESENTATION: 'process_presentation',
    PROCESS_PPTX_PRESENTATION: 'process_pptx_presentation',
    GENERATE_CONTENT: 'generate_content',
    GENERATE_SUMMARY: 'generate_summary',

    // Group Actions
    GET_COURSE_GROUPS: 'get_course_groups',
    CREATE_COURSE_GROUP: 'create_course_group',
    UPDATE_COURSE_GROUP: 'update_course_group',
    DELETE_COURSE_GROUP: 'delete_course_group',
    GET_GROUP_DETAILS: 'get_group_details',
    UPDATE_COURSES_IN_GROUP: 'update_courses_in_group',

    // User & Department Actions
    GET_ALL_USERS: 'get_all_users',
    GET_DEPARTMENTS: 'get_departments',
    ASSIGN_GROUP_TO_DEPARTMENT: 'assign_group_to_department',
    ASSIGN_COURSE_TO_USER: 'assign_course_to_user',

    // Material Actions
    ADD_COURSE_MATERIAL: 'add_course_material', // ИЗМЕНЕНО: Раньше было UPLOAD_COURSE_MATERIAL
    DELETE_COURSE_MATERIAL: 'delete_course_material',

    // Settings & Results
    GET_LEADERBOARD_SETTINGS: 'get_leaderboard_settings',
    SAVE_LEADERBOARD_SETTINGS: 'save_leaderboard_settings',
    GET_SIMULATION_RESULTS: 'get_simulation_results',

    // Misc Actions
    TEXT_TO_SPEECH: 'text_to_speech',

    // Meeting Actions
    CREATE_MEETING: 'create_meeting',
    DELETE_MEETING: 'delete_meeting',
    GET_ADMIN_MEETINGS: 'get_admin_meetings',
};

// Check if we are in a Node.js environment
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { ACTIONS };
}
// Otherwise, assume it's a browser environment and attach to the window object
else if (typeof window !== 'undefined') {
    window.ACTIONS = ACTIONS;
}

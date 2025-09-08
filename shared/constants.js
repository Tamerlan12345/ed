const ACTIONS = {
    GET_COURSES_ADMIN: 'get_courses_admin',
    GET_COURSE_DETAILS: 'get_course_details',
    UPLOAD_AND_PROCESS: 'upload_and_process',
    GENERATE_CONTENT: 'generate_content',
    PUBLISH_COURSE: 'publish_course',
    DELETE_COURSE: 'delete_course',
    GET_COURSE_GROUPS: 'get_course_groups',
    CREATE_COURSE_GROUP: 'create_course_group',
    UPDATE_COURSE_GROUP: 'update_course_group',
    DELETE_COURSE_GROUP: 'delete_course_group',
    GET_GROUP_DETAILS: 'get_group_details',
    UPDATE_COURSES_IN_GROUP: 'update_courses_in_group',
    ASSIGN_GROUP_TO_DEPARTMENT: 'assign_group_to_department',
    UPLOAD_COURSE_MATERIAL: 'upload_course_material',
    DELETE_COURSE_MATERIAL: 'delete_course_material',
    GET_LEADERBOARD_SETTINGS: 'get_leaderboard_settings',
    SAVE_LEADERBOARD_SETTINGS: 'save_leaderboard_settings',
    GET_SIMULATION_RESULTS: 'get_simulation_results',
    GET_ALL_USERS: 'get_all_users',
    ASSIGN_COURSE_TO_USER: 'assign_course_to_user',
    TEXT_TO_SPEECH: 'text_to_speech',
};

// For use in Netlify functions (Node.js environment)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { ACTIONS };
}

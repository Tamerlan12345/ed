const { z } = require('zod');

const ACTIONS = {
    CREATE_COURSE: 'CREATE_COURSE',
    GET_COURSES_ADMIN: 'GET_COURSES_ADMIN',
    GET_ALL_USERS: 'GET_ALL_USERS',
    GET_DEPARTMENTS: 'GET_DEPARTMENTS',
    GET_COURSE_DETAILS: 'GET_COURSE_DETAILS',
    SAVE_COURSE_DRAFT: 'SAVE_COURSE_DRAFT',
    PUBLISH_COURSE: 'PUBLISH_COURSE',
    DELETE_COURSE: 'DELETE_COURSE',
    UPLOAD_AND_PROCESS: 'UPLOAD_AND_PROCESS',
    PROCESS_PRESENTATION: 'PROCESS_PRESENTATION',
    GENERATE_CONTENT: 'GENERATE_CONTENT',
    GET_COURSE_GROUPS: 'GET_COURSE_GROUPS',
    CREATE_COURSE_GROUP: 'CREATE_COURSE_GROUP',
    UPDATE_COURSE_GROUP: 'UPDATE_COURSE_GROUP',
    DELETE_COURSE_GROUP: 'DELETE_COURSE_GROUP',
    GET_GROUP_DETAILS: 'GET_GROUP_DETAILS',
    UPDATE_COURSES_IN_GROUP: 'UPDATE_COURSES_IN_GROUP',
    ASSIGN_GROUP_TO_DEPARTMENT: 'ASSIGN_GROUP_TO_DEPARTMENT',
    DELETE_COURSE_MATERIAL: 'DELETE_COURSE_MATERIAL',
    SAVE_LEADERBOARD_SETTINGS: 'SAVE_LEADERBOARD_SETTINGS',
    ASSIGN_COURSE_TO_USER: 'ASSIGN_COURSE_TO_USER',
    TEXT_TO_SPEECH: 'TEXT_TO_SPEECH',
    GET_SIMULATION_RESULTS: 'GET_SIMULATION_RESULTS',
    GET_LEADERBOARD_SETTINGS: 'GET_LEADERBOARD_SETTINGS',
    ADD_COURSE_MATERIAL: 'ADD_COURSE_MATERIAL',
};

const schemas = {
    [ACTIONS.CREATE_COURSE]: z.object({
        title: z.string().min(1, 'Title is required'),
        deadline_days: z.number().int().positive().optional().nullable(),
    }),
    [ACTIONS.GET_COURSE_DETAILS]: z.object({
        course_id: z.string().uuid('A valid course_id is required.'),
    }),
    [ACTIONS.SAVE_COURSE_DRAFT]: z.object({
        course_id: z.string().uuid(),
        draft_data: z.object({}).passthrough(),
    }),
    [ACTIONS.PUBLISH_COURSE]: z.object({
        course_id: z.string().uuid(),
        title: z.string().min(1),
        description: z.string().optional(),
        content: z.object({}).passthrough(),
        is_visible: z.boolean(),
        deadline_days: z.number().int().positive().optional().nullable(),
    }),
    [ACTIONS.DELETE_COURSE]: z.object({
        course_id: z.string().uuid(),
    }),
    [ACTIONS.UPLOAD_AND_PROCESS]: z.object({
        course_id: z.string().uuid(),
        file_name: z.string().min(1),
        file_data: z.string().min(1),
    }),
    [ACTIONS.PROCESS_PRESENTATION]: z.object({
        course_id: z.string().uuid(),
        presentation_url: z.string().url(),
    }),
    [ACTIONS.GENERATE_CONTENT]: z.object({
        course_id: z.string().uuid(),
        custom_prompt: z.string().optional(),
    }),
    [ACTIONS.CREATE_COURSE_GROUP]: z.object({
        group_name: z.string().min(1, 'Group name is required.'),
        is_for_new_employees: z.boolean().optional(),
        start_date: z.string().datetime().optional().nullable(),
        recurrence_period: z.string().optional().nullable(),
        enforce_order: z.boolean().optional(),
        deadline_days: z.number().int().positive().optional().nullable(),
        is_visible: z.boolean().optional(),
    }),
    [ACTIONS.UPDATE_COURSE_GROUP]: z.object({
        group_id: z.string().uuid(),
        group_name: z.string().min(1),
        is_for_new_employees: z.boolean().optional(),
        start_date: z.string().datetime().optional().nullable(),
        recurrence_period: z.string().optional().nullable(),
        enforce_order: z.boolean().optional(),
        deadline_days: z.number().int().positive().optional().nullable(),
        is_visible: z.boolean().optional(),
    }),
    [ACTIONS.DELETE_COURSE_GROUP]: z.object({
        group_id: z.string().uuid(),
    }),
    [ACTIONS.GET_GROUP_DETAILS]: z.object({
        group_id: z.string().uuid(),
    }),
    [ACTIONS.UPDATE_COURSES_IN_GROUP]: z.object({
        group_id: z.string().uuid(),
        course_ids: z.array(z.string().uuid()),
    }),
    [ACTIONS.ASSIGN_GROUP_TO_DEPARTMENT]: z.object({
        group_id: z.string().uuid(),
        department: z.string().min(1),
    }),
    [ACTIONS.ADD_COURSE_MATERIAL]: z.object({
        course_id: z.string().uuid(),
        file_name: z.string().min(1),
        file_url: z.string().url(),
    }),
    [ACTIONS.DELETE_COURSE_MATERIAL]: z.object({
        material_id: z.string().uuid(),
    }),
    [ACTIONS.SAVE_LEADERBOARD_SETTINGS]: z.object({
        metrics: z.object({
            courses_completed: z.boolean().optional(),
            time_spent: z.boolean().optional(),
            avg_score: z.boolean().optional(),
        }).passthrough(),
    }),
    [ACTIONS.ASSIGN_COURSE_TO_USER]: z.object({
        user_email: z.string().email(),
        course_id: z.string().uuid(),
    }),
    [ACTIONS.TEXT_TO_SPEECH]: z.object({
        text: z.string().min(1),
        course_id: z.string().uuid(),
    }),
    // Schemas for actions that don't require payload validation
    [ACTIONS.GET_COURSES_ADMIN]: z.object({}),
    [ACTIONS.GET_ALL_USERS]: z.object({}),
    [ACTIONS.GET_DEPARTMENTS]: z.object({}),
    [ACTIONS.GET_COURSE_GROUPS]: z.object({}),
    [ACTIONS.GET_SIMULATION_RESULTS]: z.object({}),
    [ACTIONS.GET_LEADERBOARD_SETTINGS]: z.object({}),
};

module.exports = { adminActionSchema: z.discriminatedUnion('action', [
    ...Object.entries(schemas).map(([action, schema]) =>
        z.object({
            action: z.literal(action),
        }).merge(schema)
    )
])};
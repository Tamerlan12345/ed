const { z } = require('zod');

const getCourseContentSchema = z.object({
    course_id: z.string().uuid('A valid course_id is required.'),
    force_regenerate: z.boolean().optional(),
});

const getJobStatusSchema = z.object({
    jobId: z.string().uuid('A valid jobId is required.'),
});

const assignCourseSchema = z.object({
    course_id: z.string().uuid('A valid course_id is required.'),
});

const saveTestResultSchema = z.object({
    course_id: z.string().uuid(),
    score: z.number().int().min(0),
    total_questions: z.number().int().positive(),
    percentage: z.number().min(0).max(100),
    time_spent_seconds: z.number().int().min(0),
});

const askAssistantSchema = z.object({
    course_id: z.string().uuid(),
    question: z.string().min(1, 'Question cannot be empty.'),
});

const dialogueSimulatorSchema = z.object({
    action: z.enum(['start', 'chat', 'evaluate']),
    disposition: z.string().optional(),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string(),
    })).optional(),
    scenario: z.string().optional(),
});

const updateTimeSpentSchema = z.object({
    course_id: z.string().uuid(),
    time_spent_seconds: z.number().int().positive(),
});

const markNotificationsAsReadSchema = z.object({
    notification_ids: z.array(z.string().uuid()).min(1),
});

const textToSpeechUserSchema = z.object({
    text: z.string().min(1, 'Text cannot be empty.'),
});


// Schemas for endpoints that do not require a request body
const getLeaderboardSchema = z.object({});
const getCoursesSchema = z.object({});
const getNotificationsSchema = z.object({});
const getCourseCatalogSchema = z.object({});


module.exports = {
    getCourseContentSchema,
    getJobStatusSchema,
    getLeaderboardSchema,
    getCoursesSchema,
    assignCourseSchema,
    saveTestResultSchema,
    getNotificationsSchema,
    getCourseCatalogSchema,
    askAssistantSchema,
    dialogueSimulatorSchema,
    updateTimeSpentSchema,
    markNotificationsAsReadSchema,
    textToSpeechUserSchema,
};
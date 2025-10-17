const express = require('express');
const adminAuthMiddleware = require('../middleware/adminAuth');
const userAuthMiddleware = require('../middleware/userAuth');
const { handleAdminAction } = require('../controllers/adminController');
const { getDetailedReport } = require('../controllers/reportController');
const userController = require('../controllers/userController');
const { validate } = require('../middleware/validationMiddleware');
const userSchemas = require('../schemas/userSchema');

const apiRouter = express.Router();

// --- Admin Routes ---
apiRouter.post('/admin', adminAuthMiddleware, handleAdminAction);
apiRouter.post('/getDetailedReport', adminAuthMiddleware, getDetailedReport);

// --- Public Routes (No Auth Required) ---
apiRouter.get('/config', (req, res) => {
    res.status(200).json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    });
});

// --- User-facing Authenticated Routes ---
apiRouter.use(userAuthMiddleware);

apiRouter.post('/getCourseContent', validate(userSchemas.getCourseContentSchema), userController.getCourseContent);
apiRouter.post('/get-job-status', validate(userSchemas.getJobStatusSchema), userController.getJobStatus);
apiRouter.post('/get-leaderboard', validate(userSchemas.getLeaderboardSchema), userController.getLeaderboard);
apiRouter.post('/getCourses', validate(userSchemas.getCoursesSchema), userController.getCourses);
apiRouter.post('/assign-course', validate(userSchemas.assignCourseSchema), userController.assignCourse);
apiRouter.post('/saveTestResult', validate(userSchemas.saveTestResultSchema), userController.saveTestResult);
apiRouter.post('/getNotifications', validate(userSchemas.getNotificationsSchema), userController.getNotifications);
apiRouter.post('/getCourseCatalog', validate(userSchemas.getCourseCatalogSchema), userController.getCourseCatalog);
apiRouter.post('/askAssistant', validate(userSchemas.askAssistantSchema), userController.askAssistant);
apiRouter.post('/dialogueSimulator', validate(userSchemas.dialogueSimulatorSchema), userController.dialogueSimulator);
apiRouter.post('/update-time-spent', validate(userSchemas.updateTimeSpentSchema), userController.updateTimeSpent);
apiRouter.post('/markNotificationsAsRead', validate(userSchemas.markNotificationsAsReadSchema), userController.markNotificationsAsRead);
apiRouter.post('/text-to-speech-user', validate(userSchemas.textToSpeechUserSchema), userController.textToSpeechUser);

module.exports = apiRouter;

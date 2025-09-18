const express = require('express');
const adminAuthMiddleware = require('../middleware/adminAuth');
const userAuthMiddleware = require('../middleware/userAuth'); // We will create this
const { handleAdminAction } = require('../controllers/adminController');
const { getDetailedReport } = require('../controllers/reportController');
const userController = require('../controllers/userController');

const apiRouter = express.Router();

// --- Admin Routes ---
// This single endpoint handles all admin actions, protected by the admin middleware.
apiRouter.post('/admin', adminAuthMiddleware, handleAdminAction);
// The detailed report also requires admin privileges.
apiRouter.post('/getDetailedReport', adminAuthMiddleware, getDetailedReport);


// --- User-facing Authenticated Routes ---
// All routes below this middleware will require a valid user token.
// The middleware will attach `req.supabase` and `req.user` for the controllers to use.
apiRouter.use(userAuthMiddleware);

apiRouter.post('/getCourseContent', userController.getCourseContent);
apiRouter.post('/get-job-status', userController.getJobStatus); // Should this be admin only? For now, user-facing.
apiRouter.post('/get-leaderboard', userController.getLeaderboard);
apiRouter.post('/getCourses', userController.getCourses);
apiRouter.post('/assign-course', userController.assignCourse);
apiRouter.post('/saveTestResult', userController.saveTestResult);
apiRouter.post('/getNotifications', userController.getNotifications);
apiRouter.post('/getCourseCatalog', userController.getCourseCatalog);
apiRouter.post('/askAssistant', userController.askAssistant);
apiRouter.post('/dialogueSimulator', userController.dialogueSimulator);
apiRouter.post('/update-time-spent', userController.updateTimeSpent);
apiRouter.post('/markNotificationsAsRead', userController.markNotificationsAsRead);
apiRouter.post('/text-to-speech-user', userController.textToSpeechUser);


module.exports = apiRouter;

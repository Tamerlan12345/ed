// --- CONFIGURATION AND SETUP ---
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const apiRouter = require('./routes/api'); // Import the refactored router

// --- INITIALIZE EXPRESS APP ---
const app = express();
const PORT = process.env.PORT || 3002;

// --- TRUST PROXY ---
// This is necessary for express-rate-limit to work correctly behind a reverse proxy.
app.set('trust proxy', 1);

// --- SECURITY MIDDLEWARES ---
app.use(helmet({
    contentSecurityPolicy: false, // Adjust this policy based on your frontend needs
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // БЫЛО 100, СТАЛО 1000. Это решит проблему с ошибкой 429.
    message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api', limiter);

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}));

// --- GLOBAL MIDDLEWARES ---
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' })); // For parsing application/json
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '..'))); // Serve static files like index.html

// --- HEALTH CHECK ---
app.get('/health', (req, res) => res.status(200).send('OK'));

// --- API ROUTING ---
// All API-related routes are now handled in the /routes/api.js module.
app.use('/api', apiRouter);

// --- FRONTEND ROUTING ---
// These routes ensure that the frontend single-page applications (admin and user) are served correctly.
// They handle direct navigation and page reloads.

// Serve the admin panel for any route starting with /admin
app.get('/admin*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// For any other route, serve the main user-facing application.
// This should be the last route.
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// --- GLOBAL ERROR HANDLING ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: 'error',
        message: 'Something went wrong!'
    });
});

// --- SERVER STARTUP ---
// This check ensures the server only starts when the script is executed directly (not when imported).
if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`Server is running and listening on port ${PORT}`);
    });

    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        server.close(() => {
            console.log('HTTP server closed');
        });
    });
}

// --- EXPORTS FOR TESTING ---
// Export the app for use in testing environments (e.g., Supertest).
module.exports = { app };

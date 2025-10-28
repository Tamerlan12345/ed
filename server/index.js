// --- CONFIGURATION AND SETUP ---
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api'); // Import the refactored router

// --- INITIALIZE EXPRESS APP ---
const app = express();
const PORT = process.env.PORT || 3002;

// --- GLOBAL MIDDLEWARES ---
app.use(cors());
app.use(express.json({ limit: '10mb' })); // For parsing application/json

// --- SECURITY MIDDLEWARE (CSP) ---
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com 'unsafe-eval'; " +
        "style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
        "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com;"
    );
    next();
});

app.use(express.static(path.join(__dirname, '..'))); // Serve static files like index.html

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

// --- SERVER STARTUP ---
// This check ensures the server only starts when the script is executed directly (not when imported).
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running and listening on port ${PORT}`);
    });
}

// --- EXPORTS FOR TESTING ---
// Export the app for use in testing environments (e.g., Supertest).
module.exports = { app };

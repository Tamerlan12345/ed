const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- AUTHENTICATION SETUP ---

// Path to the service account key file
const KEY_FILE_PATH = path.join(__dirname, '..', '..', 'google-service-account.json');

// Scopes required for Google Drive API access
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// Create a new JWT client using the key file
const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

// --- GOOGLE DRIVE SERVICE ---

/**
 * Downloads a file from Google Drive to a temporary local path.
 * @param {string} fileId The ID of the file to download from Google Drive.
 * @returns {Promise<string>} A promise that resolves with the local path to the downloaded file.
 */
async function downloadFile(fileId) {
    const drive = google.drive({ version: 'v3', auth });

    // Create a temporary file path
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `drive-${fileId}-${Date.now()}`);
    const dest = fs.createWriteStream(tempFilePath);

    return new Promise(async (resolve, reject) => {
        try {
            const response = await drive.files.get(
                { fileId: fileId, alt: 'media' },
                { responseType: 'stream' }
            );

            response.data
                .on('end', () => {
                    console.log(`Successfully downloaded file ${fileId} to ${tempFilePath}`);
                    resolve(tempFilePath);
                })
                .on('error', err => {
                    console.error(`Error downloading file ${fileId}.`, err);
                    fs.unlink(tempFilePath, () => reject(err)); // Clean up the temp file on error
                })
                .pipe(dest);

        } catch (error) {
            console.error('Error in googleDriveService.downloadFile:', error.message);
            // Check if the error is a 404 Not Found
            if (error.code === 404) {
                return reject(new Error(`File not found: The file with ID "${fileId}" does not exist or you do not have permission to access it.`));
            }
            reject(error);
        }
    });
}

module.exports = {
    downloadFile,
};

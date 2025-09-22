const fs = require('fs');
const googleDriveService = require('../services/googleDriveService');

/**
 * Handles the request to proxy a file from Google Drive.
 * It downloads the file, sends it to the client, and then cleans up the temporary file.
 * @param {object} req The Express request object.
 * @param {object} res The Express response object.
 */
async function proxyAndCleanupFile(req, res) {
    const { fileId } = req.params;

    if (!fileId) {
        return res.status(400).json({ error: 'File ID is required.' });
    }

    let tempFilePath = null;

    try {
        // Step 1: Download the file from Google Drive to a temporary path
        tempFilePath = await googleDriveService.downloadFile(fileId);

        // Step 2: Send the file to the client.
        // The file name for the user is not set here, but can be added with Content-Disposition header if needed.
        res.sendFile(tempFilePath, (err) => {
            // Step 3: Cleanup the temporary file after it has been sent.
            if (err) {
                console.error('Error sending file to client:', err);
                // If an error occurs during sending, we still try to clean up.
            } else {
                console.log('File sent successfully. Cleaning up temporary file.');
            }

            // Cleanup logic
            fs.unlink(tempFilePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('Error deleting temporary file:', tempFilePath, unlinkErr);
                } else {
                    console.log('Temporary file deleted successfully:', tempFilePath);
                }
            });
        });

    } catch (error) {
        console.error(`Error processing file proxy for fileId ${fileId}:`, error.message);

        // Ensure cleanup happens even if download fails and a temp file was somehow created
        if (tempFilePath) {
            fs.unlink(tempFilePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error during cleanup after failure:', unlinkErr);
            });
        }

        if (error.message.includes('File not found')) {
            return res.status(404).json({ error: error.message });
        }

        return res.status(500).json({ error: 'Failed to proxy file from Google Drive.' });
    }
}

module.exports = {
    proxyAndCleanupFile,
};

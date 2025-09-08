const createError = (statusCode, message, details = null) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    if (details) {
        error.details = details;
    }
    return error;
};

const handleError = (error, context = 'General') => {
    // Determine status code and message based on the error object
    const statusCode = error.statusCode || 500;
    // If it's a 500-level error, use a generic message for the client
    const message = (statusCode < 500) ? error.message : 'An internal server error occurred. Please try again later.';
    const details = error.details || null;

    // Log the detailed, original error for debugging
    console.error(`Error in ${context}:`, {
        originalMessage: error.message,
        details: details,
        statusCode: statusCode,
        stack: error.stack,
    });

    const errorResponse = { error: message };
    if (details) {
        errorResponse.details = details;
    }

    return {
        statusCode,
        body: JSON.stringify(errorResponse),
    };
};

module.exports = { handleError, createError };

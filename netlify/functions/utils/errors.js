const handleError = (error, context) => {
    console.error(`Error in ${context}:`, {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        stack: error.stack,
    });

    return {
        statusCode: 500,
        body: JSON.stringify({ error: 'An internal server error occurred. Please try again later.' }),
    };
};

module.exports = { handleError };

const validate = (schema) => (req, res, next) => {
    try {
        // We are validating the entire body, which includes the 'action' and the payload.
        schema.parse(req.body);
        next();
    } catch (e) {
        // Format the Zod error to be more user-friendly
        const errorDetails = e.errors.reduce((acc, err) => {
            // The path array gives the nested location of the error
            const field = err.path.join('.');
            acc[field] = err.message;
            return acc;
        }, {});

        res.status(400).json({
            error: 'Validation failed',
            details: errorDetails,
        });
    }
};

module.exports = { validate };
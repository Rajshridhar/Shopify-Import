import { constants } from '../constants/response_code.js';

export const errorHandler = (err, req, res, next) => {
    const statusCode = res.statusCode ? res.statusCode : 500;
    switch (statusCode) {
        case constants.VALIDATION_ERROR:
            res.json({
                error: 'Validation Failed',
                message: err.message,
                // stackTrace: err.stack,
            });
            break;
        case constants.NOT_FOUND:
            res.json({
                error: 'Not Found',
                message: err.message,
                // stackTrace: err.stack,
            });
        case constants.UNAUTHORIZED:
            res.json({
                error: 'Unauthorized',
                message: err.message,
                // stackTrace: err.stack,
            });
        case constants.FORBIDDEN:
            res.json({
                error: 'Forbidden',
                message: err.message,
                // stackTrace: err.stack,
            });
        case constants.SERVER_ERROR:
            res.json({
                error: 'Server Error',
                message: err.message,
                // stackTrace: err.stack,
            });
        default:
            res.status(400).json({
                error: err.message,
            });
            break;
    }
};

import logger from '../utils/logger/index.js';
import _ from 'lodash';

export const validateAccess = (accessType = '') => {
    return (req, res, next) => {
        try {
            let accessList = req?.user?.accessList ?? null;
            if (accessList && _.isArray(accessList)) {
                if (!accessList.includes(accessType)) {
                    throw `${accessType}: Access denied!`;
                }
            }

            next();
        } catch (error) {
            let err =
                typeof error == 'object'
                    ? error?.toString() != '[object Object]'
                        ? error.toString()
                        : JSON.stringify(error)
                    : typeof error == 'string'
                      ? error
                      : `Error datatype ${typeof error}`;
            logger.log(
                'error',
                `
                [API SERVER: ACCESS ERROR] 
                User: ${JSON.stringify(req?.user ?? {})}
                AccessType: ${accessType}
            `
            );
            let errorMsg = typeof error == 'string' && error.includes('!') ? error : 'Access Error!';
            return res.status(401).json({ error: errorMsg });
        }
    };
};

export default validateAccess;

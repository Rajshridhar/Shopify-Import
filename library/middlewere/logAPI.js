import logger from '../utils/logger/index.js';

const logAPI = (req, res, next) => {
    try {
        logger.log(
            'info',
            JSON.stringify({
                user: req?.user ?? {},
                path: `${req?.baseUrl ?? ''}${req?.path ?? ''}`,
                url: req?.originalUrl ?? '',
                method: req?.method ?? {},
                headers: req?.headers ?? {},
                params: req?.params ?? {},
                query: req?.query ?? {},
                body: req?.body ?? {},
            })
        );
    } catch (err) {
        console.log('logAPI - error!');
    }
    next();
};

export default logAPI;

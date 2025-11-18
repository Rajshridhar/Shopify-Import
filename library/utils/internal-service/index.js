import logger from '../logger/index.js';
import catalogusAPI from './catalogusAPI.js';


// IMPORT - function for sending notification
export const sendNotification = async (data) => {
    try {
        const { client_id, users, jobResponse, type } = data;
        if (!client_id) throw new Error('Client ID is required!');
        if (!users) throw new Error('Users array is required!');
        if (!type) throw new Error('Type is required!');
        if (!jobResponse) throw new Error('Job response is required!');

        data.module = 'IMPORT';
        const response = await catalogusAPI.post('/notification/send-notification', data);
        logger.log('info', `[Shopify-API] Sent push notification successfully | ${JSON.stringify(data)}`);
        return response.data;
    } catch (error) {
        logger.log('error', `[Shopify-API] Error in sendNotification | ${JSON.stringify(error)}`);
        throw error;
    }
};

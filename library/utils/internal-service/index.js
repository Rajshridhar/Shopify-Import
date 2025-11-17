import logger from '../logger/index.js';
import catalogusAPI from './catalogusAPI.js';

export const getShopifyRawData = async (data) => {
    try {
        const shopifyRawData = await catalogusAPI.post(`/v1/product/get-marketplace-data`, data);
        const exportData = shopifyRawData?.data;
        if (!exportData) {
            throw new Error('Failed to get shopify raw data');
        }
        return exportData;
    } catch (error) {
        console.error('Error in getShopifyRawData', error);
        throw error;
    }
};

export const sendNotification = async (data) => {
    try {
        const { client_id, users, jobResponse, type } = data;
        if (!client_id) throw new Error('Client ID is required!');
        if (!users) throw new Error('Users array is required!');
        if (!type) throw new Error('Type is required!');
        if (!jobResponse) throw new Error('Job response is required!');

        data.module = 'SYNCHRONIZATION';
        const response = await catalogusAPI.post('/notification/send-notification', data);
        logger.log('info', `[Shopify-API] Sent push notification successfully | ${JSON.stringify(data)}`);
        return response.data;
    } catch (error) {
        logger.log('error', `[Shopify-API] Error in sendNotification | ${JSON.stringify(error)}`);
        throw error;
    }
};

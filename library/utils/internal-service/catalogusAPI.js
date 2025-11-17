import axios from 'axios';
import { getContext } from '../context.js';
import logger from '../logger/index.js';

// Create axios instance
const catalogusAPI = axios.create({
    baseURL: process.env.CATALOGUS_API_URL,
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
        service: 'shopify-api',
    },
});

// Request interceptor to add jobId & clientId to headers
catalogusAPI.interceptors.request.use((config) => {
    try {
        const context = getContext();
        if (context?.jobId) {
            config.headers.job_id = context.jobId;
        }
        if (context?.clientId) {
            config.headers.client_id = context.clientId;
        }

        return config;
    } catch (error) {
        logger.log('info', '[Shopify-API] (Rejecting request) Error in catalogusAPI request interceptor:', error);
        return Promise.reject(error);
    }
});

export default catalogusAPI;

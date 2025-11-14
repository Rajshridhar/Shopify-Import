import { Worker } from 'bullmq';
import logger from './library/utils/logger/index.js';
import { getUniqueQueueName } from './library/utils/general.js';
import {
    fetchAndDecryptClientMarketplaceConfig,
    getJobDetails,
    updateJob,
} from './library/utils/internal-service/databaseOperations.js';
import 'dotenv/config';
import { setContext } from './library/utils/context.js';
import { sendNotification } from './library/utils/internal-service/index.js';
import { sendEmail } from './library/collection/notification/email.js';
import { createOrUpdateListing } from './library/utils/shopify-helper/shopify.js';

const REDIS_CONFIG = {
    HOST: 'redis-12388.c305.ap-south-1-1.ec2.cloud.redislabs.com',
    PORT: 12388,
    PASSWORD: 'DFAmQox36zyHmNbhVgzDLvHEQ1v9MVh4',
};

const queueName = getUniqueQueueName('shopify-api'); // The worker will connect specifcally to SP API jobs queue

logger.log('info', `######## SHOPIFY API WORKER CONNECTED TO QUEUE NAME: ${queueName}`);

async function processJob(jobId) {
    console.log('JOB PROCESSING STARTED');
    let userEmail;
    let clientId;
    let subType;
    let productType;

    try {
        logger.log('info', `PROCESSING JOB ID: ${jobId}`);

        if (!jobId) {
            throw "Job can't be initiated without job ID!";
        }

        const jobData = await getJobDetails(jobId);
        userEmail = jobData?.user?.initiated_by ?? '';
        clientId = jobData?.config?.clientId ?? '';
        productType = jobData?.config?.productType ?? '';
        if (!clientId || !jobId) {
            throw new Error("Job can't be initiated without clientId or jobId!");
        }

        let jobType = jobData?.type ?? '';
        let jobStatus = jobData?.status ?? '';
        subType = jobData?.config?.type ?? '';
        let type = `${jobType}${subType ? `_${subType}` : ''}`;

        if (['RUNNING'].includes(jobStatus)) {
            return { error: `Job [${jobId}] already running!` };
        }

        // Get client marketplace config
        const clientMarketplaceConfig = await fetchAndDecryptClientMarketplaceConfig(clientId);
        if (!clientMarketplaceConfig || !clientMarketplaceConfig?.accessToken || !clientMarketplaceConfig?.shop) {
            throw new Error('Failed to get client marketplace config for clientId: ' + clientId);
        }

        // Create a session object with shop + access token
        const session = {
            shop: clientMarketplaceConfig.shop,
            accessToken: clientMarketplaceConfig.accessToken,
        };

        return await setContext({ jobId, clientId, session }, async () => {
            if (type) {
                let response = {};
                switch (type) {
                    case 'SYNCHRONIZATION_CREATE_LISTING':
                        response = await createOrUpdateListing(jobData, clientMarketplaceConfig);
                        break;
                    default:
                        throw new Error(`Handler not found for job type: ${type}!`);
                }
                if (response?.error) {
                    throw response.error;
                } else {
                    return response;
                }
            } else {
                throw 'Unrecognized job type!';
            }
        });
    } catch (error) {
        let errMsg = '';
        if (error?.isAxiosError && error?.response) {
            errMsg = `AxiosError: ${error.message} | Status: ${error.response.status} | Data: ${JSON.stringify(error.response.data)}`;
        } else if (typeof error === 'object') {
            errMsg = error?.toString() !== '[object Object]' ? error.toString() : JSON.stringify(error);
        } else if (typeof error === 'string') {
            errMsg = error;
        } else {
            errMsg = `Error datatype ${typeof error}`;
        }
        logger.log('error', `[JOB: ${jobId}] ${errMsg}`);
        let jobResDataNew = await updateJob(jobId, {
            status: 'FAILED',
            remarks: { error: errMsg },
        });

        await sendNotification({
            client_id: clientId,
            users: [userEmail],
            module: 'SYNCHRONIZATION',
            message: errMsg,
            jobResponse: {
                remarks: { error: errMsg },
                _id: jobId,
                channel: 'shopify',
                config: { type: subType },
                type: 'SYNC',
                productType,
            },
            type: 'ERROR',
        });
        await sendEmail({
            to: userEmail,
            subject: `SP API Worker Failed | ${jobId} | FAILED`,
            text: `
                Status : Failed
                Job details: ${JSON.stringify(errMsg)}
            `,
        });
        throw errMsg;
    }
}

const worker = new Worker(
    queueName,
    async (job) => {
        console.log('SHOPIFY-API WORKER STARTED');
        let data = job?.data ?? {};
        let jobId = data?._id ?? data?.jobId ?? data?.job_id ?? '';
        let jobName = job?.name ?? '';

        try {
            logger.log(
                'info',
                `JOB WORKER : ${jobName} | DATA : ${typeof data == 'object' ? JSON.stringify(data) : data}`
            );

            return await processJob(jobId);
        } catch (error) {
            logger.log('error', error);
            return { error: err };
        }
    },
    {
        connection: {
            host: REDIS_CONFIG['HOST'],
            port: REDIS_CONFIG['PORT'],
            password: REDIS_CONFIG['PASSWORD'],
        },
        concurrency: 12,
    }
);

// Listen to lifecycle events
worker.on('ready', () => logger.log('info', '✅ Worker is ready and connected to Redis.'));
worker.on('error', (error) => {
    let err =
        typeof error == 'object'
            ? error?.toString() != '[object Object]'
                ? error.toString()
                : JSON.stringify(error)
            : typeof error == 'string'
              ? error
              : `Error datatype ${typeof error}`;
    logger.log('error', `❌ Worker error : ${err}`);
});
worker.on('closed', () => logger.log('warn', '⚠️ Worker connection closed.'));

const redis = worker['connection'];
redis.on('connect', () => logger.log('info', '🔌 Redis (worker) client connected.'));
redis.on('ready', () => logger.log('info', '📡 Redis (worker) client ready.'));
redis.on('end', () => logger.log('warn', '🔌 Redis (worker) connection closed.'));
redis.on('error', (err) => logger.log('info', '[SP-API] 🚨 Redis (worker) error:', err));
redis.on('reconnecting', () => logger.log('info', '♻️ Redis (worker) reconnecting...'));

// The job can be run via CLI using command: node worker.js --run-job jobId
if (process.argv[2] === '--run-job') {
    const jobId = process.argv[3];
    if (!jobId) {
        console.error('Usage: node worker.js --run-job jobID');
        process.exit(1);
    }

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
        process.exit(1);
    });

    (async () => {
        try {
            const result = await processJob(jobId);
            process.exit(0);
        } catch (error) {
            console.error('Job failed:', error);
            process.exit(1);
        }
    })();
}

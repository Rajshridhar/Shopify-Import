import { getQueue } from '../../connections/redis.js';

export async function addJobToQueue(jobName, jobData, queueName = 'transformation_jobs') {
    try {
        let queueNameWithEnv = `${process.env.NODE_ENV}_${queueName}`;
        let queue = await getQueue(queueNameWithEnv);
        var resData = null;

        if (queue && !queue.error) {
            resData = await queue.add(jobName, jobData, {
                removeOnComplete: {
                    age: 24 * 3600, // keep up to 24 hour
                    count: 100, // keep up to 100 jobs
                },

                removeOnFail: {
                    age: 7 * 24 * 3600, // keep up to 7 days
                },
            });
        } else {
            throw 'Queue not found/failed to create!';
        }
        return resData;
    } catch (err) {
        console.log('ERR_FN: Redis: addJob', err);
        return { error: 'ERR_FN: Redis: addJob' };
    }
}

export async function removeJobFromQueue(jobId, queueName = 'transformation_jobs') {
    try {
        let queueNameWithEnv = `${process.env.NODE_ENV}_${queueName}`;
        let queue = await getQueue(queueNameWithEnv);
        var resData = null;

        if (queue && !queue.error) {
            resData = await queue.remove(jobId);
        } else {
            throw 'Queue not found/failed to create!';
        }

        return resData;
    } catch (err) {
        console.log('ERR_FN: Redis: removeJob', err);
        return { error: err };
    }
}

export async function updateStatusOfJobInQueue(jobId, status, queueName = 'transformation_jobs', result = null) {
    try {
        let queueNameWithEnv = `${process.env.NODE_ENV}_${queueName}`;
        let queue = await getQueue(queueNameWithEnv); // Replace with your queue retrieval logic
        let job = await queue.getJob(jobId); // Fetch the job by ID

        if (!job) {
            throw new Error(`Job with ID ${jobId} not found in queue ${queueNameWithEnv}`);
        }

        // Perform actions based on the status parameter
        switch (status.toLowerCase()) {
            case 'completed':
                await job.moveToCompleted(result || 'Manually marked as completed', true);
                return { success: true, message: `Job ${jobId} marked as completed.` };

            case 'failed':
                await job.moveToFailed({ message: result || 'Manually marked as failed' }, true);
                return { success: true, message: `Job ${jobId} marked as failed.` };

            case 'terminated':
                await job.discard();
                await job.moveToCompleted(result || 'Manually terminated', true);
                return { success: true, message: `Job ${jobId} terminated successfully.` };

            default:
                throw new Error(`Invalid status: ${status}. Allowed statuses are: completed, failed, terminated.`);
        }
    } catch (err) {
        console.error('ERR_FN: Redis: updateJobStatus', err);
        return { error: err?.message ?? err };
    }
}

export async function reInitiateJob(jobId, queueName = 'transformation_jobs') {
    try {
        let queueNameWithEnv = `${process.env.NODE_ENV}_${queueName}`;
        let queue = await getQueue(queueNameWithEnv); // Your queue retrieval logic
        let job = await queue.getJob(jobId);

        if (!job) {
            throw new Error(`Job with ID ${jobId} not found in queue ${queueNameWithEnv}`);
        }

        // Move the job back to active
        await job.moveToActive();
        return { success: true, message: `Job ${jobId} successfully re-initiated.` };
    } catch (err) {
        console.error('ERR_FN: Redis: re-initiateCompletedJob', err);
        return { error: err?.message ?? err };
    }
}

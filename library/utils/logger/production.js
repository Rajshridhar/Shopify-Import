// import os from "os";

import { createLogger, format, transports } from 'winston';
const { combine, timestamp, splat, simple } = format;

import { WinstonTransport as AxiomTransport } from '@axiomhq/axiom-node';
import SlackHook from 'winston-slack-webhook-transport';

// const machineId = os.hostname();
// const serviceName = process.env.SERVICE_NAME || "-UnSer-";

// const axiomTransport = new AxiomTransport({
//     dataset: 'nodeapi',
//     token: 'xaat-123866b0-2e1c-4212-9702-88c0c8057461',
//     orgId: 'catalogus-su19',
// })
const axiomTransport = new AxiomTransport({
    dataset: 'catalogus_apis',
    token: 'xaat-dc2e1fa4-efcb-496e-a520-e86031d8d7ec',
    orgId: 'catalogus-9rg7',
});

const slackTransport = new SlackHook({
    level: 'error',
    webhookUrl: process.env.SLACK_URL,
    formatter: (info) => {
        return {
            text: info.message, // Log message
        };
    },
});

export default function productionLogger() {
    try {
        return createLogger({
            level: 'debug',
            format: combine(splat(), simple()),
            transports: [axiomTransport, slackTransport],
            exceptionHandlers: [axiomTransport],
            rejectionHandlers: [axiomTransport],
        });
    } catch (err) {
        console.log(err);
    }
}

// import os from "os";

import { createLogger, format, transports } from 'winston';
const { combine, timestamp, splat, simple } = format;

// const machineId = os.hostname();
// const serviceName = process.env.SERVICE_NAME || "-UnSer-";

export default function devLogger() {
    // const myFormat = format.printf(({ level, message, timestamp }) => {
    //     return `${timestamp} ${level}: ${typeof message == "object" ? JSON.stringify(message) : message }`;
    // });

    return createLogger({
        level: 'debug',
        format: combine(
            timestamp({ format: 'HH:mm:ss' }),
            // myFormat
            splat(),
            simple()
        ),
        transports: [new transports.Console()],
    });
}

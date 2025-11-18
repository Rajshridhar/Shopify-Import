import _ from 'lodash';
import { bulkImportProducts } from './bulkImportProducts.js';
import { getClientData } from '../../utils/internal-service/databaseOperation.js';
import logger from '../../utils/logger/index.js';

export async function importProducts(jobData = {}) {

    console.log("JOB DATA: ", jobData);

    let jobConfig = jobData?.config ?? {};
    let channel = jobConfig?.channel ?? '';

    const clientId = jobConfig?.clientId ?? '';
    const clientData = await getClientData(clientId);
    jobData.clientData = clientData;

    try {
        if (channel == 'SHOPIFY') {
            bulkImportProducts(jobData);
            return { message: `Import started for channel: ${channel}` };
        } else {
            logger.log('error', `IMPORT PRODUCTS - Unsupported channel: ${channel}`);
        }
    } catch (err) {
        console.log('ERROR: ', err);
    }
}

import logger from '../logger/index.js';
import catalogusAPI from './catalogusAPI.js';
import { encrypt, decrypt } from '../encryption.js';

export const getClient = async (clientId) => {
    try {
        const client = await catalogusAPI.get(`/v1/client/${clientId}`);
        if (client.status === 200) {
            return client.data;
        } else {
            return { error: `Failed to get client for clientId: ${clientId}` };
        }
    } catch (error) {
        console.error('Error in getClient', error);
        throw error;
    }
};

export const getAttribute = async (clientId) => {
    try {
        const attribute = await catalogusAPI.get(`/v1/attribute?clientId=${clientId}`);
        if (attribute.status === 200) {
            return attribute.data;
        } else {
            return { error: `Failed to get attribute for clientId: ${clientId}` };
        }
    } catch (error) {
        console.error('Error in getAttribute', error);
        throw error;
    }
};

export const fetchAndDecryptClientMarketplaceConfig = async (clientId) => {
    try {
        if (!clientId) {
            throw new Error('Client ID is required');
        }

        const clientMarketplaceConfig = await catalogusAPI.get(
            `/v1/client/marketplace-config?clientId=${clientId}&marketplace=SHOPIFY`
        );
        const { config, client_config: clientConfig } = clientMarketplaceConfig.data;
        const { accessToken, shop } = config;

        if (clientMarketplaceConfig.status === 200) {
            if (!accessToken) {
                throw new Error(
                    'Missing required token data from clientMarketplaceConfig:' +
                        JSON.stringify(clientMarketplaceConfig.data)
                );
            }

            return { accessToken: decrypt(accessToken), shop, clientConfig };
        } else {
            throw new Error(`Failed to get marketplace config for clientId: ${clientId}`);
        }
    } catch (error) {
        console.error('Error in fetchAndDecryptClientMarketplaceConfig', error);
        throw error;
    }
};

export const getJobDetails = async (jobId) => {
    try {
        const jobDetails = await catalogusAPI.get(`/job/${jobId}`);
        if (jobDetails.status === 200) {
            return jobDetails.data;
        } else {
            throw new Error(`Failed to get job details for jobId: ${jobId}`);
        }
    } catch (error) {
        console.error('Error in getJobDetails', error);
        throw error;
    }
};

export const getProduct = async (filters) => {
    try {
        const products = await catalogusAPI.get(`/v1/product`, { params: filters });
        if (products.status === 200) {
            return products.data;
        } else {
            throw new Error(`Failed to get products filters: ${filters}`);
        }
    } catch (error) {
        console.error('Error in getProducts', error);
        throw error;
    }
};

export const updateJob = async (jobId, data) => {
    try {
        if (!jobId || !data) {
            throw new Error('Job ID and data are required');
        }
        const jobUpdateResult = await catalogusAPI.put(`/job/${jobId}`, data);
        if (jobUpdateResult.status === 200) {
            return jobUpdateResult.data;
        } else {
            throw new Error(`Failed to update job details for jobId: ${jobId}`);
        }
    } catch (error) {
        console.error('Error in updateJobDetails', error);
        throw error;
    }
};

/**
 * Store seller tokens and information
 * @param {Object} tokenData - Token and seller information
 * @returns {Promise<Object>} Storage result
 */
export async function encryptAndStoreSellerTokens(clientId, tokenData) {
    try {
        logger.log('info', '[Shopify-API] Encrypting and storing seller tokens', {
            clientId,
        });

        if (!clientId || !tokenData.shop || !tokenData.access_token || !tokenData.scope) {
            throw new Error('Failed to store seller tokens - Missing required token data:', tokenData);
        }

        // Encrypt sensitive data before storage
        const marketplaceConfig = {
            shop: tokenData.shop,
            accessToken: encrypt(tokenData.access_token),
            scope: tokenData.scope,
            encryptedSensitiveData: true, // Encrypting sensitive data and setting this flag to true is mandatory for storing client marketplace config
        };

        const result = await catalogusAPI.post(
            `/v1/client/marketplace-config?clientId=${clientId}&marketplace=SHOPIFY`,
            marketplaceConfig
        );

        if (result.status === 200) {
            logger.log('info', '[Shopify-API] Successfully encrypted and stored seller tokens');
            return { success: true };
        } else {
            throw new Error(`Failed to store seller tokens: ${result.data}`);
        }
    } catch (error) {
        logger.log('info', '[Shopify-API] Failed to store seller tokens', {
            error: error.message,
        });

        return {
            success: false,
            error: error.message,
        };
    }
}

export const bulkUpdateVariants = async (variantsUpdateData) => {
    try {
        if (!variantsUpdateData || Object.keys(variantsUpdateData).length === 0) {
            throw new Error('No variants provided to update');
        }

        const variantUpdateResult = await catalogusAPI.patch('/v1/product/bulk-product-variant-update/', {
            variantsUpdateData,
        });
        if (variantUpdateResult.status === 200) {
            logger.log('info', '[Shopify-API] Successfully updated data');
            return variantUpdateResult.data;
        } else {
            throw new Error(`Failed to update variants: ${variantUpdateResult.data}`);
        }
    } catch (error) {
        console.error('Error in bulkUpdateVariants', error);
        throw error;
    }
};

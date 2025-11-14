import dotenv from 'dotenv';
import { encryptAndStoreSellerTokens } from '../library/utils/internal-service/databaseOperations.js';
import { exchangeShopifyToken, getShopifyInstallUrl, validateShopifyHmac } from '../listing.js';
dotenv.config();

export const handleOAuthCallback = async (req, res) => {
    const { shop, code, hmac, state: clientId } = req.query;
    // if (state !== req.session.state) {
    //     return res.status(400).send('Invalid state parameter (CSRF mismatch)');
    // }

    console.log('OAuth callback received:', req.query);

    // HMAC validation
    const digest = validateShopifyHmac(req.query, process.env.SHOPIFY_API_SECRET_KEY);
    console.log('Calculated HMAC:', digest);
    console.log('Received HMAC:', hmac);
    if (digest !== hmac) {
        return res.status(400).send('HMAC validation failed');
    }

    try {
        // Exchange code for access token
        let tokenData = await exchangeShopifyToken(shop, code);
        console.log('Exchanged token data:', tokenData);
        const accessToken = tokenData.access_token;
        const grantedScopes = tokenData.scope;

        tokenData = { ...tokenData, shop };

        // Store or update shop credentials
        await encryptAndStoreSellerTokens(clientId, tokenData);

        res.send('App successfully installed!');
    } catch (err) {
        console.error('Error exchanging code for token:', err.response?.data || err);
        res.status(500).send('Error during OAuth process');
    }
};

export const redirectToShopifyAppInstallationUrl = (req, res) => {
    const shop = req.query.shop;
    if (!shop) return res.status(400).send('Missing shop parameter');

    const state = req.query.state;
    console.log('Redirecting to Shopify install URL with state:', state);

    const installUrl = getShopifyInstallUrl(shop, state);
    res.status(200).json({ redirectUrl: installUrl });
};

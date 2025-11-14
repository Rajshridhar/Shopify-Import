import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const SCOPES = process.env.SCOPES;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET_KEY = process.env.SHOPIFY_API_SECRET_KEY;
const redirectUri = process.env.REDIRECT_URI;

export function getShopifyInstallUrl(shop, state) {
    //const redirectUri = `${APP_URL}/api/callback/shopify`;
    return (
        `https://${shop}/admin/oauth/authorize?` +
        `client_id=${SHOPIFY_API_KEY}` +
        `&scope=${SCOPES}` +
        `&state=${state}` +
        `&redirect_uri=${redirectUri}`
    );
}

export function validateShopifyHmac(query, secret) {
    const map = { ...query };
    delete map['hmac'];
    delete map['signature'];
    const message = Object.keys(map)
        .sort()
        .map((k) => `${k}=${map[k]}`)
        .join('&');
    const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
    return digest;
}

export async function exchangeShopifyToken(shop, code) {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET_KEY,
        code,
    });
    console.log('Token response data:', tokenRes.data);
    return tokenRes.data;
}

import crypto from 'crypto';
import logger from './logger/index.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts the string value using AES-GCM (provides both encryption and authentication)
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted text
 */
export function encrypt(text) {
    try {
        if (!text) {
            return text;
        }

        // Generate unique salt and IV for each encryption
        const salt = crypto.randomBytes(32); // 256-bit salt
        const iv = crypto.randomBytes(12); // 96-bit IV (recommended for GCM)

        // Derive key using scrypt with unique salt
        const key = crypto.scryptSync(ENCRYPTION_KEY, salt, 32);

        // Create cipher with GCM mode
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Get authentication tag (provides integrity protection)
        const authTag = cipher.getAuthTag();

        // Format: salt:iv:authTag:encryptedData
        return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        logger.log('info', '[Shopify-API] Encryption failed', { error: error.message });
    }
}

/**
 * Decrypts the encrypted string value using AES-GCM
 * @param {string} encryptedText - The encrypted text
 * @returns {string} - The decrypted text
 */
export function decrypt(encryptedText) {
    try {
        if (!encryptedText) {
            return encryptedText;
        }

        const textParts = encryptedText.split(':');
        if (textParts.length !== 4) {
            throw new Error('Invalid encrypted text'); // Don't provide more specific message for security reasons
        }

        const salt = Buffer.from(textParts[0], 'hex');
        const iv = Buffer.from(textParts[1], 'hex');
        const authTag = Buffer.from(textParts[2], 'hex');
        const encryptedData = textParts[3];

        // Derive the same key using the stored salt
        const key = crypto.scryptSync(ENCRYPTION_KEY, salt, 32);

        // Create decipher with GCM mode
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        // Set the authentication tag for verification
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        logger.log('info', '[Shopify-API] Decryption failed', { error: error.message });

        // Provide more specific error messages for debugging
        if (error.message.includes('Unsupported state') || error.message.includes('Invalid authentication')) {
            logger.log('info', '[Shopify-API] Authentication failed - data may have been tampered with');
        }

        logger.log('info', '[Shopify-API] Decryption failed');
    }
}

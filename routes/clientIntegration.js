import express from 'express';
import session from 'express-session'; // Don't remove
import { handleOAuthCallback, redirectToShopifyAppInstallationUrl } from '../controllers/callback/oAuth.js';


const router = express.Router();

// Use session middleware (should also be in main app)
//router.use(session({ secret: 'a-random-secret', resave: false, saveUninitialized: true }));

// OAuth routes
router.get('/', redirectToShopifyAppInstallationUrl);
router.get('/oauth', handleOAuthCallback);


export default router;

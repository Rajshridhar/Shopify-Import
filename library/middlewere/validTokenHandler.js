import asyncHandler from 'express-async-handler';
import { decode } from 'next-auth/jwt';

import { authTokens, httpTokenCookieName, httpsTokenCookieName } from '../constants/auth.js';
import { getCookieFromHeader } from '../utils/auth.js';
import logger from '../utils/logger/index.js';
import { userTypeAccessMapper } from '../constants/access.js';
import _ from 'lodash';

export const validateToken = asyncHandler(async (req, res, next) => {
    const authHeader = req?.headers?.Authorization ?? req?.headers?.authorization ?? '';
    const cookieData = req?.headers?.cookie ?? '';
    const referer = req?.headers?.referer ?? '';
    const reqUrl = req?.originalUrl ?? '';

    try {
        let user = {};

        //Auth header - token
        let authHeaderToken = '';
        if (authHeader && authHeader.startsWith('Bearer')) {
            try {
                authHeaderToken = authHeader.split(' ')[1];
            } catch (err) {
                logger.error('Auth header error!!');
            }
        }

        //Auth Cookie - token
        let cookieToken = '';
        if (cookieData) {
            try {
                cookieToken = getCookieFromHeader(cookieData, httpsTokenCookieName);
                if (!cookieToken) {
                    cookieToken = getCookieFromHeader(cookieData, httpTokenCookieName);
                }
            } catch (err) {
                logger.error('Cookie object error!!', err);
            }
        }

        //Bearer token
        if (authHeaderToken) {
            let allowedTokens = Object.keys(authTokens);
            if (allowedTokens.includes(authHeaderToken)) {
                user = authTokens[authHeaderToken];
            } else {
                let userInfo = await decode({
                    token: authHeaderToken,
                    secret: process.env.NEXTAUTH_SECRET,
                });

                if (typeof userInfo == 'object' && userInfo?.user) {
                    user = userInfo.user;
                } else {
                    throw 'Access denied!!';
                }
            }
        }
        //Cookie - Token
        else if (cookieToken) {
            let userInfo = await decode({
                token: cookieToken,
                secret: process.env.NEXTAUTH_SECRET,
            });

            if (typeof userInfo == 'object' && userInfo?.user) {
                user = userInfo.user;
            } else {
                throw 'Access denied!';
            }
        } else {
            throw 'Access denied!';
        }

        //Preparing User info
        req['user'] = {
            email: user?.email ?? user?.meta?.email ?? '',
            type: user?.meta?.type ?? '',
            status: user?.meta?.status ?? '',
            client: user?.meta?.client ?? '',
            clients: user?.meta?.clients ?? [],
        };

        //Access type
        if (user?.meta?.type) {
            let userType = user.meta.type;
            if (userTypeAccessMapper?.[userType]) {
                req['user']['accessList'] = userTypeAccessMapper[userType];
            }
        }

        //Validating User
        if (!req['user']['email']) {
            throw 'Unable to get user information!!';
        }
        if (req['user']['status'] != 'ENABLED') {
            throw 'Contact system administrator to activate you account!';
        }

        //Validating Client access
        if (
            !(
                (req['user']['client'] &&
                    req['user']['clients'].length &&
                    req['user']['clients'].includes(req['user']['client'])) ||
                (req['user']['client'] && req['user']['clients'].length == 0 && req['user']['type'] == 'ADMIN') ||
                (!req['user']['client'] && ['SYSTEM'].includes(req['user']['email']))
            )
        ) {
            throw `User don't have access for ${req['user']['client'] ? `[${req['user']['client']}]` : 'this'} client!`;
        }
        next();
    } catch (error) {
        let err =
            typeof error == 'object'
                ? error?.toString() != '[object Object]'
                    ? error.toString()
                    : JSON.stringify(error)
                : typeof error == 'string'
                  ? error
                  : `Error datatype ${typeof error}`;
        logger.log(
            'error',
            `
            [API SERVER: AUTH ERROR] 
            Authorization: ${authHeader}
            Cookie: ${cookieData}
            URL: ${reqUrl}
            Referer: ${referer}
            Error: ${err}
        `
        );
        let errorMsg = typeof error == 'string' && error.includes('!') ? error : 'Authentication Error!';
        return res.status(401).json({ error: errorMsg });
    }
});

export default validateToken;

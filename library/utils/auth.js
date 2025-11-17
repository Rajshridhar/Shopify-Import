export function getCookieFromHeader(cookieHeader, name) {
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split('; ');
    for (const cookie of cookies) {
        const [cookieName, cookieValue] = cookie.split('=');
        if (cookieName === name) {
            return cookieValue;
        }
    }
    return null;
}

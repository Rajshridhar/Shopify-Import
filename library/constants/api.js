export const imageAPIConfig = {
    timeout: 10000, // 10 second timeout
    headers: {
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
    // Prevent axios from following redirects indefinitely
    maxRedirects: 5,
    // Validate status codes
    validateStatus: (status) => status >= 200 && status < 400,
};

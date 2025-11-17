import axios from 'axios';
import _ from 'lodash';
import os from 'os';
import logger from './logger/index.js';

export function getSubstringBetweenStrings(inputString, startString, endString) {
    let startIndex = inputString.indexOf(startString);
    if (startIndex === -1) startIndex = 0; // Start string not found
    let endIndex = inputString.indexOf(endString, startIndex + startString.length);
    if (endIndex === -1) endIndex = inputString.length; // End string not found
    return inputString.substring(startIndex + startString.length, endIndex);
}

export function getFileExtensionFromType(fileType) {
    // Check if the input string contains a slash
    if (fileType.includes('/')) {
        // Split the string by the slash and get the last part
        const parts = fileType.split('/');
        if (parts.length > 1) {
            return parts[1];
        }
    }

    // If the input doesn't contain a slash or doesn't split correctly, return an empty string or handle it as needed.
    return '';
}

export function removeHtmlTags(input) {
    // Remove HTML tags
    const stringWithoutTags = input.replace(/<[^>]*>/g, '');

    // Remove HTML entities
    const stringWithoutEntities = stringWithoutTags.replace(/&[a-z]+;|&#\d+;/gi, '');

    // Remove URLs
    const stringWithoutUrls = stringWithoutEntities.replace(/(https?|ftp|file):\/\/[^\s/$.?#].[^\s]*/gi, '');

    return stringWithoutUrls;
}

export function replacePlaceholders(template, variablesObj) {
    // Regular expression to match placeholders inside double curly braces
    const regex = /{{(.*?)}}/g;

    // Replace each placeholder with the corresponding variable value
    const replacedString = template.replace(regex, (match, p1) => {
        const variableName = p1.trim(); // Trim any extra whitespace
        return variablesObj?.[variableName] ?? ''; // Replace with variable value or keep the placeholder if not found
    });

    return replacedString;
}

export function capitalizeWords(str) {
    return str
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

export async function checkRemoteImageAsync(url) {
    try {
        const response = await axios.get(url);

        if (response.status == 200) {
            // Image loaded successfully
            return true;
        } else {
            // Image failed to load
            return false;
        }
    } catch (error) {
        // Error occurred during the fetch
        // console.error("An error occurred while checking the remote image:", error);
        return false;
    }
}

export function numberToAlphanumeric(number) {
    const base = 36; // Using base 36 to include digits (0-9) and uppercase alphabets (A-Z)
    return number.toString(base).toUpperCase();
}

export function generateUniqueId() {
    let unixMilliSec = Date.now();
    // Max of 1000 ids can be generated in a second - in this system!
    let idAlphNum = numberToAlphanumeric(unixMilliSec);
    return idAlphNum;
}

function generateRandomAlphanumeric(length) {
    const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const charactersLength = characters.length;

    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charactersLength);
        result += characters.charAt(randomIndex);
    }

    return result;
}

export function generateAllAlphanumericCombinations(prefix, maxLength) {
    const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const combinations = [];
    let prefixUpper = prefix?.toUpperCase();

    function generateCombinationsRecursive(prefixUpper, remainingLength) {
        if (remainingLength === 0) {
            combinations.push(prefixUpper);
            return;
        }

        for (let i = 0; i < characters.length; i++) {
            const currentChar = characters.charAt(i);
            generateCombinationsRecursive(prefixUpper + currentChar, remainingLength - 1);
        }
    }

    for (let length = 1; length <= maxLength; length++) {
        generateCombinationsRecursive(prefixUpper, length);
    }

    return combinations;
}

export function generateNameInitials(name = '') {
    try {
        const words =
            name
                ?.replace(/[^a-zA-Z0-9\s]/g, '')
                ?.replace(/\s+/g, ' ')
                .split(' ') ?? '';
        let recommendedName = '';
        let totalWordsInName = words.length;

        if (!words.length) {
            throw 'No name for generating initials!';
        } else if (words.length == 1) {
            if (name.length >= 4) {
                recommendedName = name.replace(/\s+/g, '').slice(0, 4);
            } else {
                recommendedName = name;
            }
        } else if (words.length <= 4) {
            for (let w = 0; w < 4; w++) {
                if (words[w]) {
                    recommendedName += words[w].slice(0, 1);
                } else {
                    break;
                }
            }
        }

        let nameLen = recommendedName.length;
        if (nameLen < 4) {
            let alphaNumToGenerateLength = 4 - nameLen;
            recommendedName += generateRandomAlphanumeric(alphaNumToGenerateLength);
            return recommendedName.toUpperCase();
        } else {
            return recommendedName.toUpperCase();
        }
    } catch (err) {
        console.log(err);
        throw new Error('Failed to generate client name initials!');
    }
}

export function getSubstringBetweenWords(inputString, word1, word2) {
    // Find the index of the first word
    const index1 = inputString.indexOf(word1);
    if (index1 === -1) {
        console.error(`"${word1}" not found in the input string.`);
        return '';
    }

    // Find the index of the second word
    const index2 = inputString.indexOf(word2);
    if (index2 === -1) {
        console.error(`"${word2}" not found in the input string.`);
        return '';
    }

    // Calculate the start and end positions for the substring
    const startIndex = index1 + word1.length;
    const endIndex = index2;

    // Extract the substring between the two words
    const substring = inputString.substring(startIndex, endIndex);

    return substring;
}

export function flattenObjectFromNestedObject(obj, prefix = '') {
    let flatObj = {};
    for (let key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            Object.assign(flatObj, flattenObjectFromNestedObject(obj[key], prefix + key + '_'));
        } else {
            flatObj[prefix + key] = obj[key];
        }
    }
    return flatObj;
}

export function replaceSpecialChars(inputString) {
    // Replace special characters with underscores
    const replacedSpecialChars = inputString.replaceAll(/[^\w\s]/gi, '');
    return replacedSpecialChars;
}

export function replaceSpaces(inputString) {
    // Replace consecutive spaces with a single space
    const replacedSpaces = inputString.replaceAll(/\s+/g, ' ');
    return replacedSpaces;
}

//For mongoDb data updation - convert nested objects to flat key value

export function flattenObject(obj, parentKey = '', result = {}) {
    _.forOwn(obj, (value, key) => {
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        //Except Array and Dates, if typeof value is Object - then find nesting if present
        if (_.isObject(value) && !(value instanceof Date) && !_.isArray(value)) {
            if (_.isEqual(value, {})) {
                result[newKey] = null;
            } else {
                flattenObject(value, newKey, result);
            }
        } else {
            result[newKey] = value;
        }
    });
    return result;
}

export function flattenObjectWithSkippingKeys(obj, keysToSkip = [], parentKey = '', result = {}) {
    _.forOwn(obj, (value, key) => {
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        //Except Array and Dates, if typeof value is Object - then find nesting if present
        if (keysToSkip.includes(newKey)) {
            result[newKey] = value;
        } else if (_.isObject(value) && !(value instanceof Date) && !_.isArray(value)) {
            if (_.isEqual(value, {})) {
                result[newKey] = null;
            } else {
                flattenObjectWithSkippingKeys(value, keysToSkip, newKey, result);
            }
        } else {
            result[newKey] = value;
        }
    });
    return result;
}

export function extractNestedJsonString(str) {
    try {
        const index1 = str?.indexOf('{') ?? -1;
        const index2 = str?.lastIndexOf('}') ?? -1;
        if (index2 != index1) {
            return str.substring(index1, index2 + 1);
        } else {
            throw 'Not a valid json string!';
        }
    } catch (err) {
        return '{}';
    }
}

export function fetchWithTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out after ' + timeoutMs + 'ms')), timeoutMs)
        ),
    ]);
}

export function getUniqueQueueName(queueName) {
    let machineId = '';
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
        const username = os.userInfo().username;
        const hostname = os.hostname();
        machineId = `${username}_${hostname}`.replace(/[^a-zA-Z0-9]/g, '_');
    }
    return `${process.env.NODE_ENV}_${machineId ? `${machineId}_` : ''}${queueName}`;
}

export function formatErrorMsg(error) {
    let err =
        typeof error == 'object'
            ? error?.toString() != '[object Object]'
                ? error.toString()
                : JSON.stringify(error)
            : typeof error == 'string'
              ? error
              : `Error datatype ${typeof error}`;
    return err;
}

export function createGenericFailedData(jobRemarks) {
    if (typeof jobRemarks !== 'string') {
        jobRemarks = JSON.stringify(jobRemarks);
    }
    return {
        variantId: '-',
        variantSku: '-',
        productId: '-',
        productSku: '-',
        jobRemarks,
    };
}

/**
 * Sanitizes string values by removing sensitive data
 * @param {string} value - String value to sanitize
 * @param {Array} keysToRemove - Array of keys to remove
 * @returns {string} Sanitized string
 */
function sanitizeStringValue(value, keysToRemove) {
    try {
        // Try to parse as JSON
        const parsedValue = JSON.parse(value);
        if (typeof parsedValue === 'object' && parsedValue !== null) {
            // Recursively sanitize the parsed JSON
            const sanitizedParsed = removeSensitiveData([parsedValue], keysToRemove)[0];
            return JSON.stringify(sanitizedParsed);
        }
    } catch (e) {
        // If it's not valid JSON, remove entire headers object from string
        let sanitizedString = value;

        // Remove entire headers object from JSON strings
        keysToRemove.forEach((sensitiveKey) => {
            // Pattern to match entire headers object: "headers":{...}
            const headersRegex = new RegExp(`"${sensitiveKey}"\\s*:\\s*\\{[^}]*\\}`, 'g');
            sanitizedString = sanitizedString.replace(headersRegex, '');

            // Also handle cases where headers might be at the end with trailing comma
            sanitizedString = sanitizedString.replace(/,\s*$/, '');
        });

        return sanitizedString;
    }
    return value;
}

/**
 * Removes sensitive data from objects before CSV generation
 * @param {Array} data - Array of objects to sanitize
 * @param {Array} keysToRemove - Array of keys to remove (defaults to ['headers', 'header'])
 * @returns {Array} Sanitized array of objects
 */
export function removeSensitiveData(data, keysToRemove = ['headers', 'header']) {
    try {
        // Handle non-array data
        if (!Array.isArray(data)) {
            if (typeof data === 'string') {
                return sanitizeStringValue(data, keysToRemove);
            } else if (typeof data === 'object' && data !== null) {
                return sanitizeObject(data, keysToRemove);
            }
            return data;
        }

        // Handle empty array
        if (!data.length) {
            return data;
        }

        return data.map((item) => {
            if (typeof item === 'string') {
                return sanitizeStringValue(item, keysToRemove);
            } else if (typeof item === 'object' && item !== null) {
                return sanitizeObject(item, keysToRemove);
            }
            return item;
        });
    } catch (err) {
        logger.log('error', `Error sanitizing data. Returning original data. Error: ${JSON.stringify(err)}`);
        return data;
    }
}

/**
 * Sanitizes object values by removing sensitive data
 * @param {Object} item - Object to sanitize
 * @param {Array} keysToRemove - Array of keys to remove
 * @returns {Object} Sanitized object
 */
function sanitizeObject(item, keysToRemove) {
    try {
        const sanitizedItem = { ...item };

        // Remove specified keys
        keysToRemove.forEach((key) => {
            if (sanitizedItem.hasOwnProperty(key)) {
                delete sanitizedItem[key];
            }
        });

        // Recursively sanitize nested objects and JSON strings
        Object.keys(sanitizedItem).forEach((key) => {
            const value = sanitizedItem[key];

            if (typeof value === 'object' && value !== null) {
                // Handle nested objects and arrays
                if (Array.isArray(value)) {
                    // Handle arrays (like jobRemarks that might be an array of error messages)
                    sanitizedItem[key] = value.map((arrayItem) => {
                        if (typeof arrayItem === 'string') {
                            return sanitizeStringValue(arrayItem, keysToRemove);
                        } else if (typeof arrayItem === 'object' && arrayItem !== null) {
                            return sanitizeObject(arrayItem, keysToRemove);
                        }
                        return arrayItem;
                    });
                } else {
                    // Handle nested objects
                    sanitizedItem[key] = sanitizeObject(value, keysToRemove);
                }
            } else if (typeof value === 'string') {
                // Handle JSON strings that might contain sensitive data
                sanitizedItem[key] = sanitizeStringValue(value, keysToRemove);
            }
        });

        return sanitizedItem;
    } catch (err) {
        logger.log('error', `Error sanitizing object. Returning original object. Error: ${JSON.stringify(err)}`);
        return item;
    }
}

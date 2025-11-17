import aws from 'aws-sdk';
import axios from 'axios';
import { getFileExtensionFromType, checkRemoteImageAsync } from '../general.js';
import { imageAPIConfig } from '../../constants/api.js';

function removeLeadingSlash(str) {
    return str.startsWith('/') ? str.slice(1) : str;
}

/* 
  Single Part Upload Functions
*/
export async function getpresignedUrl(fileName = '') {
    try {
        if (!fileName) {
            throw 'Please provide filename!';
        }

        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });

        const s3 = new aws.S3();

        const response = await s3.createPresignedPost({
            Bucket: process.env.S3_BUCKET_NAME,
            Fields: {
                key: `assets/m/${fileName}`,
            },
            Expires: 300, // seconds
            Conditions: [
                ['content-length-range', 0, 6291456], //1048576], // up to 6 MB
            ],
        });
        return { data: response };
    } catch (err) {
        return { error: err };
    }
}

export async function uploadFile(file) {
    try {
        //Validations
        if (file === undefined) {
            throw 'Please select file to upload!';
        }
        if (file.size > 5 * 1024 * 1024) {
            throw 'Please upload images upto 5MB size only!';
        }

        //Custom File Name
        var filename = removeLeadingSlash(encodeURIComponent(file.name.replaceAll(/[^a-zA-Z0-9.-_]+/g, '')));

        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });

        const s3 = new aws.S3();

        const post = await s3
            .upload({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: filename,
                Body: file,
                // ContentType: fType
            })
            .promise();

        if (post.Location) {
            return { url: post.Location };
        } else if ('error' in post) {
            return { error: post.error };
        } else {
            return { error: 'No URL found' };
        }
    } catch (err) {
        return { error: err };
    }
}

export async function uploadDataStream(dataStream, fName = '', fType = 'text/csv') {
    try {
        if (fName.endsWith('.json')) {
            fType = 'application/json';
        }
        let filename = fName ? fName : `other/${moment().unix()}.${getFileExtensionFromType(fType)}`;

        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });

        const s3 = new aws.S3();

        const post = await s3
            .upload({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: removeLeadingSlash((fName.includes('assets') ? '' : 'assets/') + filename),
                Body: dataStream,
                ContentType: fType,
            })
            .promise();

        if (post.Location) {
            return { url: post.Location };
        } else if ('error' in post) {
            return { error: post.error };
        } else {
            return { error: 'No URL found' };
        }
    } catch (err) {
        return { error: 'ERR:' + err };
    }
}

export async function fetchAndUploadFile(fileName = '', url = '', path = 'assets/m/', uploadEvenIfPresent = true) {
    try {
        if (!url) {
            throw 'Please provide file url to fetch and upload!';
        }
        if (!fileName) {
            throw 'Please provide file name to upload!';
        }

        const fileResponse = await axios.get(url, { responseType: 'arraybuffer', ...imageAPIConfig });
        let fileType = fileResponse?.headers?.['content-type'] ?? '';
        let fileExt = fileType?.split('/')?.[1] ?? '';
        let fileBufferData = fileResponse?.data ?? null;
        if (fileBufferData) {
            let fileUrl = `${path}${fileName}.${fileExt}`;
            let imgUrl = `https://${process.env.S3_BUCKET_NAME}.s3.ap-south-1.shopifyaws.com/${encodeURI(fileUrl).replaceAll('&', '%26').replaceAll(',', '%2C').replaceAll('(', '%28').replaceAll(')', '%29').replaceAll('+', '%2B')}`;
            let checkIfpresent = await checkRemoteImageAsync(imgUrl);
            let uploadRes = {};
            if (!uploadEvenIfPresent && checkIfpresent) {
                uploadRes = { url: imgUrl };
                console.log('          >> IMG_ALREADY_PRESENT', imgUrl);
            } else {
                uploadRes = await uploadDataStream(fileBufferData, fileUrl, fileType);
                console.log('          >> IMG_UPLOADED', imgUrl);
            }
            return uploadRes;
        } else {
            throw 'No data found for image';
        }
    } catch (err) {
        return { error: err };
    }
}

/* 
  Multi Part Upload Functions
*/
export async function createMultipartUpload(fileName = '', fileType = '') {
    try {
        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });

        const s3 = new aws.S3();

        const post = await s3
            .createMultipartUpload({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: removeLeadingSlash(fileName),
                ContentType: fileType,
            })
            .promise();

        if ('UploadId' in post) {
            return { uploadId: post.UploadId };
        } else {
            throw 'failed to get upload id!';
        }
    } catch (err) {
        console.log(err);
        return { error: err };
    }
}

export async function getSignedUrl(fileName = '', partNumber = '', uploadId = '') {
    try {
        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });
        const s3 = new aws.S3();
        const url = await s3.getSignedUrl('uploadPart', {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileName,
            PartNumber: partNumber,
            UploadId: uploadId,
        });
        return { url: url };
    } catch (err) {
        console.log(err);
        return { error: err };
    }
}

export async function completeMultipartUpload(fileName = '', parts = '', uploadId = '') {
    try {
        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });
        const s3 = new aws.S3();
        const response = await s3
            .completeMultipartUpload({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: fileName,
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: parts,
                },
            })
            .promise();
        return response;
    } catch (err) {
        console.log(err);
        return { error: err };
    }
}

// Function to list all files in an S3 folder
export async function listFilesInFolder(folderPath) {
    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: folderPath,
    };

    try {
        aws.config.update({
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY,
            region: process.env.S3_REGION,
            signatureVersion: 'v4',
        });
        const s3 = new aws.S3();

        const data = await s3.listObjectsV2(params).promise();
        const files = data.Contents.map((object) => object.Key);
        return files;
    } catch (error) {
        console.error('Error listing files:', error);
        throw error;
    }
}

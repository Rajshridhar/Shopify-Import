import TransformationJob from "../../../../../../models/tranformation_job.js";
import { parseRemoteCSVWithNestedKeys, writeDataToCSV } from "../../../../../utils/csv.js";
import { uploadDataStream } from "../../../../../utils/cloud-storage/aws.js";
import csvjson from "csvjson";
import logger from "../../../../../utils/logger/index.js";
import _ from "lodash";
import { importJsonToProduct } from "../importJsonToProduct.js";
import { sendNotification } from "../../../notification/index.js";

export const bulkImportProducts = async (jobData, clientMarketplaceConfig) => {

    let jobId = jobData?._id ?? "";
    let jobConfig = jobData?.config ?? {};
    
    let clientId = jobConfig?.clientId ?? "";
    let clientData = jobData?.clientData ?? {};
    let uploadToS3 = jobConfig?.uploadToS3 ?? false;
    let initiatedBy = jobData?.user?.initiated_by ?? "";
    let productTypeConfig = jobConfig?.productTypeConfig ?? {};
    let originalFileUrl = jobConfig?.originalFileUrl ?? "";

    try {
        let fileUrl = jobData?.input_file ?? "";
        let jobConfig = jobData?.config ?? {};
        
        if (!fileUrl) { throw "Job doesn't have any file to process!" }
        
        // Check if this is an old format job (backward compatibility)
        if (Object.keys(productTypeConfig).length === 0) {
            // Check for old format: jobConfig.productType exists
            const oldProductType = jobConfig?.productType ?? "";
            const oldProductUniqueAttr = jobConfig?.productUniqueAttr ?? "";
            const oldVariantUniqueAttr = jobConfig?.variantUniqueAttr ?? "";
            
            if (oldProductType) {
                logger.log("info", `[JOB: ${jobId}] Detected old job format, converting to new format`);
                
                productTypeConfig = {
                    [oldProductType]: {
                        productTypeId: oldProductType,
                        productTypeCode: oldProductType,
                        csvUrl: fileUrl, // Use the main file URL for old jobs
                        productUniqueAttr: oldProductUniqueAttr,
                        variantUniqueAttr: oldVariantUniqueAttr,
                    }
                };
                
                logger.log("info", `[JOB: ${jobId}] Converted old format to productTypeConfig: ${JSON.stringify(productTypeConfig)}`);
            } else {
                throw "Job doesn't have productTypeConfig or legacy productType!";
            }
        }
        
        return await importCsvUsingProductTypeConfig(jobData, productTypeConfig, originalFileUrl || fileUrl);

    } catch (error) {
        let err = typeof error == "object" ? (error?.toString() != "[object Object]" ? error.toString() : JSON.stringify(error)) : typeof error == "string" ? error : `Error datatype ${typeof error}`;
        logger.log("error", `[JOB: ${jobId}] ${err}`);
        let jobResDataErr = await TransformationJob.findOneAndUpdate(
            { _id: jobId },
            {
                $set: { 
                    status: "FAILED", 
                    remarks: { error: err }
                }
            });
        try {
            // Try to get product type for notification (for backward compatibility)
            const productType = jobConfig?.productType || Object.keys(productTypeConfig)[0] || "Unknown";
            await sendNotification({
                channels: ["IN_APP","EMAIL"],
                clientData,
                users: [initiatedBy],
                module: "IMPORT",
                message: `Import Job [${productType}] [${jobId}] has been failed!`,
                refData: { ...(jobResDataErr?._doc ?? {}), remarks: { error: err } },
                type: "ERROR",
            })
        } catch (error) {
            logger.log("error", `[JOB: ${jobId}] ${error}`);
        }
        return { error: err }
    }
}

// Function to process product type config object directly
async function importCsvUsingProductTypeConfig(jobData, productTypeConfig, originalFileUrl) {
    let jobId = jobData?._id ?? "";
    let jobConfig = jobData?.config ?? {};
    let clientId = jobConfig?.clientId ?? "";
    let clientData = jobData?.clientData ?? {};
    let uploadToS3 = jobConfig?.uploadToS3 ?? false;
    let initiatedBy = jobData?.user?.initiated_by ?? "";

    try {
        // Update job status to running
        let jobStartRes = await TransformationJob.findOneAndUpdate(
            { _id: jobId },
            { $set: { status: "RUNNING" } }
        );
      
        logger.log("info", `[JOB: ${jobId}] PRODUCT TYPE CONFIG JOB RUNNING ${jobId}`)
      
        let overallStats = {
            total: 0,
            created: 0,
            updated: 0,
            failed: 0
        };
        
        let allFailedData = [];
        let productTypeResults = [];
        let productTypeEntries = Object.entries(productTypeConfig);
        
        // Process each product type directly from object
        for (let i = 0; i < productTypeEntries.length; i++) {
            const [productTypeCode, ptData] = productTypeEntries[i];
            logger.log("info", `[JOB: ${jobId}] Processing Product Type ${i + 1}/${productTypeEntries.length}: ${productTypeCode}`);

            try {
                // Parse CSV data for this product type
                let csvData = await parseRemoteCSVWithNestedKeys(ptData.csvUrl);
                let failedItemsInPreviousRunDataUrl = jobData?.remarks?.file ?? "";
                if (failedItemsInPreviousRunDataUrl) {
                    let failedItemsInPreviousRunData = await parseRemoteCSVWithNestedKeys(failedItemsInPreviousRunDataUrl);
                    if (failedItemsInPreviousRunData.length) {
                        // For multi-product type jobs, filter failed items by product type
                        let relevantFailedItems = failedItemsInPreviousRunData;
                        if (productTypeEntries.length > 1) {
                            // Only process failed items that belong to this specific product type
                            relevantFailedItems = failedItemsInPreviousRunData.filter(item => 
                                item.productType === productTypeCode
                            );
                        }
                        
                        if (relevantFailedItems.length > 0) {
                            const failedSet = new Set(relevantFailedItems.map(item => {
                                const productId = ptData.productUniqueAttr ? item?.[ptData.productUniqueAttr] : 'NO_PRODUCT_ID';
                                return `${productId}::${item?.[ptData.variantUniqueAttr]}`;
                            }));
                            csvData = csvData.filter(item => {
                                const productId = ptData.productUniqueAttr ? item?.[ptData.productUniqueAttr] : 'NO_PRODUCT_ID';
                                return failedSet.has(`${productId}::${item?.[ptData.variantUniqueAttr]}`);
                            });
                            
                            logger.log("info", `[JOB: ${jobId}] Rerun mode: Processing ${csvData.length} failed items for product type ${productTypeCode}`);
                        } else if (productTypeEntries.length > 1) {
                            logger.log("info", `[JOB: ${jobId}] Rerun mode: No failed items found for product type ${productTypeCode}, skipping`);
                            // Skip processing this product type if no failed items for it
                            productTypeResults.push({
                                productTypeCode: productTypeCode,
                                stats: { total: 0, created: 0, updated: 0, failed: 0 },
                                success: true,
                                skipped: true,
                                reason: "No failed items for this product type in rerun mode"
                            });
                            continue;
                        }
                    }
                }
                
                if (Array.isArray(csvData) && csvData.length) {
                    const convertConfig = { 
                        jobId: jobId,
                        clientId: clientId,
                        clientData,
                        productType: ptData.productTypeId,
                        productUniqueAttr: ptData.productUniqueAttr,
                        variantUniqueAttr: ptData.variantUniqueAttr,
                        uploadToS3: uploadToS3
                    };
                    
                    const {error, stats, failedData} = await importJsonToProduct(csvData, convertConfig);
                    
                    if (error === "Manually Terminated!!") {
                        return {error: "Manually Terminated!!"};
                    }
                    
                    // Accumulate stats
                    overallStats.total += stats.total;
                    overallStats.created += stats.created;
                    overallStats.updated += stats.updated;
                    overallStats.failed += stats.failed;
                    
                    // Collect failed data
                    if (failedData.length > 0) {
                        allFailedData.push(...failedData.map(item => ({
                            productType: productTypeCode,
                            ...item,
                        })));
                    }
                    
                    productTypeResults.push({
                        productTypeCode: productTypeCode,
                        stats: stats,
                        success: !error
                    });
                    
                    logger.log("info", `[JOB: ${jobId}] Completed ${productTypeCode}: ${stats.created} created, ${stats.updated} updated, ${stats.failed} failed`);
                } else {
                    logger.log("warn", `[JOB: ${jobId}] No data found for product type: ${productTypeCode}`);
                    productTypeResults.push({
                        productTypeCode: productTypeCode,
                        stats: { total: 0, created: 0, updated: 0, failed: 0 },
                        success: false,
                        error: "No data found"
                    });
                }
            } catch (ptError) {
                let ptErr = typeof ptError == "object" ? (ptError?.toString() != "[object Object]" ? ptError.toString() : JSON.stringify(ptError)) : typeof ptError == "string" ? ptError : `Error datatype ${typeof ptError}`;
                logger.log("error", `[JOB: ${jobId}] Error processing ${productTypeCode}: ${ptError}`);
                productTypeResults.push({
                    productTypeCode: productTypeCode,
                    stats: { total: 0, created: 0, updated: 0, failed: 0 },
                    success: false,
                    error: pt
                });
            }
        }
        
        // Generate failed data file if needed
        let failedFileUrl = "";
        if (allFailedData.length > 0) {
            const csvFinalData = csvjson.toCSV(allFailedData, { headers: 'key' });
            let awsRes = await uploadDataStream(csvFinalData, `${clientId}/logs/${jobId}_failed_rows.csv`);
            
            if (awsRes.url) {
                failedFileUrl = awsRes.url;
            } else {
                logger.log("error", `[JOB: ${jobId}] Failed to upload failed data CSV`);
            }
        }
        
        // Update job status
        let jobResDataNew = await TransformationJob.findOneAndUpdate(
            { _id: jobId },
            {
                $set: { 
                    status: allFailedData.length ? "PARTIAL_SUCCESS" : "COMPLETED", 
                    remarks: { 
                        stats: overallStats, 
                        file: failedFileUrl,
                        originalFileUrl: originalFileUrl,
                        productTypeResults: productTypeResults
                    }
                }
            }
        );

        // Send notification
        try {
            const isMultiPT = productTypeEntries.length > 1;
            const productTypeNames = Object.keys(productTypeConfig).join(', ');
            const message = isMultiPT 
                ? `Multi-Product Type Import Job [${jobId}] has been completed. Processed ${productTypeEntries.length} product types: ${productTypeNames}`
                : `Import Job [${productTypeNames}] [${jobId}] has been completed.`;
                
            await sendNotification({
                channels: ["IN_APP","EMAIL"],
                clientData,
                users: [initiatedBy],
                module: "IMPORT",
                message: message,
                refData: { 
                    ...(jobResDataNew?._doc ?? {}), 
                    productTypes: productTypeNames,
                    remarks: { 
                        stats: overallStats, 
                        file: failedFileUrl,
                        originalFileUrl: originalFileUrl,
                        productTypeResults: productTypeResults
                    } 
                },
                type: "SUCCESS",
            });
        } catch (error) {
            logger.log("error", `[JOB: ${jobId}] Notification error: ${error}`);
        }
        
        return overallStats;
        
    } catch (error) {
        let err = typeof error == "object" ? (error?.toString() != "[object Object]" ? error.toString() : JSON.stringify(error)) : typeof error == "string" ? error : `Error datatype ${typeof error}`;
        logger.log("error", `[JOB: ${jobId}] Product Type Config Error: ${err}`);
        
        let jobResDataErr = await TransformationJob.findOneAndUpdate(
            { _id: jobId },
            {
                $set: { 
                    status: "FAILED", 
                    remarks: { error: err, originalFileUrl: originalFileUrl }
                }
            }
        );
        
        try {
            const isMultiPT = Object.keys(productTypeConfig).length > 1;
            const productTypeNames = Object.keys(productTypeConfig).join(', ');
            const message = isMultiPT 
                ? `Multi-Product Type Import Job [${jobId}] has failed! Product types: ${productTypeNames}`
                : `Import Job [${productTypeNames}] [${jobId}] has failed!`;
                
            await sendNotification({
                channels: ["IN_APP","EMAIL"],
                clientData,
                users: [initiatedBy],
                module: "IMPORT",
                message: message,
                refData: { 
                    ...(jobResDataErr?._doc ?? {}), 
                    productTypes: productTypeNames,
                    remarks: { 
                        error: err, 
                        originalFileUrl: originalFileUrl
                    } 
                },
                type: "ERROR",
            });
        } catch (error) {
            logger.log("error", `[JOB: ${jobId}] Notification error: ${error}`);
        }
        
        return { error: err };
    }
}

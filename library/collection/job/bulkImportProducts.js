import { updateJob } from '../../utils/internal-service/databaseOperation.js';
import { ensureProductsFresh } from '../../utils/shopify-helper/get-products-data.js';

// Function to process product type config object directly
export const bulkImportProducts = async (jobData, clientMarketplaceConfig) => {
  let jobId = jobData?._id ?? '';
  let jobConfig = jobData?.config ?? {};
  let clientId = jobConfig?.clientId ?? '';
  let clientData = jobData?.clientData ?? {};
  let initiatedBy = jobData?.user?.initiated_by ?? '';

  try {
    if (!clientId || !jobId) {
      throw new Error("Bulk Import can't be initiated without clientId or jobId!");
    }
    await updateJob(jobId, { status: 'RUNNING' });
    logger.log('info', `[JOB: ${jobId}] PRODUCT TYPE CONFIG JOB RUNNING ${jobId}`);

    let stats = {
      total: 0,
      created: 0,
      updated: 0,
      failed: 0,
    };
    let allFailedData = [];
    let productTypeResults = [];
    let productTypeEntries = Object.entries(productTypeConfig);
    if (!productTypeConfig.productType || Object.keys(productTypeConfig).length === 0) {
      throw new Error("Bulk Import can't be initiated without productTypeConfig!");
    }
    for (let i = 0; i < productTypeEntries.length; i++) {
      const [productTypeCode, ptData] = productTypeEntries[i];
      logger.log(
        'info',
        `[JOB: ${jobId}] Processing Product Type ${i + 1}/${productTypeEntries.length}: ${productTypeCode}`
      );

      try {
        const fetchedProductData = await ensureProductsFresh(ptData.productType);
        if (Array.isArray(fetchedProductData) && fetchedProductData.length) {
          const convertConfig = {
            jobId: jobId,
            clientId: clientId,
            clientData,
            productType: ptData.productTypeId,
            productUniqueAttr: ptData.productUniqueAttr,
            variantUniqueAttr: ptData.variantUniqueAttr,
            uploadToS3: uploadToS3,
          };

          // Collect failed data
          if (failedData.length > 0) {
            allFailedData.push(
              ...failedData.map((item) => ({
                productType: productTypeCode,
                ...item,
              }))
            );
          }

          productTypeResults.push({
            productTypeCode: productTypeCode,
            stats: stats,
            success: !error,
          });
          const { error, stats, failedData } = await importJsonToProduct(csvData, convertConfig);

          if (error === 'Manually Terminated!!') {
            return { error: 'Manually Terminated!!' };
          }

          // Accumulate stats
          stats.total += stats.total;
          stats.created += stats.created;
          stats.updated += stats.updated;
          stats.failed += stats.failed;

          // Collect failed data
          if (failedData.length > 0) {
            allFailedData.push(
              ...failedData.map((item) => ({
                productType: productTypeCode,
                ...item,
              }))
            );
          }

          productTypeResults.push({
            productTypeCode: productTypeCode,
            stats: stats,
            success: !error,
          });

          logger.log(
            'info',
            `[JOB: ${jobId}] Completed ${productTypeCode}: ${stats.created} created, ${stats.updated} updated, ${stats.failed} failed`
          );
        } else {
          logger.log('warn', `[JOB: ${jobId}] No data found for product type: ${productTypeCode}`);
          productTypeResults.push({
            productTypeCode: productTypeCode,
            stats: { total: 0, created: 0, updated: 0, failed: 0 },
            success: false,
            error: 'No data found',
          });
        }
      } catch (ptError) {
        let ptErr =
          typeof ptError == 'object'
            ? ptError?.toString() != '[object Object]'
              ? ptError.toString()
              : JSON.stringify(ptError)
            : typeof ptError == 'string'
              ? ptError
              : `Error datatype ${typeof ptError}`;
        logger.log('error', `[JOB: ${jobId}] Error processing ${productTypeCode}: ${ptError}`);
        productTypeResults.push({
          productTypeCode: productTypeCode,
          stats: { total: 0, created: 0, updated: 0, failed: 0 },
          success: false,
          error: pt,
        });
      }
    }

    // Generate failed data file if needed
    let failedFileUrl = '';
    if (allFailedData.length > 0) {
      const csvFinalData = csvjson.toCSV(allFailedData, { headers: 'key' });
      let awsRes = await uploadDataStream(
        csvFinalData,
        `${clientId}/logs/${jobId}_failed_rows.csv`
      );

      if (awsRes.url) {
        failedFileUrl = awsRes.url;
      } else {
        logger.log('error', `[JOB: ${jobId}] Failed to upload failed data CSV`);
      }
    }

    // Update job status
    let jobResDataNew = await TransformationJob.findOneAndUpdate(
      { _id: jobId },
      {
        $set: {
          status: allFailedData.length ? 'PARTIAL_SUCCESS' : 'COMPLETED',
          remarks: {
            stats: stats,
            file: failedFileUrl,
            originalFileUrl: originalFileUrl,
            productTypeResults: productTypeResults,
          },
        },
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
        channels: ['IN_APP', 'EMAIL'],
        clientData,
        users: [initiatedBy],
        module: 'IMPORT',
        message: message,
        refData: {
          ...(jobResDataNew?._doc ?? {}),
          productTypes: productTypeNames,
          remarks: {
            stats: stats,
            file: failedFileUrl,
            originalFileUrl: originalFileUrl,
            productTypeResults: productTypeResults,
          },
        },
        type: 'SUCCESS',
      });
    } catch (error) {
      logger.log('error', `[JOB: ${jobId}] Notification error: ${error}`);
    }

    return stats;
  } catch (error) {
    let err =
      typeof error == 'object'
        ? error?.toString() != '[object Object]'
          ? error.toString()
          : JSON.stringify(error)
        : typeof error == 'string'
          ? error
          : `Error datatype ${typeof error}`;
    logger.log('error', `[JOB: ${jobId}] Product Type Config Error: ${err}`);

    let jobResDataErr = await TransformationJob.findOneAndUpdate(
      { _id: jobId },
      {
        $set: {
          status: 'FAILED',
          remarks: { error: err, originalFileUrl: originalFileUrl },
        },
      }
    );

    try {
      const isMultiPT = Object.keys(productTypeConfig).length > 1;
      const productTypeNames = Object.keys(productTypeConfig).join(', ');
      const message = isMultiPT
        ? `Multi-Product Type Import Job [${jobId}] has failed! Product types: ${productTypeNames}`
        : `Import Job [${productTypeNames}] [${jobId}] has failed!`;

      await sendNotification({
        channels: ['IN_APP', 'EMAIL'],
        clientData,
        users: [initiatedBy],
        module: 'IMPORT',
        message: message,
        refData: {
          ...(jobResDataErr?._doc ?? {}),
          productTypes: productTypeNames,
          remarks: {
            error: err,
            originalFileUrl: originalFileUrl,
          },
        },
        type: 'ERROR',
      });
    } catch (error) {
      logger.log('error', `[JOB: ${jobId}] Notification error: ${error}`);
    }

    return { error: err };
  }
};

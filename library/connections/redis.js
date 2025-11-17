import logger from '../../../../utils/logger/index.js';
import convert from 'convert-units';
import {
    channelsWithCodeAsHeader,
    parentKeyInfo,
    shopifySheetConfig,
    channelsWithAttributesInMultipleRows,
    clientAttributeToGetNullIfNoBrandValue,
    clientCatalogusValueInsteadOfChannelValue,
} from '../../../../constants/jobs/outbound.js';
import { getClient } from '../../../core/client.js';
import { getProductType } from '../../../core/productType.js';
import { getProfile } from '../../../core/profile.js';
import { getAttribute } from '../../../core/attribute.js';
import { getProduct } from '../../../core/product.js';
import {
    replacePlaceholders,
    prepareClientConstants,
    prepareProductTypeConstants,
    prepareProductInfo,
    prepareVariantInfo,
} from '../../../../helpers/jobs/outbound.js';
import { orderImages } from '../modules/dam/imageOrdering.js';
import _ from 'lodash';

const channelsWithParentChildRelationCustom = ["TA76_NOON","US94_UV_STACKS","GAIA_GAIABAY"]

export async function getMarketplaceDataHelper(data = {}, userEmail = '', profileData) {
    try {
        let jobId = data?._id ?? '';
        let jobConfig = data?.config ?? {};

        let clientId = data?.client_id ?? data?.clientId ?? jobConfig?.clientId ?? '';
        let productTypeId = jobConfig?.product_type ?? jobConfig?.productType ?? '';
        let channel = jobConfig?.channel ?? jobConfig?.channel ?? '';
        let filters = jobConfig?.filters ?? {};
        if (!clientId) {
            throw 'Client Id is required for exporting products!';
        }
        if (!productTypeId) {
            throw 'Product Type is required for exporting products!';
        }
        if (!channel) {
            throw 'Channel Code is required for exporting products!';
        }

        //Client config
        let clientData = await getClient(clientId);

        //Attributes
        let attributes = await getAttribute({ clientId });

        //ProductType Config
        let productType = await getProductType({ id: productTypeId });
        let productTypeDimensions = productType?.variant_dimensions ?? [];
        let childDimensionAttr = productTypeDimensions.length
            ? productTypeDimensions?.[productTypeDimensions.length - 1]?.replace(`${clientId}_`, '')
            : '';

        const { clientConstants, clientImageConstants } = prepareClientConstants(clientData);
        const { productTypeConstants, productTypeImageConstants } = prepareProductTypeConstants(productType);

        //Profile
        if (!profileData) {
            profileData = await getProfile(clientId, {
                product_type: productTypeId,
                channel: channel,
                status: 'ENABLED',
            });
        }

        if (!('mapper' in profileData && _.keys(profileData.mapper)).length) {
            throw 'No mapping present for product type!';
        }

        let mapperInfo = profileData?.mapper ?? {};
        let outputTemplate = profileData?.output_template ?? {};

        //Output Template Configuration
        const outputTemplateColumnConfig = outputTemplate?.config?.columns ?? {};
        const outputTemplateName = outputTemplate?.name ?? '';

        //Channel Configurations Constants
        const channelName = channel.toLowerCase();
        const channelsWithParentChildRelation = clientData?.config?.channel?.parent_child_relationship ?? [];

        //Image Tag Mapper Config
        const clientImageTagConfig = clientData?.config?.dam?.images?.mapper?.[channelName] ?? {}; //?? channelImageTags?.[channel]

        let clientImageTags = {}; // NO LONGER IN USE - NEED TO REMOVE
        let profileImageTags = {};
        Object.keys(mapperInfo).forEach((k) => {
            let config = mapperInfo[k];
            if (Object.keys(clientImageTagConfig).includes(k)) {
                clientImageTags[k] = clientImageTagConfig[k];
            }
            if (config.type == 'image_tags') {
                profileImageTags[k] = config?.value ?? [];
            }
        });

        //Mappers - using Output template config
        let columnCodeLabelMapper = {};
        let columnCodeEmptyObj = {};
        let columnLabelCodeMapper = {};
        let columnLabelEmptyObj = {};
        let columnCodeCodeMapper = {};
        let columnPossibleValues = {};
        let columnPossibleValuesInLowerCase = {};

        if (outputTemplateColumnConfig && typeof outputTemplateColumnConfig == 'object') {
            Object.keys(outputTemplateColumnConfig).map((attr) => {
                let attrConfig = outputTemplateColumnConfig[attr];
                let label = attrConfig?.label ? attrConfig.label : attr;
                let code = attrConfig?.code ? attrConfig.code : attr;
                columnCodeLabelMapper[code] = label;
                columnLabelCodeMapper[label] = code;
                columnCodeCodeMapper[code] = code;
                columnCodeEmptyObj[code] = '';
                columnLabelEmptyObj[label] = '';

                //Possible values
                if (outputTemplateColumnConfig[attr]?.allowed_values) {
                    let columnPossibleValuesArray = outputTemplateColumnConfig[attr]?.allowed_values
                        ?.toString()
                        ?.replaceAll(',', ';')
                        ?.split(';')
                        ?.map((value) => value?.trim() || '');

                    columnPossibleValues[code] = columnPossibleValuesArray;
                    columnPossibleValuesInLowerCase[code] = JSON.parse(
                        JSON.stringify(columnPossibleValuesArray)?.toLowerCase()
                    );
                }
            });
        }

        let exportData = [];
        let jobRemarks = [];
        let channelUpperCase = channel.toUpperCase();
        let shopifyProductsWithMultipleImagesAndNoHandle = 0;

        // Default Value For Empty Cells
        const defaultCellValue = null;

        /*
         * Product Data Preparation # START
         */

        let productVariantDimensionSequenceNum = 1;
        let productVariantDimensionSequence = {};
        let uniqueGroupId = 0;

        //Product Set
        let productsData = await getProduct({
            clientId: clientId,
            productType: productTypeId,
            // activeOnChannels: [channelUpperCase],
            generatedForChannels: [channelUpperCase],
            ...filters,
        });

        if (productsData.error) {
            throw productsData.error;
        } else if (!Array.isArray(productsData)) {
            throw 'Not able to get products for export!';
        } else if (Array.isArray(productsData) && !productsData.length) {
            throw 'No products to export!';
        }

        logger.log('info', `[EXPORT JOB HELPER] | ${jobId} | Product Set : ${productsData.length}`);

        const attributeWithValidations = {};

        productsData.forEach((product, productIndex) => {
            //If parent-child relation ON - export
            let parentExportData = [];
            let childrenExportData = [];
            let childrenClubbedOnVariantDimension = {};
            let shopifyVarDimCount = {};

            //Images
            let productImages = product?.images ?? [];

            //Data
            let prodInfo = prepareProductInfo(channel, clientData, attributes, product);

            //Variants
            let variantsCount = Array.isArray(product.variants) ? product.variants.length : 0;
            if (variantsCount) {
                product.variants.forEach((vari, variantIndex) => {
                    //Images
                    let variantImages = vari?.images ?? [];
                    const metadata = {};
                    const meta = vari?.metadata ?? {};
                    for (const [key, value] of Object.entries(meta)) {
                        metadata[`metadata#${key}`] = value;
                    }

                    let variantInfo = prepareVariantInfo(channel, clientData, attributes, vari);

                    let groupId; //productIndex

                    //Dimensional data
                    let variantDimensionsVal = vari?.variant_dimensions_val ?? '';
                    let childDimensionVal =
                        variantInfo?.[`${childDimensionAttr}#value`] ?? variantInfo?.[childDimensionAttr] ?? '';
                    let variantDimensionsValWithoutChildDim = variantDimensionsVal?.replace(
                        `_${childDimensionVal}`,
                        ''
                    );
                    if (variantDimensionsValWithoutChildDim in productVariantDimensionSequence) {
                        groupId = productVariantDimensionSequence[variantDimensionsValWithoutChildDim];
                    } else {
                        productVariantDimensionSequence[variantDimensionsValWithoutChildDim] =
                            productVariantDimensionSequenceNum;
                        groupId = productVariantDimensionSequenceNum;
                        productVariantDimensionSequenceNum++;
                    }

                    uniqueGroupId++;

                    //Preparing rows
                    if (Object.keys(variantInfo).length || Object.keys(prodInfo).length) {
                        //DON'T change rowInitData name, its being used in JS string
                        let rowInitData = JSON.parse(
                            JSON.stringify({
                                ...variantInfo,
                                ...prodInfo,
                                ...clientConstants,
                                ...productTypeConstants,
                                ...metadata,
                            })
                        );

                        let rowFinData = {};
                        //Preparing Attributes
                        if (typeof mapperInfo == 'object') {
                            Object.keys(mapperInfo).forEach((attr) => {
                                let config = mapperInfo[attr];
                                let type = config?.type ?? '';
                                let value =
                                    config?.nextStep?.value && config?.value == 'title'
                                        ? config?.nextStep?.value
                                        : (config?.value ?? '');
                                let nextStep = config?.nextStep;
                                let attrKey = channelsWithCodeAsHeader.includes(channel)
                                    ? (columnLabelCodeMapper?.[attr] ?? attr)
                                    : (columnCodeLabelMapper?.[attr] ?? attr);

                                if (type == 'custom') {
                                    rowFinData[attrKey] = replacePlaceholders(value, rowInitData) ?? defaultCellValue;
                                } else if (type == 'column') {
                                    rowFinData[attrKey] =
                                        rowInitData?.[`${value}#catalogus`] ??
                                        rowInitData?.[`${value}#value`] ??
                                        defaultCellValue;
                                } else if (type == 'formula') {
                                    try {
                                        rowFinData[attrKey] = eval(value);
                                    } catch (err) {
                                        console.error('eval() function error: ', err);
                                        rowFinData[attrKey] = defaultCellValue;
                                    }
                                } else if (['ai', 'ai-assistant'].includes(type)) {
                                    //Only channel value
                                    let channelAttrKey = `${value}#${channelName}`;
                                    let finalVal =
                                        channelAttrKey in rowInitData ? rowInitData[channelAttrKey] : defaultCellValue;

                                    // SNAPDEAL - Get null if no brand value ::: START
                                    if (clientAttributeToGetNullIfNoBrandValue?.[clientId]?.includes(value)) {
                                        finalVal = !(product?.data?.[value]?.value ?? vari?.data?.[value]?.value)
                                            ? defaultCellValue
                                            : finalVal;
                                    }
                                    if (clientCatalogusValueInsteadOfChannelValue?.[clientId]?.includes(value)) {
                                        finalVal =
                                            product?.data?.[value]?.value ??
                                            vari?.data?.[value]?.value ??
                                            finalVal ??
                                            '';
                                    }
                                    // SNAPDEAL - Get null if no brand value ::: END

                                    rowFinData[attrKey] =
                                        ['TIRA'].includes(clientId) && finalVal.includes('NA')
                                            ? defaultCellValue
                                            : finalVal;
                                } else if (type == 'measurement_mapper') {
                                    try {
                                        let convertedValue = convert(
                                            parseFloat(rowInitData[value]?.replace(/[^0-9.]/g, ''))
                                        )
                                            .from(nextStep.source_unit)
                                            .to(nextStep.target_unit);
                                        rowFinData[attrKey] = parseFloat(convertedValue?.toFixed(3));
                                    } catch (err) {
                                        rowFinData[attrKey] = defaultCellValue;
                                    }
                                } else {
                                    //Channel value > Base catalog value
                                    let finalVal = value in rowInitData ? rowInitData[value] : defaultCellValue;
                                    rowFinData[attrKey] =
                                        ['TIRA'].includes(clientId) && finalVal.includes('NA')
                                            ? defaultCellValue
                                            : finalVal;
                                }
                                if (config?.validations?.min_character_limit) {
                                    attributeWithValidations[attrKey] = {
                                        ...(attributeWithValidations[attrKey] ?? {}),
                                        min_character_limit: Number(config?.validations?.min_character_limit) ?? 0,
                                    };
                                }

                                if (config?.validations?.max_character_limit) {
                                    attributeWithValidations[attrKey] = {
                                        ...(attributeWithValidations[attrKey] ?? {}),
                                        max_character_limit: Number(config?.validations?.max_character_limit) ?? 0,
                                    };
                                }

                                if (config?.validations?.max_value) {
                                    attributeWithValidations[attrKey] = {
                                        ...(attributeWithValidations[attrKey] ?? {}),
                                        max_value: Number(config?.validations?.max_value) ?? 0,
                                    };
                                }

                                if (config?.validations?.min_value) {
                                    attributeWithValidations[attrKey] = {
                                        ...(attributeWithValidations[attrKey] ?? {}),
                                        min_value: Number(config?.validations?.min_value) ?? 0,
                                    };
                                }

                                if (config?.validations?.decimal_places) {
                                    attributeWithValidations[attrKey] = {
                                        ...(attributeWithValidations[attrKey] ?? {}),
                                        decimal_places: Number(config?.validations?.decimal_places) ?? 0,
                                    };
                                }

                                if (config?.validations?.type) {
                                    attributeWithValidations[attrKey] = {
                                        ...(attributeWithValidations[attrKey] ?? {}),
                                        type: config?.validations?.type,
                                    };
                                }
                            });
                        } else {
                            console.log('MAPPER INFO NOT PRESENT', mapperInfo);
                        }

                        // Get updated data from marketplace_data
                        const productMarketplaceData = product?.marketplace_data?.[channel.toUpperCase()]?.data ?? {};
                        const variantMarketplaceData = vari?.marketplace_data?.[channel.toUpperCase()]?.data ?? {};
                        rowFinData = {
                            ...rowFinData,
                            ...productMarketplaceData, // This will override the values of attributes that are present inside rowFinData
                            ...variantMarketplaceData,
                        };

                        if (data.assignProductAndVariantId) {
                            rowFinData._id = vari?._id;
                            rowFinData.productId = vari?.product_info;
                        }

                        // Assign variant marketplace metadata (like ASIN, SKU ID, etc.)
                        if (data.assignVariantMarketplaceMetadata) {
                            rowFinData.marketplaceMetadata =
                                vari?.marketplace_data?.[channel.toUpperCase()]?.metadata ?? null;
                        }

                        //Preparing Images
                        let { orderedImages } = orderImages(
                            channel,
                            productImages,
                            vari,
                            mapperInfo,
                            clientImageTags,
                            profileImageTags,
                            productTypeImageConstants,
                            clientImageConstants
                        );

                        let finImages = {};
                        const imageTagConfig = { ...clientImageTags, ...profileImageTags };
                        const imageKeySet = new Set(Object.keys(imageTagConfig));

                        Object.keys(orderedImages).forEach((key) => {
                            if (imageKeySet.has(key) && orderedImages[key]) {
                                finImages[key] = orderedImages[key];
                            }
                        });

                        //Preparing Export data -
                        let images = [...variantImages, ...productImages];
                        if (channel == 'SHOPIFY' && !data.shopifyApiExport) {
                            let handle = rowFinData?.['Handle'] ?? defaultCellValue;
                            let variantsColumn;
                            
                            const defaultColumns = shopifySheetConfig?.['default']?.variantsColumn ?? [];
                            const templateColumns = outputTemplate?.config?.meta_config?.shopify_row_data_columns ?? [];

                            const isDefaultColumns = !templateColumns.length || (defaultColumns.every((col) => templateColumns.includes(col)) && defaultColumns.length === templateColumns.length);

                            if(isDefaultColumns && shopifySheetConfig?.[clientId]?.variantsColumn) {
                                variantsColumn = shopifySheetConfig?.[clientId]?.variantsColumn;
                            } else {
                                variantsColumn = templateColumns.length ? templateColumns : defaultColumns;
                            }

                            if (handle) {
                                if (handle in childrenClubbedOnVariantDimension) {
                                    let thisVariantData = {};
                                    if (clientId === 'CS4K') {
                                        thisVariantData = rowFinData;
                                    } else {
                                        variantsColumn.map((k) => {
                                            thisVariantData[k] = rowFinData?.[k] ?? defaultCellValue;
                                        });
                                    }

                                    let varData = _.cloneDeep(
                                        childrenClubbedOnVariantDimension?.[handle]?.[shopifyVarDimCount[handle]] ?? {}
                                    );

                                    if (_.keys(varData).length) {
                                        childrenClubbedOnVariantDimension[handle][shopifyVarDimCount[handle]] = {
                                            ...varData,
                                            ...thisVariantData,
                                        };
                                    } else {
                                        childrenClubbedOnVariantDimension[handle].push(thisVariantData);
                                    }
                                    shopifyVarDimCount[handle]++;
                                } else {
                                    childrenClubbedOnVariantDimension[handle] = [];
                                    shopifyVarDimCount[handle] = 1;

                                    let imgArr = _.keys(finImages).length ? _.values(finImages) : images;

                                    let maxImageCount = shopifySheetConfig?.[clientId]?.maxImages ?? imgArr.length;

                                    for (let i = 0; i < (maxImageCount || 1); i++) {
                                        let imageData = {};
                                        let imgData = imgArr?.[i] ?? {};
                                        let imgUrl =
                                            typeof imgData == 'object'
                                                ? imgData?.url
                                                : typeof imgData == 'string'
                                                  ? imgData
                                                  : defaultCellValue;
                                        //Images
                                        if (maxImageCount && i < maxImageCount) {
                                            imageData = {
                                                'Image Src': imgUrl,
                                                'Image Position': i + 1,
                                            };
                                            if (
                                                shopifySheetConfig?.[clientId] &&
                                                'variantImageIndex' in shopifySheetConfig[clientId]
                                            ) {
                                                imageData['Variant Image'] =
                                                    imgArr[shopifySheetConfig?.[clientId]['variantImageIndex']]?.url ??
                                                    defaultCellValue;
                                            }
                                        }
                                        let data = i == 0 ? { ...rowFinData, ...imageData } : { ...imageData };
                                        childrenClubbedOnVariantDimension[handle].push(data);
                                    }
                                }
                            } else {
                                shopifyProductsWithMultipleImagesAndNoHandle++;
                            }
                        } else if (channel in channelsWithAttributesInMultipleRows) {
                            let sameValueColumns =
                                channelsWithAttributesInMultipleRows[channel]?.sameValueColumns ?? [];
                            let arrayValueColumns =
                                channelsWithAttributesInMultipleRows[channel]?.arrayValueColumns ?? [];
                            let exportNewRows = [];
                            let arrayDataKeyValues = {};
                            let firstRowArrValues = {};
                            let sameValueData = {};
                            let rowCount = 1;
                            arrayValueColumns.map((k) => {
                                if (k in rowFinData) {
                                    arrayDataKeyValues[k] =
                                        typeof rowFinData[k] == 'string'
                                            ? rowFinData[k].split(';')
                                            : _.isArray(rowFinData[k])
                                              ? rowFinData[k]
                                              : [];
                                    firstRowArrValues[k] = arrayDataKeyValues[k]?.[0] ?? defaultCellValue;
                                    if (rowCount < arrayDataKeyValues[k].length) {
                                        rowCount = arrayDataKeyValues[k].length;
                                    }
                                }
                            });
                            sameValueColumns.map((k) => {
                                sameValueData[k] = rowFinData?.[k] ?? defaultCellValue;
                            });

                            //Creating Rows
                            for (let r = 0; r < rowCount; r++) {
                                if (r == 0) {
                                    exportNewRows.push({
                                        ...columnCodeEmptyObj,
                                        ...rowFinData,
                                        ...firstRowArrValues,
                                        ...(typeof finImages == 'object' ? finImages : {}),
                                    });
                                } else {
                                    let rowData = { ...sameValueData };
                                    Object.keys(arrayDataKeyValues).map((k) => {
                                        rowData[k] = arrayDataKeyValues[k]?.[r] ?? defaultCellValue;
                                    });
                                    exportNewRows.push(rowData);
                                }
                            }
                            //Pushing to final Data
                            childrenExportData.push(...exportNewRows);
                        } else {
                            childrenExportData.push({
                                ...(channelsWithCodeAsHeader.includes(channel)
                                    ? columnCodeEmptyObj
                                    : columnLabelEmptyObj),
                                ...rowFinData,
                                ...(typeof finImages == 'object' ? finImages : {}),
                            });
                        }

                        //Preparing Parent Data from 1st child
                        if (
                            variantIndex == 0 &&
                            (channelsWithParentChildRelation.includes(channel) || channelsWithParentChildRelationCustom.includes(channel)) &&
                            (parentKeyInfo?.[`${channel}_${clientId}`] ||
                                parentKeyInfo?.[channel] ||
                                parentKeyInfo?.[outputTemplateName])
                        ) 
                        {
                            let parentMapper =
                                parentKeyInfo?.[outputTemplateName] ??
                                parentKeyInfo?.[`${channel}_${clientId}`] ??
                                parentKeyInfo?.[channel] ??
                                null;

                            if (typeof parentMapper == 'object') {
                                let parentInfo = {};
                                for (const [key, value] of Object.entries(parentMapper)) {
                                    try {
                                        if (key in columnCodeEmptyObj) {
                                            if (value?.toLowerCase() == '#child') {
                                                parentInfo[key] = childrenExportData?.[0]?.[key] ?? defaultCellValue;
                                            } else {
                                                parentInfo[key] = eval(value);
                                            }
                                        }
                                    } catch (err) {
                                        console.error('eval() function error: ', err);
                                    }
                                }
                                parentExportData = [parentInfo];
                            } else {
                                logger.log(
                                    'error',
                                    `ERROR: [EXPORT JOB HELPER] | ${jobId}] ${channel} ${outputTemplateName} - No Parent row mapping present`
                                );
                            }
                        }
                    }
                });
            }

            //Pushing data to export array
            if (channel == 'SHOPIFY' && !data.shopifyApiExport) {
                Object.keys(childrenClubbedOnVariantDimension).map((k) => {
                    let data = childrenClubbedOnVariantDimension[k];
                    //adding handle to each row (if missing in any)
                    let updatedData = data.map((obj) => ({ ...obj, Handle: k }));
                    if (_.isArray(updatedData)) {
                        exportData.push(...updatedData);
                    }
                });
            } else {
                exportData.push(...parentExportData, ...childrenExportData);
            }
        });

        //Shopify
        if (shopifyProductsWithMultipleImagesAndNoHandle) {
            jobRemarks.push(
                `Skipped ${shopifyProductsWithMultipleImagesAndNoHandle} product since they don't have handle!`
            );
        }

        return {
            mapperInfo,
            exportData,
            jobRemarks,
            columnCodeLabelMapper,
            columnPossibleValues,
            columnLabelCodeMapper,
            attributeWithValidations,
            columnPossibleValuesInLowerCase,
        };
    } catch (error) {
        console.error(error);
        // Rethrow the error so it bubbles up with the original error message
        throw error;
    }
}

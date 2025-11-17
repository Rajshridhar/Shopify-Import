/* Enums */

export const platformAccessEnum = {
    ADMIN: ['TEMPLATE_VIEW', 'TEMPLATE_EDIT'],
    CLIENT: ['CLIENT_CONFIG_VIEW', 'CLIENT_CONFIG_EDIT'],
    PRODUCT_TYPE: ['PRODUCT_TYPE_VIEW', 'PRODUCT_TYPE_EDIT'],
    ATTRIBUTE: ['ATTRIBUTE_VIEW', 'ATTRIBUTE_EDIT'],
    PRODUCT: ['PRODUCT_VIEW', 'PRODUCT_EDIT'],
    DAM: ['DAM_ASSET_UPLOAD', 'DAM_ASSET_DELETE'],
    BYC: [],
};

/**
 * Access mapper - Access rules will apply to userType present in this Mapper
 */

export const userTypeAccessMapper = {
    CLIENT_DAM: [...platformAccessEnum.DAM, 'ATTRIBUTE_VIEW', 'PRODUCT_TYPE_VIEW', 'PRODUCT_VIEW'],
};

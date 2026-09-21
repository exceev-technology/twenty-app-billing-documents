import { defineObject } from 'twenty-sdk/define';
import { boolean, fieldId, objectId, oneToMany, select, text } from '../schema/fields.ts';
import { TAX_CATEGORIES } from '../schema/options.ts';

const O = 'billingTaxCode';

/**
 * A tax a line can carry: one or more components (GST plus QST), and the
 * wording the law wants printed when it applies (exemption, reverse charge).
 */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingTaxCodes',
  labelSingular: 'Tax code',
  labelPlural: 'Tax codes',
  description: 'A tax a line can carry, with its components and the note printed when it applies.',
  icon: 'IconReceiptTax',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', icon: 'IconAbc' }),
    text(O, 'code', { label: 'Code', description: 'Stable key, for example "fr.tva.20". Used by the preset seeder.', icon: 'IconKey' }),
    text(O, 'countryCode', { label: 'Country', description: 'ISO 3166-1 alpha-2 code.', icon: 'IconFlag' }),
    select(O, 'category', { label: 'Category', icon: 'IconCategory' }, TAX_CATEGORIES, 'STANDARD'),
    text(O, 'printNote', { label: 'Printed note', description: 'Printed on documents that use this code, for example an exemption article.', icon: 'IconFileText' }),
    boolean(O, 'isActive', { label: 'Active', description: 'Inactive codes stay on old documents but are not offered.', icon: 'IconToggleRight' }, true),
    oneToMany(O, 'components', { label: 'Components', icon: 'IconPercentage' }, { object: 'billingTaxComponent', inverse: 'taxCode' }),
    oneToMany(O, 'catalogItems', { label: 'Catalog items', icon: 'IconPackage' }, { object: 'billingCatalogItem', inverse: 'taxCode' }),
  ],
});

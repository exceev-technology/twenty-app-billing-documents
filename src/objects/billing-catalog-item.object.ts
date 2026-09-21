import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { boolean, currency, fieldId, manyToOne, objectId, oneToMany, select, text } from '../schema/fields.ts';
import { UNITS } from '../schema/options.ts';

const O = 'billingCatalogItem';

/** A product or service. Picking one fills a line; the line stays editable. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingCatalogItems',
  labelSingular: 'Catalog item',
  labelPlural: 'Catalog items',
  description: 'A product or service with a default price, unit and tax code.',
  icon: 'IconPackage',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', icon: 'IconAbc' }),
    text(O, 'description', { label: 'Description', icon: 'IconAlignLeft' }),
    text(O, 'sku', { label: 'SKU', icon: 'IconBarcode' }),
    select(O, 'unit', { label: 'Unit', icon: 'IconRuler' }, UNITS, 'UNIT'),
    currency(O, 'unitPrice', { label: 'Unit price', icon: 'IconCurrencyDollar' }),
    manyToOne(O, 'taxCode', { label: 'Tax code', icon: 'IconReceiptTax' }, { object: 'billingTaxCode', inverse: 'catalogItems', onDelete: OnDeleteAction.SET_NULL }),
    boolean(O, 'isActive', { label: 'Active', icon: 'IconToggleRight' }, true),
    oneToMany(O, 'quoteLines', { label: 'Quote lines', icon: 'IconList' }, { object: 'billingQuoteLine', inverse: 'catalogItem' }),
    oneToMany(O, 'invoiceLines', { label: 'Invoice lines', icon: 'IconList' }, { object: 'billingInvoiceLine', inverse: 'catalogItem' }),
    oneToMany(O, 'creditNoteLines', { label: 'Credit note lines', icon: 'IconList' }, { object: 'billingCreditNoteLine', inverse: 'catalogItem' }),
  ],
});

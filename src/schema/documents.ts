import { OnDeleteAction } from 'twenty-sdk/define';
import {
  boolean, currency, date, decimal, files, integer, manyToOne, oneToMany, rawJson, richText, select, text,
  type ObjectField, type Option,
} from './fields.ts';
import { LANGUAGES, UNITS } from './options.ts';

/**
 * Quotes, invoices and credit notes are separate objects so Twenty gives each
 * its own menu, views and record page. They share this shape, and the engine
 * and renderer read all three through one normalized form.
 */
export type DocumentShape = {
  object: string;
  lineObject: string;
  lineParentField: string;
  issuerInverse: string;
  buyerInverse: string;
  statuses: readonly Option[];
};

export function documentFields(d: DocumentShape): ObjectField[] {
  const O = d.object;
  return [
    text(O, 'subject', { label: 'Subject', icon: 'IconFileText' }),
    text(O, 'number', { label: 'Number', description: 'Set when the document is numbered. Never typed by hand.', icon: 'IconHash' }),
    select(O, 'status', { label: 'Status', icon: 'IconProgressCheck' }, d.statuses, 'DRAFT'),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: d.issuerInverse, onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'company', { label: 'Company', icon: 'IconBuildingSkyscraper' }, { object: 'company', inverse: d.buyerInverse, onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'person', { label: 'Person', icon: 'IconUser' }, { object: 'person', inverse: d.buyerInverse, onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'issueDate', { label: 'Issue date', icon: 'IconCalendar' }),
    text(O, 'currencyCode', { label: 'Currency', description: 'ISO 4217 code. Every line must use it.', icon: 'IconCurrencyDollar' }),
    boolean(O, 'pricesIncludeTax', { label: 'Prices include tax', icon: 'IconReceiptTax' }, false),
    select(O, 'language', { label: 'Language', description: 'Empty: the profile’s language.', icon: 'IconLanguage' }, LANGUAGES),
    richText(O, 'notes', { label: 'Notes', icon: 'IconNotes' }),
    currency(O, 'subtotal', { label: 'Subtotal', icon: 'IconSum' }),
    currency(O, 'discountTotal', { label: 'Discount', icon: 'IconDiscount' }),
    currency(O, 'taxTotal', { label: 'Tax', icon: 'IconReceiptTax' }),
    currency(O, 'total', { label: 'Total', icon: 'IconCash' }),
    files(O, 'pdf', { label: 'PDF', icon: 'IconFileTypePdf' }, 10),
    rawJson(O, 'snapshot', { label: 'Snapshot', description: 'Seller, buyer, identifiers and taxes, frozen when the document is numbered.', icon: 'IconLock' }),
    text(O, 'documentHash', { label: 'Document hash', icon: 'IconFingerprint' }),
    oneToMany(O, 'lines', { label: 'Lines', icon: 'IconList' }, { object: d.lineObject, inverse: d.lineParentField }),
  ];
}

export type LineShape = {
  object: string;
  parentObject: string;
  parentField: string;
  parentLabel: string;
  catalogInverse: string;
  taxCodeInverse: string;
};

export function lineFields(l: LineShape): ObjectField[] {
  const O = l.object;
  return [
    text(O, 'description', { label: 'Description', icon: 'IconAlignLeft' }),
    manyToOne(O, l.parentField, { label: l.parentLabel, icon: 'IconFileText' }, { object: l.parentObject, inverse: 'lines', onDelete: OnDeleteAction.CASCADE }),
    integer(O, 'sortOrder', { label: 'Order', icon: 'IconSortAscending' }),
    manyToOne(O, 'catalogItem', { label: 'Catalog item', icon: 'IconPackage' }, { object: 'billingCatalogItem', inverse: l.catalogInverse, onDelete: OnDeleteAction.SET_NULL }),
    decimal(O, 'quantity', { label: 'Quantity', icon: 'IconNumbers' }, 3),
    select(O, 'unit', { label: 'Unit', icon: 'IconRuler' }, UNITS, 'UNIT'),
    currency(O, 'unitPrice', { label: 'Unit price', description: 'Net or gross, per the document’s price basis.', icon: 'IconCurrencyDollar' }),
    decimal(O, 'discountPercent', { label: 'Discount (%)', icon: 'IconDiscount' }, 2),
    manyToOne(O, 'taxCode', { label: 'Tax code', icon: 'IconReceiptTax' }, { object: 'billingTaxCode', inverse: l.taxCodeInverse, onDelete: OnDeleteAction.SET_NULL }),
    date(O, 'periodStart', { label: 'Period start', icon: 'IconCalendar' }),
    date(O, 'periodEnd', { label: 'Period end', icon: 'IconCalendar' }),
    currency(O, 'lineTotal', { label: 'Line total', icon: 'IconSum' }),
  ];
}

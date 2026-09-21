import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import {
  address, boolean, emails, fieldId, files, links, manyToOne, objectId, oneToMany, phones, richText, text,
} from '../schema/fields.ts';

const O = 'billingIssuer';

/** You, the seller. A workspace may have several. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingIssuers',
  labelSingular: 'Issuer',
  labelPlural: 'Issuers',
  description: 'The business that issues quotes, invoices and credit notes.',
  icon: 'IconBuildingStore',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Trading name', icon: 'IconAbc' }),
    text(O, 'legalName', { label: 'Legal name', icon: 'IconAbc' }),
    text(O, 'legalForm', { label: 'Legal form', description: 'Free text: legal forms differ by country.', icon: 'IconBuildingBank' }),
    manyToOne(O, 'profile', { label: 'Profile', icon: 'IconWorld' }, { object: 'billingProfile', inverse: 'issuers', onDelete: OnDeleteAction.SET_NULL }),
    address(O, 'address', { label: 'Address', icon: 'IconMap' }),
    emails(O, 'emails', { label: 'Emails', icon: 'IconMail' }),
    phones(O, 'phones', { label: 'Phones', icon: 'IconPhone' }),
    links(O, 'website', { label: 'Website', icon: 'IconLink' }),
    files(O, 'logo', { label: 'Logo', icon: 'IconPhoto' }, 1),
    text(O, 'defaultCurrency', { label: 'Default currency', description: "ISO 4217 code. Empty: the profile's.", icon: 'IconCurrencyDollar' }),
    richText(O, 'paymentDetails', { label: 'Payment details', description: 'Free text: bank formats differ by country.', icon: 'IconBuildingBank' }),
    text(O, 'accentColor', { label: 'Accent colour', description: '#RRGGBB.', icon: 'IconPalette' }),
    text(O, 'footerNote', { label: 'Footer note', icon: 'IconAlignLeft' }),
    links(O, 'verificationBaseUrl', { label: 'Verification link', description: "Used when the profile's QR mode is \"Link with payload\".", icon: 'IconQrcode' }),
    boolean(O, 'isDefault', { label: 'Default issuer', icon: 'IconStar' }, false),
    oneToMany(O, 'identifiers', { label: 'Legal identifiers', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'issuer' }),
    oneToMany(O, 'quotes', { label: 'Quotes', icon: 'IconFileDescription' }, { object: 'billingQuote', inverse: 'issuer' }),
    oneToMany(O, 'invoices', { label: 'Invoices', icon: 'IconFileInvoice' }, { object: 'billingInvoice', inverse: 'issuer' }),
    oneToMany(O, 'creditNotes', { label: 'Credit notes', icon: 'IconReceiptRefund' }, { object: 'billingCreditNote', inverse: 'issuer' }),
    oneToMany(O, 'sequences', { label: 'Numbering sequences', icon: 'IconListNumbers' }, { object: 'billingSequence', inverse: 'issuer' }),
  ],
});

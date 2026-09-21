import { defineObject } from 'twenty-sdk/define';
import { boolean, date, fieldId, integer, objectId, oneToMany, richText, select, text } from '../schema/fields.ts';
import { LANGUAGES, NUMBERING_RESETS, QR_MODES, ROUNDING_MODES } from '../schema/options.ts';

const O = 'billingProfile';

/**
 * Country rules: what a document must say and how it is numbered, for one
 * country. The app seeds one per supported country; users edit or copy them.
 */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingProfiles',
  labelSingular: 'Billing profile',
  labelPlural: 'Billing profiles',
  description: 'Country rules for documents: identifiers, mentions, numbering and rounding.',
  icon: 'IconWorld',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', icon: 'IconAbc' }),
    text(O, 'presetKey', { label: 'Preset key', description: 'Key of the preset this profile was seeded from. Empty on profiles you create.', icon: 'IconKey' }),
    text(O, 'countryCode', { label: 'Country', description: 'ISO 3166-1 alpha-2 code. Empty for the generic profile.', icon: 'IconFlag' }),
    select(O, 'language', { label: 'Language', description: 'Language documents are printed in.', icon: 'IconLanguage' }, LANGUAGES, 'EN'),
    text(O, 'locale', { label: 'Locale', description: 'BCP 47 tag for number and date formatting, for example "fr-MA".', icon: 'IconWorld' }),
    text(O, 'defaultCurrency', { label: 'Default currency', description: 'ISO 4217 code.', icon: 'IconCurrencyDollar' }),
    select(O, 'roundingMode', { label: 'Tax rounding', icon: 'IconMathFunction' }, ROUNDING_MODES, 'PER_RATE_ON_TOTAL'),
    boolean(O, 'amountInWords', { label: 'Total in words', description: 'Print the total in words, when the language supports it.', icon: 'IconAbc' }, false),
    text(O, 'invoiceTitle', { label: 'Invoice title', description: "Replaces the printed title, for example \"Tax Invoice\". Empty: the language default.", icon: 'IconHeading' }),
    text(O, 'creditNoteTitle', { label: 'Credit note title', description: 'Replaces the printed title. Empty: the language default.', icon: 'IconHeading' }),
    text(O, 'quoteNumberPattern', { label: 'Quote number pattern', description: 'Tokens: {YYYY} {YY} {MM} {SEQ:n}.', icon: 'IconHash' }),
    text(O, 'invoiceNumberPattern', { label: 'Invoice number pattern', description: 'Tokens: {YYYY} {YY} {MM} {SEQ:n}.', icon: 'IconHash' }),
    text(O, 'creditNoteNumberPattern', { label: 'Credit note number pattern', description: 'Tokens: {YYYY} {YY} {MM} {SEQ:n}.', icon: 'IconHash' }),
    select(O, 'numberingReset', { label: 'Numbering restarts', icon: 'IconRefresh' }, NUMBERING_RESETS, 'YEARLY'),
    integer(O, 'defaultPaymentTermDays', { label: 'Payment term (days)', icon: 'IconCalendarDue' }),
    integer(O, 'defaultQuoteValidityDays', { label: 'Quote validity (days)', icon: 'IconCalendarTime' }),
    richText(O, 'quoteMentions', { label: 'Quote mentions', description: 'Printed on every quote.', icon: 'IconFileText' }),
    richText(O, 'invoiceMentions', { label: 'Invoice mentions', description: 'Printed on every invoice.', icon: 'IconFileText' }),
    richText(O, 'creditNoteMentions', { label: 'Credit note mentions', description: 'Printed on every credit note.', icon: 'IconFileText' }),
    select(O, 'qrMode', { label: 'QR code', icon: 'IconQrcode' }, QR_MODES, 'NONE'),
    text(O, 'complianceNote', { label: 'Compliance note', description: 'What the PDF does not cover in this country. Shown here, never printed.', icon: 'IconAlertTriangle' }),
    date(O, 'verifiedOn', { label: 'Verified on', description: 'When a seeded preset was last checked against official sources.', icon: 'IconCalendarCheck' }),
    oneToMany(O, 'identifierTypes', { label: 'Identifier types', icon: 'IconIdBadge2' }, { object: 'billingIdentifierType', inverse: 'profile' }),
    oneToMany(O, 'issuers', { label: 'Issuers', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'profile' }),
  ],
});

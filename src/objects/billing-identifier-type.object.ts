import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { boolean, fieldId, integer, manyToOne, objectId, oneToMany, select, text } from '../schema/fields.ts';
import { APPLIES_TO } from '../schema/options.ts';

const O = 'billingIdentifierType';

/** One legal identifier a profile uses, and when it is required. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingIdentifierTypes',
  labelSingular: 'Identifier type',
  labelPlural: 'Identifier types',
  description: 'A legal identifier a profile prints, such as a VAT number, and when it is required.',
  icon: 'IconIdBadge2',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', description: 'Printed label, for example "VAT number".', icon: 'IconAbc' }),
    text(O, 'key', { label: 'Key', description: 'Stable key, for example "fr.siren". Used by the preset seeder.', icon: 'IconKey' }),
    manyToOne(O, 'profile', { label: 'Profile', icon: 'IconWorld' }, { object: 'billingProfile', inverse: 'identifierTypes', onDelete: OnDeleteAction.CASCADE }),
    select(O, 'appliesTo', { label: 'Applies to', icon: 'IconUsers' }, APPLIES_TO, 'SELLER'),
    boolean(O, 'requiredForSeller', { label: 'Required for the seller', description: 'Issuing is refused while the seller has no value.', icon: 'IconAlertCircle' }, false),
    boolean(O, 'requiredForBusinessBuyer', { label: 'Required for a domestic business buyer', description: "Issuing is refused while a company buyer in the profile's country, or of unknown country, has no value. Foreign and person buyers are never required to have one.", icon: 'IconAlertCircle' }, false),
    boolean(O, 'printOnDocuments', { label: 'Print on documents', icon: 'IconPrinter' }, true),
    boolean(O, 'includeInQr', { label: 'Include in QR code', icon: 'IconQrcode' }, false),
    text(O, 'validationPattern', { label: 'Validation pattern', description: 'Optional regular expression the value must match.', icon: 'IconRegex' }),
    integer(O, 'sortOrder', { label: 'Print order', icon: 'IconSortAscending' }),
    oneToMany(O, 'identifiers', { label: 'Values', icon: 'IconId' }, { object: 'billingIdentifier', inverse: 'identifierType' }),
  ],
});

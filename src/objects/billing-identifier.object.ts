import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { fieldId, manyToOne, objectId, text } from '../schema/fields.ts';

const O = 'billingIdentifier';

/**
 * One identifier value, owned by an issuer, a company or a person: exactly one
 * of the three. Twenty cannot enforce that, so the issue gate checks it.
 */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingIdentifiers',
  labelSingular: 'Legal identifier',
  labelPlural: 'Legal identifiers',
  description: 'The value of a legal identifier for an issuer, a company or a person.',
  icon: 'IconId',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'value'),
  fields: [
    text(O, 'value', { label: 'Value', icon: 'IconId' }),
    manyToOne(O, 'identifierType', { label: 'Type', icon: 'IconIdBadge2' }, { object: 'billingIdentifierType', inverse: 'identifiers', onDelete: OnDeleteAction.SET_NULL }),
    manyToOne(O, 'issuer', { label: 'Issuer', icon: 'IconBuildingStore' }, { object: 'billingIssuer', inverse: 'identifiers', onDelete: OnDeleteAction.CASCADE }),
    manyToOne(O, 'company', { label: 'Company', icon: 'IconBuildingSkyscraper' }, { object: 'company', inverse: 'billingIdentifiers', onDelete: OnDeleteAction.CASCADE }),
    manyToOne(O, 'person', { label: 'Person', icon: 'IconUser' }, { object: 'person', inverse: 'billingIdentifiers', onDelete: OnDeleteAction.CASCADE }),
  ],
});

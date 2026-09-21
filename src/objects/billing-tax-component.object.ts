import { defineObject, OnDeleteAction } from 'twenty-sdk/define';
import { boolean, decimal, fieldId, integer, manyToOne, objectId, text } from '../schema/fields.ts';

const O = 'billingTaxComponent';

/** One tax inside a tax code, recapped on its own line of the document. */
export default defineObject({
  universalIdentifier: objectId(O),
  nameSingular: O,
  namePlural: 'billingTaxComponents',
  labelSingular: 'Tax component',
  labelPlural: 'Tax components',
  description: 'One tax inside a tax code, such as GST or QST.',
  icon: 'IconPercentage',
  labelIdentifierFieldMetadataUniversalIdentifier: fieldId(O, 'name'),
  fields: [
    text(O, 'name', { label: 'Name', description: 'Printed in the tax recap: "VAT", "GST", "CGST".', icon: 'IconAbc' }),
    manyToOne(O, 'taxCode', { label: 'Tax code', icon: 'IconReceiptTax' }, { object: 'billingTaxCode', inverse: 'components', onDelete: OnDeleteAction.CASCADE }),
    decimal(O, 'rate', { label: 'Rate (%)', icon: 'IconPercentage' }, 4),
    boolean(O, 'compound', { label: 'Compound', description: 'Computed on the base plus the components before it.', icon: 'IconStack2' }, false),
    integer(O, 'sortOrder', { label: 'Order', icon: 'IconSortAscending' }),
  ],
});

import { defineView, getFieldUniversalIdentifier, ViewFilterOperand, ViewSortDirection, ViewType } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { fieldId, objectId, type Option } from './fields.ts';

/** The system fields a view may sort by: Twenty declares them on every object, under identifiers the SDK derives. */
const SYSTEM_FIELDS: readonly string[] = ['createdAt', 'updatedAt'];

const viewFieldId = (object: string, field: string): string =>
  SYSTEM_FIELDS.includes(field)
    ? getFieldUniversalIdentifier({ applicationUniversalIdentifier: id('app'), objectUniversalIdentifier: objectId(object), name: field })
    : fieldId(object, field);

export type ViewFilter = { field: string; operand: ViewFilterOperand; value: string };

export type ViewSpec = {
  /** The registry keys' last part: `view.<key>`, `viewField.<key>.<field>`… */
  key: string;
  object: string;
  name: string;
  icon: string;
  position: number;
  /** A kanban with a column per option of this select field, in the options' order; a table otherwise. */
  kanbanBy?: { field: string; options: readonly Option[] };
  /** Shown after the label, in order. */
  fields: readonly string[];
  filters?: readonly ViewFilter[];
  sort: { field: string; direction: ViewSortDirection };
};

/** A select filter: one of these option values. Twenty reads the value as a JSON array of option values. */
export const statusIs = (...values: string[]): ViewFilter => ({ field: 'status', operand: ViewFilterOperand.IS, value: JSON.stringify(values) });

/** A date before today. The operand takes no value. */
export const inPast = (field: string): ViewFilter => ({ field, operand: ViewFilterOperand.IS_IN_PAST, value: '' });

/** One of the app's ready-made views (flows spec §9): the label first, its fields, its filters, one sort. */
export function billingView(spec: ViewSpec) {
  return defineView({
    universalIdentifier: id(`view.${spec.key}`),
    name: spec.name,
    objectUniversalIdentifier: objectId(spec.object),
    type: spec.kanbanBy ? ViewType.KANBAN : ViewType.TABLE,
    icon: spec.icon,
    position: spec.position,
    ...(spec.kanbanBy
      ? {
          mainGroupByFieldMetadataUniversalIdentifier: fieldId(spec.object, spec.kanbanBy.field),
          groups: spec.kanbanBy.options.map(([value], position) => ({
            universalIdentifier: id(`viewGroup.${spec.key}.${value}`),
            fieldValue: value,
            position,
            isVisible: true,
          })),
        }
      : {}),
    fields: ['subject', ...spec.fields].map((field, position) => ({
      universalIdentifier: id(`viewField.${spec.key}.${field}`),
      fieldMetadataUniversalIdentifier: viewFieldId(spec.object, field),
      position,
      isVisible: true,
    })),
    filters: (spec.filters ?? []).map((filter) => ({
      universalIdentifier: id(`viewFilter.${spec.key}.${filter.field}`),
      fieldMetadataUniversalIdentifier: fieldId(spec.object, filter.field),
      operand: filter.operand,
      value: filter.value,
    })),
    sorts: [{
      universalIdentifier: id(`viewSort.${spec.key}.${spec.sort.field}`),
      fieldMetadataUniversalIdentifier: viewFieldId(spec.object, spec.sort.field),
      direction: spec.sort.direction,
    }],
  });
}

import { FieldType, NumberDataType, OnDeleteAction, RelationType, STANDARD_OBJECT } from 'twenty-sdk/define';
import type { defineField, defineObject } from 'twenty-sdk/define';
import { id } from '../lib/id.ts';
import { STANDARD_TARGETS, type StandardTarget } from './names.ts';

/**
 * Field builders. Every object, field and option identifier comes from the
 * registry, by a key derived from its names, so one builder call declares a
 * field and `npm run ids:sync` registers whatever is new.
 */

export type ObjectConfig = Parameters<typeof defineObject>[0];
export type ObjectField = ObjectConfig['fields'][number];
export type FieldConfig = Parameters<typeof defineField>[0];

export type Meta = { label: string; description?: string; icon?: string };
export type Color = 'red' | 'orange' | 'yellow' | 'green' | 'turquoise' | 'sky' | 'blue' | 'purple' | 'pink' | 'gray';
export type Option = readonly [value: string, label: string, color: Color];

export const objectId = (object: string): string => id(`object.${object}`);
export const fieldId = (object: string, field: string): string => id(`field.${object}.${field}`);
export const optionId = (object: string, field: string, value: string): string =>
  id(`option.${object}.${field}.${value}`);

function isStandard(object: string): object is StandardTarget {
  return (STANDARD_TARGETS as readonly string[]).includes(object);
}

/** The universal identifier of one of the app's objects, or of a standard one. */
export function targetObjectId(object: string): string {
  return isStandard(object) ? STANDARD_OBJECT[object].universalIdentifier : objectId(object);
}

function field(
  object: string,
  name: string,
  type: FieldType,
  meta: Meta,
  extra: Record<string, unknown> = {},
): ObjectField {
  return {
    universalIdentifier: fieldId(object, name),
    type,
    name,
    ...meta,
    isNullable: true,
    ...extra,
  } as unknown as ObjectField;
}

export const text = (o: string, n: string, m: Meta) => field(o, n, FieldType.TEXT, m);
export const richText = (o: string, n: string, m: Meta) => field(o, n, FieldType.RICH_TEXT, m);
export const date = (o: string, n: string, m: Meta) => field(o, n, FieldType.DATE, m);
export const dateTime = (o: string, n: string, m: Meta) => field(o, n, FieldType.DATE_TIME, m);
export const currency = (o: string, n: string, m: Meta) => field(o, n, FieldType.CURRENCY, m);
export const rawJson = (o: string, n: string, m: Meta) => field(o, n, FieldType.RAW_JSON, m);
export const address = (o: string, n: string, m: Meta) => field(o, n, FieldType.ADDRESS, m);
export const emails = (o: string, n: string, m: Meta) => field(o, n, FieldType.EMAILS, m);
export const phones = (o: string, n: string, m: Meta) => field(o, n, FieldType.PHONES, m);
export const links = (o: string, n: string, m: Meta) => field(o, n, FieldType.LINKS, m);

export const boolean = (o: string, n: string, m: Meta, defaultValue: boolean) =>
  field(o, n, FieldType.BOOLEAN, m, { isNullable: false, defaultValue });

export const integer = (o: string, n: string, m: Meta) =>
  field(o, n, FieldType.NUMBER, m, { universalSettings: { dataType: NumberDataType.INT, decimals: 0 } });

export const decimal = (o: string, n: string, m: Meta, decimals: number) =>
  field(o, n, FieldType.NUMBER, m, { universalSettings: { dataType: NumberDataType.FLOAT, decimals } });

export const files = (o: string, n: string, m: Meta, maxNumberOfValues: number) =>
  field(o, n, FieldType.FILES, m, { universalSettings: { maxNumberOfValues } });

/**
 * Options get explicit identifiers. Left without one, the CLI derives it from
 * the label, so renaming a label would change the identifier and lose the
 * records holding that value on the next upgrade.
 */
export function select(o: string, n: string, m: Meta, options: readonly Option[], defaultValue?: string): ObjectField {
  if (defaultValue !== undefined && !options.some(([value]) => value === defaultValue)) {
    throw new Error(`${o}.${n}: default "${defaultValue}" is not one of its options`);
  }
  return field(o, n, FieldType.SELECT, m, {
    options: options.map(([value, label, color], position) => ({ id: optionId(o, n, value), value, label, color, position })),
    ...(defaultValue === undefined ? {} : { defaultValue: `'${defaultValue}'` }),
  });
}

export type ManyToOneTarget = { object: string; inverse: string; onDelete: OnDeleteAction };
export type OneToManyTarget = { object: string; inverse: string };

/** The side that holds the foreign key, `<name>Id`. */
export function manyToOne(o: string, n: string, m: Meta, target: ManyToOneTarget): ObjectField {
  return {
    universalIdentifier: fieldId(o, n),
    type: FieldType.RELATION,
    name: n,
    ...m,
    isNullable: true,
    relationTargetObjectMetadataUniversalIdentifier: targetObjectId(target.object),
    relationTargetFieldMetadataUniversalIdentifier: fieldId(target.object, target.inverse),
    universalSettings: { relationType: RelationType.MANY_TO_ONE, onDelete: target.onDelete, joinColumnName: `${n}Id` },
  } as unknown as ObjectField;
}

/** The collection side. Twenty requires both sides to be declared. */
export function oneToMany(o: string, n: string, m: Meta, target: OneToManyTarget): ObjectField {
  return {
    universalIdentifier: fieldId(o, n),
    type: FieldType.RELATION,
    name: n,
    ...m,
    relationTargetObjectMetadataUniversalIdentifier: targetObjectId(target.object),
    relationTargetFieldMetadataUniversalIdentifier: fieldId(target.object, target.inverse),
    universalSettings: { relationType: RelationType.ONE_TO_MANY },
  } as unknown as ObjectField;
}

/** A field the app adds to a standard object: `defineField` needs its owner. */
export function onStandard(object: StandardTarget, f: ObjectField): FieldConfig {
  return { ...f, objectUniversalIdentifier: STANDARD_OBJECT[object].universalIdentifier } as unknown as FieldConfig;
}

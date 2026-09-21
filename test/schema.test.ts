import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const standardFields = await loadEntities('fields');

const RESERVED = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'position', 'searchVector', 'type'];

type Declared = { owner: string; field: any };
const declared = new Map<string, Declared>();
for (const { result } of objects) {
  for (const field of result.config.fields) declared.set(field.universalIdentifier, { owner: result.config.universalIdentifier, field });
}
for (const { result } of standardFields) {
  declared.set(result.config.universalIdentifier, { owner: result.config.objectUniversalIdentifier, field: result.config });
}

test('there is something to check', () => {
  assert.ok(objects.length > 0, 'no object file found in src/objects');
});

test('every object and field file validates', () => {
  for (const { file, result } of [...objects, ...standardFields]) {
    assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
  }
});

test('every object API name is prefixed billing, singular and plural distinct', () => {
  for (const { file, result } of objects) {
    assert.match(result.config.nameSingular, /^billing[A-Z]/, file);
    assert.match(result.config.namePlural, /^billing[A-Z]/, file);
    assert.notEqual(result.config.nameSingular, result.config.namePlural, file);
  }
});

test('every field added to a standard object is prefixed billing', () => {
  for (const { file, result } of standardFields) assert.match(result.config.name, /^billing[A-Z]/, file);
});

test('no field takes a name Twenty reserves or already uses', () => {
  for (const { field } of declared.values()) assert.ok(!RESERVED.includes(field.name), field.name);
});

test('field names are unique within each object', () => {
  const seen = new Set<string>();
  for (const { owner, field } of declared.values()) {
    const key = `${owner}:${field.name}`;
    assert.ok(!seen.has(key), `two fields named ${field.name} on one object`);
    seen.add(key);
  }
});

test('every select option carries an explicit identifier', () => {
  for (const { field } of declared.values()) {
    for (const option of field.options ?? []) assert.ok(option.id, `${field.name}.${option.value}`);
  }
});

test('every object names its label identifier, and that field exists on it', () => {
  for (const { file, result } of objects) {
    const labelId = result.config.labelIdentifierFieldMetadataUniversalIdentifier;
    assert.ok(labelId, `${file} names no label identifier`);
    assert.ok(result.config.fields.some((f: any) => f.universalIdentifier === labelId), `${file}: label identifier is not one of its fields`);
  }
});

test('every relation is declared on both sides, each side pointing at the other', () => {
  for (const [uid, { owner, field }] of declared) {
    if (field.type !== 'RELATION') continue;
    const other = declared.get(field.relationTargetFieldMetadataUniversalIdentifier);
    assert.ok(other, `${field.name}: its other side is not declared`);
    assert.equal(other.field.relationTargetFieldMetadataUniversalIdentifier, uid, `${field.name}: the other side does not point back`);
    assert.equal(other.owner, field.relationTargetObjectMetadataUniversalIdentifier, `${field.name}: the other side is on the wrong object`);
    assert.equal(other.field.relationTargetObjectMetadataUniversalIdentifier, owner, `${field.name}: the other side targets the wrong object`);
    assert.deepEqual(
      [field.universalSettings.relationType, other.field.universalSettings.relationType].sort(),
      ['MANY_TO_ONE', 'ONE_TO_MANY'],
      `${field.name}: one side must be MANY_TO_ONE and the other ONE_TO_MANY`,
    );
  }
});

test('no universal identifier is used twice across objects, fields and options', () => {
  const all: string[] = [];
  for (const { result } of objects) all.push(result.config.universalIdentifier);
  for (const { field } of declared.values()) {
    all.push(field.universalIdentifier);
    for (const option of field.options ?? []) all.push(option.id);
  }
  assert.equal(new Set(all).size, all.length);
});

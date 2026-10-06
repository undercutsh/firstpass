// Unit coverage for validate-openapi.js's detection logic: feed it
// deliberately drifted specs and assert each drift is caught, plus that the
// real spec and handlers come out clean.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPEC_PATH,
  pathToHandlerFile,
  listHandlerFiles,
  validateSchema,
  checkSpec,
  checkResponses,
} from './validate-openapi.js';

const realSpec = () => JSON.parse(readFileSync(SPEC_PATH, 'utf8'));

describe('validate-openapi', () => {
  test('pathToHandlerFile maps templated paths to Vercel dynamic files', () => {
    assert.equal(pathToHandlerFile('/api/clients/{slug}'), 'clients/[slug].js');
    assert.equal(pathToHandlerFile('/api/health'), 'health.js');
    assert.equal(pathToHandlerFile('/openapi.json'), null);
  });

  test('listHandlerFiles skips _lib and tests', () => {
    const files = listHandlerFiles();
    assert.ok(files.includes('clients/[slug].js'));
    assert.ok(files.includes('lead.js'));
    assert.ok(!files.some((f) => f.startsWith('_') || f.endsWith('.test.js')));
  });

  test('the real spec and handlers are clean', async () => {
    const spec = realSpec();
    assert.deepEqual(checkSpec(spec, listHandlerFiles()), []);
    assert.deepEqual(await checkResponses(spec), []);
  });

  test('catches an undocumented handler and a documented path with no handler', () => {
    const spec = realSpec();
    delete spec.paths['/api/health'];
    spec.paths['/api/ghost'] = { get: { operationId: 'ghost', description: 'x', responses: { 200: { content: { 'application/json': { schema: {} } } } } } };
    const errors = checkSpec(spec, listHandlerFiles());
    assert.ok(errors.some((e) => e.includes('site/api/health.js') && e.includes('not documented')));
    assert.ok(errors.some((e) => e.includes('/api/ghost') && e.includes('does not exist')));
  });

  test('catches write methods, duplicate operationIds, auth schemes, bad refs', () => {
    const spec = realSpec();
    spec.paths['/api/policy'].post = { ...spec.paths['/api/policy'].get };
    spec.components.securitySchemes = { key: { type: 'apiKey', in: 'header', name: 'X' } };
    spec.paths['/api/models'].get.responses['200'].content['application/json'].schema = { $ref: '#/components/schemas/Nope' };
    const errors = checkSpec(spec, listHandlerFiles());
    assert.ok(errors.some((e) => e.includes('POST documented')));
    assert.ok(errors.some((e) => e.includes('duplicate operationId')));
    assert.ok(errors.some((e) => e.includes('securitySchemes')));
    assert.ok(errors.some((e) => e.includes('#/components/schemas/Nope')));
  });

  test('validateSchema catches type, required, enum, nullable and format drift', () => {
    const spec = { components: { schemas: { S: { type: 'object', required: ['a'], properties: { a: { type: 'integer' }, b: { type: ['string', 'null'] }, c: { enum: ['x'] }, d: { type: 'string', format: 'date' } } } } } };
    const ref = { $ref: '#/components/schemas/S' };
    assert.deepEqual(validateSchema(spec, ref, { a: 1, b: null, c: 'x', d: '2026-01-01' }), []);
    assert.equal(validateSchema(spec, ref, {}).length, 1);
    assert.equal(validateSchema(spec, ref, { a: 'one' }).length, 1);
    assert.equal(validateSchema(spec, ref, { a: 1, c: 'y' }).length, 1);
    assert.equal(validateSchema(spec, ref, { a: 1, d: 'yesterday' }).length, 1);
    assert.equal(validateSchema(spec, { type: 'array', items: { type: 'string' } }, ['a', 2]).length, 1);
  });
});

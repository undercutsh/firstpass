// Effort-level plumbing: OpenRouter's `reasoning: { effort }` param is the
// second rubric dimension (alongside model tier) — these tests guard the
// wire format and the invalid-input guard without spending money.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key';
const { chat } = await import('./llm.js');

function mockFetchCapturingBody(capture) {
  return async (url, opts) => {
    capture.body = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 },
      }),
      text: async () => '',
    };
  };
}

describe('chat() effort param', () => {
  test('omits reasoning field when effort is not passed', async () => {
    const capture = {};
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchCapturingBody(capture);
    try {
      await chat('some/model', 'sys', 'user');
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.equal(capture.body.reasoning, undefined);
  });

  test('sends reasoning: { effort } when a valid effort level is passed', async () => {
    const capture = {};
    const origFetch = globalThis.fetch;
    globalThis.fetch = mockFetchCapturingBody(capture);
    try {
      await chat('some/model', 'sys', 'user', { effort: 'high' });
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.deepEqual(capture.body.reasoning, { effort: 'high' });
  });

  test('rejects an invalid effort level before making any request', async () => {
    const origFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error('should not be called');
    };
    try {
      await assert.rejects(
        () => chat('some/model', 'sys', 'user', { effort: 'extreme' }),
        /invalid effort/,
      );
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.equal(called, false);
  });
});

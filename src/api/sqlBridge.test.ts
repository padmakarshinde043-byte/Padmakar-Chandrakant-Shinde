import test from 'node:test';
import assert from 'node:assert/strict';
import { isAiStudioPreviewHostname } from './sqlBridge';

test('isAiStudioPreviewHostname identifies local and AI Studio preview hosts accurately', () => {
  assert.equal(isAiStudioPreviewHostname('localhost'), true);
  assert.equal(isAiStudioPreviewHostname('127.0.0.1'), true);
  assert.equal(isAiStudioPreviewHostname('ais-dev-abc123.us-west1.run.app'), true);
  assert.equal(isAiStudioPreviewHostname('ais-pre-xyz789.asia-south1.run.app'), true);
  assert.equal(isAiStudioPreviewHostname('aistudio.google.com'), true);

  // Production domain must strictly return false so MySQL backend is always active
  assert.equal(isAiStudioPreviewHostname('mahasangh.in'), false);
  assert.equal(isAiStudioPreviewHostname('www.mahasangh.in'), false);
  assert.equal(isAiStudioPreviewHostname(''), false);
});

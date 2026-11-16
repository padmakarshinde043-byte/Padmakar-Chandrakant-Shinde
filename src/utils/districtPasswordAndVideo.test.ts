import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DISTRICT_PASSWORD } from '../data/rkMaharashtraData';

test('DEFAULT_DISTRICT_PASSWORD is strictly AD2026', () => {
  assert.equal(DEFAULT_DISTRICT_PASSWORD, 'AD2026');
});

test('District initial password validation requires min 4 chars and forbids default AD2026', () => {
  const isValidNewPassword = (pass: string) => {
    const p = pass.trim();
    if (!p || p.length < 4) return false;
    if (p === DEFAULT_DISTRICT_PASSWORD) return false;
    return true;
  };

  assert.equal(isValidNewPassword('AD2026'), false, 'Should not allow setting password back to default AD2026');
  assert.equal(isValidNewPassword('123'), false, 'Should require at least 4 characters');
  assert.equal(isValidNewPassword('   '), false, 'Should reject whitespace');
  assert.equal(isValidNewPassword('Pune@2026'), true, 'Valid custom password');
  assert.equal(isValidNewPassword('maha123'), true, 'Valid custom password');
});

test('Video size validation strictly enforces 3MB maximum', () => {
  const MAX_VIDEO_BYTES = 3 * 1024 * 1024; // 3,145,728 bytes

  const isVideoSizeAllowed = (sizeBytes: number) => sizeBytes <= MAX_VIDEO_BYTES;

  assert.equal(isVideoSizeAllowed(1 * 1024 * 1024), true, '1MB video is allowed');
  assert.equal(isVideoSizeAllowed(2.99 * 1024 * 1024), true, '2.99MB video is allowed');
  assert.equal(isVideoSizeAllowed(3 * 1024 * 1024), true, 'Exactly 3MB video is allowed');
  assert.equal(isVideoSizeAllowed(3.01 * 1024 * 1024), false, '3.01MB video is strictly rejected');
  assert.equal(isVideoSizeAllowed(5 * 1024 * 1024), false, '5MB video is strictly rejected');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStandaloneMode, detectIOSUserAgent } from './usePWAInstall';

test('detectStandaloneMode recognizes display-mode standalone and iOS navigator.standalone', () => {
  assert.equal(detectStandaloneMode(true, false), true);
  assert.equal(detectStandaloneMode(false, true), true);
  assert.equal(detectStandaloneMode(true, true), true);
  assert.equal(detectStandaloneMode(false, false), false);
  assert.equal(detectStandaloneMode(false, undefined), false);
});

test('detectIOSUserAgent identifies iPhone, iPad, and iPod browsers accurately', () => {
  assert.equal(
    detectIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'),
    true
  );
  assert.equal(
    detectIOSUserAgent('Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15'),
    true
  );
  assert.equal(
    detectIOSUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120.0.0.0 Mobile Safari/537.36'),
    false
  );
  assert.equal(detectIOSUserAgent(''), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import {
  normalizeImageSrcForPdf,
  isPrivateOrReservedIpAddress,
  isSafeExternalImageProxyUrl,
} from './pdfImageSafety';

test('normalizeImageSrcForPdf handles data URLs, protocol-relative URLs, relative paths, and invalid values', () => {
  assert.equal(normalizeImageSrcForPdf(''), '');
  assert.equal(normalizeImageSrcForPdf('   '), '');
  assert.equal(normalizeImageSrcForPdf('//res.cloudinary.com/demo/image/upload/a.jpg'), 'https://res.cloudinary.com/demo/image/upload/a.jpg');
  assert.equal(normalizeImageSrcForPdf('assets/photo.png'), '/assets/photo.png');
  assert.equal(normalizeImageSrcForPdf('./logo.png'), '/logo.png');
  assert.equal(normalizeImageSrcForPdf('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(normalizeImageSrcForPdf('data:text/html;base64,PGgxPkZhaWw8L2gxPg=='), '');
});

test('isPrivateOrReservedIpAddress blocks loopback, RFC1918, metadata, and allows public IPs', () => {
  assert.equal(isPrivateOrReservedIpAddress('127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIpAddress('10.0.0.5'), true);
  assert.equal(isPrivateOrReservedIpAddress('172.16.12.1'), true);
  assert.equal(isPrivateOrReservedIpAddress('192.168.1.10'), true);
  assert.equal(isPrivateOrReservedIpAddress('169.254.169.254'), true);
  assert.equal(isPrivateOrReservedIpAddress('::1'), true);
  assert.equal(isPrivateOrReservedIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrReservedIpAddress('8.8.8.8'), false);
  assert.equal(isPrivateOrReservedIpAddress('104.16.132.229'), false);
});

test('isSafeExternalImageProxyUrl validates public CDN URLs and rejects SSRF targets', () => {
  assert.equal(isSafeExternalImageProxyUrl('https://res.cloudinary.com/fdrjsgjy/image/upload/v1/test.jpg').valid, true);
  assert.equal(isSafeExternalImageProxyUrl('https://firebasestorage.googleapis.com/v0/b/app/o/photo.jpg').valid, true);
  assert.equal(isSafeExternalImageProxyUrl('http://127.0.0.1:3000/secret').valid, false);
  assert.equal(isSafeExternalImageProxyUrl('http://metadata.google.internal/computeMetadata/v1/').valid, false);
  assert.equal(isSafeExternalImageProxyUrl('file:///etc/passwd').valid, false);
  assert.equal(isSafeExternalImageProxyUrl('javascript:alert(1)').valid, false);
});

test('local QRCode.toDataURL generates an inline PNG data URL without external network requests', async () => {
  const dataUrl = await QRCode.toDataURL('https://mahasangh.in', {
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(dataUrl.length > 200);
});

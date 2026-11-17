export function normalizeImageSrcForPdf(rawSrc?: string): string {
  if (!rawSrc || typeof rawSrc !== 'string') return '';
  const trimmed = rawSrc.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:')) {
    return /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed) ||
      /^data:image\/svg\+xml/i.test(trimmed)
      ? trimmed
      : '';
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Relative asset path without leading slash (e.g. "logo.png" or "assets/...")
  if (!trimmed.includes(':') && !trimmed.startsWith('/')) {
    return `/${trimmed.replace(/^\.\/+/, '')}`;
  }

  return trimmed;
}

export function isPrivateOrReservedIpAddress(ip: string): boolean {
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!clean) return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (clean.startsWith('::ffff:')) {
    return isPrivateOrReservedIpAddress(clean.slice(7));
  }

  // IPv6 loopback / unspecified / ULA / link-local
  if (
    clean === '::1' ||
    clean === '::' ||
    clean.startsWith('fc') ||
    clean.startsWith('fd') ||
    clean.startsWith('fe80:')
  ) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(clean);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map((n) => parseInt(n, 10));
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return true;

  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast & reserved

  return false;
}

export function isSafeExternalImageProxyUrl(rawUrl: string): { valid: boolean; url?: URL; reason?: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, reason: 'Only http/https URLs are permitted.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      !host ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal'
    ) {
      return { valid: false, reason: 'Local or internal hostnames are blocked.' };
    }
    if (isPrivateOrReservedIpAddress(host)) {
      return { valid: false, reason: 'Private IP addresses are blocked.' };
    }
    return { valid: true, url: parsed };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

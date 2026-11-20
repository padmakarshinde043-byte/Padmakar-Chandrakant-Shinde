/**
 * Lightweight image & on-demand font optimization helpers.
 * - Transforms Cloudinary image URLs to serve modern WebP/AVIF (`f_auto`),
 *   perceptual auto-compression (`q_auto`), and viewport-appropriate widths (`c_limit,w_*`).
 * - Lazily loads the Montserrat font only when ID card / PDF views actually need it,
 *   keeping initial homepage font downloads minimal while preserving homepage typography.
 */

export function optimizeCloudinaryImageUrl(url?: string, maxWidth = 960): string {
  if (!url || typeof url !== 'string') return url || '';
  const trimmed = url.trim();
  if (!trimmed.includes('res.cloudinary.com') || !trimmed.includes('/image/upload/')) {
    return trimmed;
  }
  // Avoid double-injecting if optimization parameters are already present
  if (/\/image\/upload\/[^/]*(f_auto|q_auto|w_\d+)/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.replace(
    '/image/upload/',
    `/image/upload/f_auto,q_auto:good,c_limit,w_${maxWidth}/`
  );
}

let montserratRequested = false;

export function ensureMontserratFontLoaded(): void {
  if (montserratRequested || typeof document === 'undefined') return;
  montserratRequested = true;
  if (document.getElementById('mhs-montserrat-font')) return;
  const link = document.createElement('link');
  link.id = 'mhs-montserrat-font';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&display=swap';
  document.head.appendChild(link);
}

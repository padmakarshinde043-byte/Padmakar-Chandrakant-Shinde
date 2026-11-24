import { compressImageFile } from './imageCompressor';
import { normalizeImageSrcForPdf } from './pdfImageSafety';
import { getAuthHeaders } from '../api/sqlBridge';

/**
 * Hybrid Media Storage Utility (SQL + Local Server Disk + Optional Cloudinary Fallback)
 *
 * Zero-Quota Architecture:
 * - Member, Official & Leader passport photos (~15-30KB WebP/JPEG) are stored directly in SQL
 *   (applications/officials/leaders tables already use lazy batch hydration for instant speed).
 * - Banners, News photos, Short Videos & GR PDFs are compressed client-side and stored on
 *   the app server disk (`/uploads/<folder>/...`) with 1-year immutable browser & SW caching.
 * - Existing `https://res.cloudinary.com/...` URLs continue rendering normally.
 */

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
  enabled: boolean;
}

const CLOUDINARY_CONFIG_STORAGE_KEY = 'mahasangh_cloudinary_config_v1';

export function getCloudinaryConfig(): CloudinaryConfig {
  try {
    const raw = localStorage.getItem(CLOUDINARY_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const cName = typeof parsed.cloudName === 'string' && parsed.cloudName.trim() ? parsed.cloudName.trim() : 'fdrjsgjy';
      const preset = typeof parsed.uploadPreset === 'string' && parsed.uploadPreset.trim() ? parsed.uploadPreset.trim() : 'mahasangh';
      return {
        cloudName: cName,
        uploadPreset: preset,
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true
      };
    }
  } catch (e) {
    console.warn('Could not read Cloudinary config:', e);
  }

  return {
    cloudName: 'fdrjsgjy',
    uploadPreset: 'mahasangh',
    enabled: true
  };
}

export function saveCloudinaryConfig(config: CloudinaryConfig): void {
  try {
    localStorage.setItem(CLOUDINARY_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Could not save Cloudinary config:', e);
  }
}

/**
 * Upload a photo/document directly to Cloudinary using unsigned upload preset
 */
export async function uploadToCloudinary(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; publicId: string; format: string }> {
  const config = overrideConfig || getCloudinaryConfig();

  if (!config.cloudName || !config.uploadPreset) {
    throw new Error('कृपया आधी Admin पॅनलमध्ये Cloudinary Cloud Name आणि Upload Preset टाका.');
  }

  const cleanCloudName = config.cloudName.trim();
  const cleanPreset = config.uploadPreset.trim();

  const endpoint = `https://api.cloudinary.com/v1_1/${cleanCloudName}/auto/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cleanPreset);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || `Cloudinary अपलोड अयशस्वी झाले (Status: ${response.status})`;
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const secureUrl = data.secure_url || data.url;

  if (!secureUrl) {
    throw new Error('Cloudinary कडून इमेज URL प्राप्त झाली नाही.');
  }

  return {
    url: secureUrl,
    publicId: data.public_id || '',
    format: data.format || ''
  };
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  const ext = mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : 'jpg';
  return new File([u8arr], `${fileName}.${ext}`, { type: mime });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('फाईल वाचताना अडचण आली.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result.startsWith('data:')) {
        resolve(result);
      } else {
        reject(new Error('अवैध फाईल फॉरमॅट.'));
      }
    };
    reader.readAsDataURL(file);
  });
}

export type ServerMediaFolder = 'banners' | 'news' | 'gr' | 'whatsapp';

/**
 * Uploads a Data URL (compressed image, short video, or GR PDF) to our own server disk
 * (`/uploads/<folder>/<random-id>.<ext>`), served with 1-year immutable browser caching.
 */
export async function uploadDataUrlToServerDisk(
  dataUrl: string,
  folder: ServerMediaFolder
): Promise<{ url: string; sizeKb: number }> {
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ dataUrl, folder }),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`सर्व्हर अपलोड उपलब्ध नाही (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (!res.ok || data.status !== 'success' || !data.url) {
    throw new Error(data.message || `सर्व्हर अपलोड अयशस्वी झाले (HTTP ${res.status})`);
  }

  return {
    url: String(data.url),
    sizeKb: Number(data.sizeKb || 0),
  };
}

/**
 * Uploads a Data URL to server disk first (zero Cloudinary quota), falling back to Cloudinary only if needed.
 */
export async function uploadDataUrlToCloudinary(
  dataUrl: string,
  fileName = `banner_${Date.now()}`,
  overrideConfig?: CloudinaryConfig
): Promise<string> {
  try {
    const uploaded = await uploadDataUrlToServerDisk(dataUrl, 'banners');
    return uploaded.url;
  } catch (serverErr) {
    console.warn('Server disk dataUrl upload unavailable, trying Cloudinary fallback:', serverErr);
  }

  const baseConfig = overrideConfig || getCloudinaryConfig();
  const activeConfig: CloudinaryConfig = {
    cloudName: baseConfig.cloudName?.trim() || 'fdrjsgjy',
    uploadPreset: baseConfig.uploadPreset?.trim() || 'mahasangh',
    enabled: true,
  };
  const file = dataUrlToFile(dataUrl, fileName);
  const result = await uploadToCloudinary(file, activeConfig);
  return result.url;
}

/**
 * Compresses banner images to crisp HD WebP/JPEG (~80-180 KB) and saves to server disk
 * (`/uploads/banners/...`) with 1-year immutable caching — zero Cloudinary quota used.
 */
export async function uploadBannerPhotoToCloudinary(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number }> {
  const compressed = await compressImageFile(file, 1400, 1400, 0.82);

  try {
    return await uploadDataUrlToServerDisk(compressed.base64, 'banners');
  } catch (serverErr) {
    console.warn('Server disk banner upload unavailable, trying Cloudinary fallback:', serverErr);
  }

  const baseConfig = overrideConfig || getCloudinaryConfig();
  if (baseConfig.enabled && baseConfig.cloudName && baseConfig.uploadPreset) {
    const uploadFile = dataUrlToFile(compressed.base64, `latest_banner_${Date.now()}`);
    const uploaded = await uploadToCloudinary(uploadFile, baseConfig);
    return { url: uploaded.url, sizeKb: compressed.sizeKb };
  }

  throw new Error('बॅनर फोटो सर्व्हरवर अपलोड करता आला नाही. कृपया पुन्हा लॉगिन करून प्रयत्न करा.');
}

/**
 * Uploads a short video (strictly <= 3MB) to server disk (`/uploads/banners/...`) with
 * HTTP Range streaming & 1-year immutable caching — zero Cloudinary bandwidth used.
 */
export async function uploadBannerVideoToCloudinary(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number }> {
  const MAX_VIDEO_BYTES = 3 * 1024 * 1024; // strictly 3 MB
  if (file.size > MAX_VIDEO_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`व्हिडिओचा आकार 3 MB पेक्षा जास्त आहे (${sizeMb} MB). कृपया 3 MB किंवा त्यापेक्षा लहान आकाराचा शॉर्ट व्हिडिओ निवडा.`);
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    return await uploadDataUrlToServerDisk(dataUrl, 'banners');
  } catch (serverErr) {
    console.warn('Server disk video upload unavailable, trying Cloudinary fallback:', serverErr);
  }

  const baseConfig = overrideConfig || getCloudinaryConfig();
  const cleanCloudName = baseConfig.cloudName?.trim() || 'fdrjsgjy';
  const cleanPreset = baseConfig.uploadPreset?.trim() || 'mahasangh';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cleanPreset);

  const endpoint = `https://api.cloudinary.com/v1_1/${cleanCloudName}/video/upload`;
  let response = await fetch(endpoint, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const autoEndpoint = `https://api.cloudinary.com/v1_1/${cleanCloudName}/auto/upload`;
    response = await fetch(autoEndpoint, {
      method: 'POST',
      body: formData
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || `व्हिडिओ अपलोड अयशस्वी झाले (Status: ${response.status})`;
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const secureUrl = data.secure_url || data.url;

  if (!secureUrl) {
    throw new Error('व्हिडिओ URL प्राप्त झाली नाही.');
  }

  return {
    url: secureUrl,
    sizeKb: Math.round(file.size / 1024)
  };
}

/**
 * Compresses news photo to crisp WebP/JPEG (~60-150 KB) and saves to server disk (`/uploads/news/...`).
 */
export async function uploadNewsPhotoToServerDisk(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number; storageType: 'server' | 'cloudinary' | 'fallback' }> {
  const compressed = await compressImageFile(file, 1200, 900, 0.8);

  try {
    const uploaded = await uploadDataUrlToServerDisk(compressed.base64, 'news');
    return { url: uploaded.url, sizeKb: uploaded.sizeKb || compressed.sizeKb, storageType: 'server' };
  } catch (serverErr) {
    console.warn('Server disk news upload unavailable, trying fallback:', serverErr);
  }

  const config = overrideConfig || getCloudinaryConfig();
  if (config.enabled && config.cloudName && config.uploadPreset) {
    try {
      const tinyFile = dataUrlToFile(compressed.base64, `news_${Date.now()}`);
      const uploaded = await uploadToCloudinary(tinyFile, config);
      return { url: uploaded.url, sizeKb: compressed.sizeKb, storageType: 'cloudinary' };
    } catch (cloudErr) {
      console.warn('Cloudinary news fallback failed, using compressed inline photo:', cloudErr);
    }
  }

  return { url: compressed.base64, sizeKb: compressed.sizeKb, storageType: 'fallback' };
}

/**
 * Uploads Government Order / GR PDF (<= 6MB) or compressed image to server disk (`/uploads/gr/...`).
 */
export async function uploadGrFileToServerDisk(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number; storageType: 'server' | 'cloudinary' }> {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isImage && !isPdf) {
    throw new Error('फक्त PDF किंवा इमेज (JPG/PNG/WebP) फाईल अपलोड करता येईल.');
  }

  if (isPdf && file.size > 6 * 1024 * 1024) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`PDF फाईलचा आकार 6 MB पेक्षा जास्त आहे (${sizeMb} MB). कृपया लहान PDF निवडा किंवा Google Drive लिंक वापरा.`);
  }

  const dataUrl = isImage
    ? (await compressImageFile(file, 1400, 1800, 0.82)).base64
    : await fileToDataUrl(file);

  try {
    const uploaded = await uploadDataUrlToServerDisk(dataUrl, 'gr');
    return { url: uploaded.url, sizeKb: uploaded.sizeKb, storageType: 'server' };
  } catch (serverErr) {
    console.warn('Server disk GR upload unavailable, trying Cloudinary fallback:', serverErr);
  }

  const config = overrideConfig || getCloudinaryConfig();
  if (config.enabled && config.cloudName && config.uploadPreset) {
    const uploaded = await uploadToCloudinary(file, config);
    return { url: uploaded.url, sizeKb: Math.round(file.size / 1024), storageType: 'cloudinary' };
  }

  throw new Error('GR फाईल सर्व्हरवर अपलोड करता आली नाही.');
}

/**
 * Compresses WhatsApp sender/broadcast image and saves to server disk (`/uploads/whatsapp/...`),
 * returning a full public HTTPS URL suitable for Meta WhatsApp Cloud API.
 */
export async function uploadWhatsappMediaToServerDisk(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number }> {
  const compressed = await compressImageFile(file, 1000, 1000, 0.82);

  try {
    const uploaded = await uploadDataUrlToServerDisk(compressed.base64, 'whatsapp');
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const fullUrl = uploaded.url.startsWith('http') ? uploaded.url : `${origin}${uploaded.url}`;
    return { url: fullUrl, sizeKb: uploaded.sizeKb || compressed.sizeKb };
  } catch (serverErr) {
    console.warn('Server disk WhatsApp upload unavailable, trying Cloudinary fallback:', serverErr);
  }

  const config = overrideConfig || getCloudinaryConfig();
  if (config.enabled && config.cloudName && config.uploadPreset) {
    const tinyFile = dataUrlToFile(compressed.base64, `whatsapp_${Date.now()}`);
    const uploaded = await uploadToCloudinary(tinyFile, config);
    return { url: uploaded.url, sizeKb: compressed.sizeKb };
  }

  throw new Error('फोटो सर्व्हरवर अपलोड करता आला नाही.');
}

/**
 * Compresses member / official passport photo to crisp ~15-30KB WebP/JPEG and stores
 * directly in SQL (`applications.photo`, `officials.photo`, `contacts.photo`) —
 * completely avoiding Cloudinary quota usage while keeping lazy-loaded lists lightning fast.
 */
export async function uploadCompressedPhotoToCloudinaryOrFallback(
  file: File,
  maxWidth = 360,
  maxHeight = 440,
  quality = 0.78
): Promise<{ urlOrBase64: string; sizeKb: number; storageType: 'sql' | 'cloudinary' | 'fallback' }> {
  const { base64, sizeKb } = await compressImageFile(file, maxWidth, maxHeight, quality);
  return {
    urlOrBase64: base64,
    sizeKb,
    storageType: 'sql',
  };
}

const pdfImageDataCache = new Map<string, string>();

async function responseToImageDataUrl(res: Response): Promise<string> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!blob.type || !blob.type.toLowerCase().startsWith('image/')) {
    throw new Error(`Invalid image MIME: ${blob.type || 'unknown'}`);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result.startsWith('data:image/')) {
        resolve(result);
      } else {
        reject(new Error('Invalid Data URL'));
      }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts local paths and remote Cloudinary/Firebase/HTTP photo URLs into
 * in-memory Base64 Data URLs before rendering html2canvas PDFs, completely
 * preventing CORS/tainted-canvas errors across all browsers.
 */
export async function resolveImageUrlForPdf(src?: string): Promise<string> {
  const normalized = normalizeImageSrcForPdf(src);
  if (!normalized) return '';

  if (normalized.startsWith('data:image/')) {
    return normalized;
  }

  if (pdfImageDataCache.has(normalized)) {
    return pdfImageDataCache.get(normalized)!;
  }

  // Same-origin local asset path (e.g. /logo.png, /assets/...)
  if (normalized.startsWith('/')) {
    try {
      const res = await fetch(normalized);
      const dataUrl = await responseToImageDataUrl(res);
      pdfImageDataCache.set(normalized, dataUrl);
      return dataUrl;
    } catch (err) {
      console.warn('Could not inline local image for PDF:', normalized, err);
      return '';
    }
  }

  // Remote HTTP/HTTPS URL: try direct CORS fetch first, then fallback to same-origin proxy
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const res = await fetch(normalized, { mode: 'cors' });
      const dataUrl = await responseToImageDataUrl(res);
      pdfImageDataCache.set(normalized, dataUrl);
      return dataUrl;
    } catch {
      try {
        const proxyRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(normalized)}`);
        const dataUrl = await responseToImageDataUrl(proxyRes);
        pdfImageDataCache.set(normalized, dataUrl);
        return dataUrl;
      } catch (proxyErr) {
        console.warn('Could not inline remote photo for PDF, skipping image to avoid tainted canvas:', proxyErr);
        return '';
      }
    }
  }

  return '';
}

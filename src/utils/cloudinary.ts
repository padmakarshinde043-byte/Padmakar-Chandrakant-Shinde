import { compressImageFile } from './imageCompressor';
import { normalizeImageSrcForPdf } from './pdfImageSafety';

/**
 * Cloudinary Image Upload & Free CDN Storage Utility
 * 
 * Provides 100% quota protection for Firebase:
 * - Photos and news images upload directly to Cloudinary Free Tier (25GB free)
 * - Firebase only stores the short CDN URL string (e.g., https://res.cloudinary.com/...)
 * - Zero base64 payload in Firestore, keeping Firestore database usage strictly near 0 KB.
 * - Uses Cloudinary's official Unsigned Upload Preset feature (no backend or secret API key needed).
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

/**
 * Converts a base64 Data URL to a File and uploads it to Cloudinary, returning the HTTPS CDN URL.
 */
export async function uploadDataUrlToCloudinary(
  dataUrl: string,
  fileName = `banner_${Date.now()}`,
  overrideConfig?: CloudinaryConfig
): Promise<string> {
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
 * Compresses oversized banner images if needed and uploads directly to Cloudinary,
 * always returning a clean Cloudinary HTTPS URL for saving in Firebase.
 */
export async function uploadBannerPhotoToCloudinary(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number }> {
  const baseConfig = overrideConfig || getCloudinaryConfig();
  const activeConfig: CloudinaryConfig = {
    cloudName: baseConfig.cloudName?.trim() || 'fdrjsgjy',
    uploadPreset: baseConfig.uploadPreset?.trim() || 'mahasangh',
    enabled: true,
  };

  let uploadFile = file;
  let sizeKb = Math.round(file.size / 1024);

  // Compress large camera/WhatsApp images to sharp 1600px HD so Cloudinary upload is fast & under limit
  if (file.size > 1500 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    const compressed = await compressImageFile(file, 1600, 1600, 0.88);
    uploadFile = dataUrlToFile(compressed.base64, `latest_banner_${Date.now()}`);
    sizeKb = compressed.sizeKb;
  }

  const uploaded = await uploadToCloudinary(uploadFile, activeConfig);
  return { url: uploaded.url, sizeKb };
}

/**
 * Uploads a short video (strictly <= 3MB) to Cloudinary via unsigned upload preset.
 * Enforces the strict 3MB size limit requested by the user.
 */
export async function uploadBannerVideoToCloudinary(
  file: File,
  overrideConfig?: CloudinaryConfig
): Promise<{ url: string; sizeKb: number }> {
  const MAX_VIDEO_BYTES = 3 * 1024 * 1024; // strictly 3 MB
  if (file.size > MAX_VIDEO_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`व्हिडिओचा आकार ३ MB पेक्षा जास्त आहे (${sizeMb} MB). कृपया ३ MB किंवा त्यापेक्षा लहान आकाराचा शॉर्ट व्हिडिओ निवडा.`);
  }

  const baseConfig = overrideConfig || getCloudinaryConfig();
  const cleanCloudName = baseConfig.cloudName?.trim() || 'fdrjsgjy';
  const cleanPreset = baseConfig.uploadPreset?.trim() || 'mahasangh';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', cleanPreset);

  // Try video/upload endpoint, fallback to auto/upload
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
    throw new Error('Cloudinary कडून व्हिडिओ URL प्राप्त झाली नाही.');
  }

  return {
    url: secureUrl,
    sizeKb: Math.round(file.size / 1024)
  };
}

/**
 * Compresses member passport photo to <30KB first, then uploads to Cloudinary.
 * Automatically falls back to the tiny compressed Base64 if Cloudinary is disabled or offline,
 * guaranteeing registration and member edits NEVER fail.
 */
export async function uploadCompressedPhotoToCloudinaryOrFallback(
  file: File,
  maxWidth = 360,
  maxHeight = 440,
  quality = 0.72
): Promise<{ urlOrBase64: string; sizeKb: number; storageType: 'cloudinary' | 'fallback' }> {
  const { base64, sizeKb } = await compressImageFile(file, maxWidth, maxHeight, quality);
  const config = getCloudinaryConfig();

  if (config.enabled && config.cloudName && config.uploadPreset) {
    try {
      const tinyFile = dataUrlToFile(base64, `member_${Date.now()}`);
      const uploaded = await uploadToCloudinary(tinyFile, config);
      return {
        urlOrBase64: uploaded.url,
        sizeKb,
        storageType: 'cloudinary'
      };
    } catch (err) {
      console.warn('Cloudinary member photo upload fallback to tiny Base64:', err);
    }
  }

  return {
    urlOrBase64: base64,
    sizeKb,
    storageType: 'fallback'
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

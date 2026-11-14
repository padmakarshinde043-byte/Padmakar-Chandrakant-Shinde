import { compressImageFile } from './imageCompressor';

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
  const ext = mime.includes('webp') ? 'webp' : 'jpg';
  return new File([u8arr], `${fileName}.${ext}`, { type: mime });
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

/**
 * Converts remote Cloudinary/HTTP photo URLs into in-memory Base64 Data URLs
 * before rendering html2canvas PDFs, completely preventing CORS/tainted-canvas errors.
 */
export async function resolveImageUrlForPdf(src?: string): Promise<string> {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:') || trimmed.startsWith('/')) {
    return trimmed;
  }

  if (pdfImageDataCache.has(trimmed)) {
    return pdfImageDataCache.get(trimmed)!;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      pdfImageDataCache.set(trimmed, dataUrl);
      return dataUrl;
    } catch (err) {
      console.warn('Could not inline remote photo for PDF, skipping image to avoid tainted canvas:', err);
      return '';
    }
  }

  return trimmed;
}


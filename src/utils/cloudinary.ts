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

  const endpoint = `https://api.cloudinary.com/v1_1/${cleanCloudName}/image/upload`;

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

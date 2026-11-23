import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCw, RotateCcw, Check, Move } from 'lucide-react';

export const ID_CARD_PHOTO_WIDTH = 360;
export const ID_CARD_PHOTO_HEIGHT = 440;
const CROP_BOX_WIDTH = 228;
const CROP_BOX_HEIGHT = Math.round((CROP_BOX_WIDTH * ID_CARD_PHOTO_HEIGHT) / ID_CARD_PHOTO_WIDTH); // 279px

const MAX_ZOOM = 6;

interface PassportPhotoCropperModalProps {
  imageSrc: string;
  language?: 'mr' | 'en';
  onCancel: () => void;
  onConfirm: (croppedFile: File, previewDataUrl: string) => void;
}

function getSafeCanvasImageUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
        return trimmed;
      }
      return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export const PassportPhotoCropperModal: React.FC<PassportPhotoCropperModalProps> = ({
  imageSrc,
  language = 'mr',
  onCancel,
  onConfirm,
}) => {
  const isMr = language === 'mr';
  const [resolvedSrc, setResolvedSrc] = useState<string>(() => getSafeCanvasImageUrl(imageSrc));
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [loadError, setLoadError] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const prevImageSrcRef = useRef<string>(imageSrc);
  const usedDirectFallbackRef = useRef<boolean>(false);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null);

  // Only reset crop state when imageSrc actually changes after mount
  // (avoids wiping naturalSize set by synchronous data:/cached onLoad on initial mount)
  useEffect(() => {
    if (prevImageSrcRef.current === imageSrc) return;
    prevImageSrcRef.current = imageSrc;
    usedDirectFallbackRef.current = false;
    setResolvedSrc(getSafeCanvasImageUrl(imageSrc));
    setNaturalSize(null);
    setLoadError('');
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }, [imageSrc]);

  // Capture dimensions immediately if the image is already cached/complete
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0 && el.naturalHeight > 0) {
      setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
      setLoadError('');
    }
  }, [resolvedSrc]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onCancel]);

  // Effective oriented dimensions after 90/270 deg rotation
  const orientedSize = naturalSize
    ? rotation % 180 === 0
      ? { w: naturalSize.w, h: naturalSize.h }
      : { w: naturalSize.h, h: naturalSize.w }
    : null;

  // Base cover scale so image fills CROP_BOX completely at zoom = 1
  const baseScale = orientedSize
    ? Math.max(CROP_BOX_WIDTH / orientedSize.w, CROP_BOX_HEIGHT / orientedSize.h)
    : 1;

  const totalScale = baseScale * zoom;

  const clampOffset = useCallback(
    (nextX: number, nextY: number, targetZoom: number, targetRot: number) => {
      if (!naturalSize) return { x: 0, y: 0 };
      const effW = targetRot % 180 === 0 ? naturalSize.w : naturalSize.h;
      const effH = targetRot % 180 === 0 ? naturalSize.h : naturalSize.w;
      const bScale = Math.max(CROP_BOX_WIDTH / effW, CROP_BOX_HEIGHT / effH);
      const dispW = effW * bScale * targetZoom;
      const dispH = effH * bScale * targetZoom;
      const maxX = Math.max(0, (dispW - CROP_BOX_WIDTH) / 2);
      const maxY = Math.max(0, (dispH - CROP_BOX_HEIGHT) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    [naturalSize]
  );

  const applyZoom = useCallback(
    (nextZoomRaw: number) => {
      const nextZoom = Math.max(1, Math.min(MAX_ZOOM, Number(nextZoomRaw.toFixed(3))));
      setZoom(nextZoom);
      setOffset((prev) => clampOffset(prev.x, prev.y, nextZoom, rotation));
    },
    [clampOffset, rotation]
  );

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!naturalSize) return;
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.15 : -0.15;
    applyZoom(zoom + step);
  };

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    setOffset((prev) => clampOffset(prev.x, prev.y, zoom, nextRot));
  };

  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartRef.current = { dist: Math.max(dist, 1), zoom };
      dragStartRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = dist / pinchStartRef.current.dist;
      applyZoom(pinchStartRef.current.zoom * ratio);
    } else if (pointersRef.current.size === 1 && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setOffset(clampOffset(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy, zoom, rotation));
    }
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      dragStartRef.current = { x: remaining.x, y: remaining.y, ox: offset.x, oy: offset.y };
      pinchStartRef.current = null;
    } else {
      dragStartRef.current = null;
      pinchStartRef.current = null;
    }
  };

  const handleConfirmCrop = async () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return;

    setIsExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = ID_CARD_PHOTO_WIDTH;
      canvas.height = ID_CARD_PHOTO_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');

      // White background behind image
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, ID_CARD_PHOTO_WIDTH, ID_CARD_PHOTO_HEIGHT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Map crop-box coordinates directly to 360x440 export coordinates
      const exportFactor = ID_CARD_PHOTO_WIDTH / CROP_BOX_WIDTH;
      ctx.save();
      ctx.translate(
        ID_CARD_PHOTO_WIDTH / 2 + offset.x * exportFactor,
        ID_CARD_PHOTO_HEIGHT / 2 + offset.y * exportFactor
      );
      ctx.rotate((rotation * Math.PI) / 180);
      const drawW = naturalSize.w * totalScale * exportFactor;
      const drawH = naturalSize.h * totalScale * exportFactor;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const previewDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not export cropped photo'))),
          'image/jpeg',
          0.9
        );
      });
      const croppedFile = new File([blob], 'passport-photo.jpg', { type: 'image/jpeg' });
      onConfirm(croppedFile, previewDataUrl);
    } catch (err: any) {
      setLoadError(
        isMr
          ? 'फोटो सेव्ह करताना त्रुटी आली. कृपया पुन्हा फोटो निवडा.'
          : 'Failed to crop photo: ' + (err?.message || 'Error')
      );
    } finally {
      setIsExporting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isMr ? 'पासपोर्ट फोटो सेट करा' : 'Crop Passport Photo'}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-[#e7ded1] flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="bg-[#0b1e36] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between border-b-2 border-[#efb24b]">
          <div>
            <h3 className="font-serifDevanagari text-base sm:text-lg font-bold leading-snug">
              {isMr ? 'आय-कार्डसाठी फोटो सेट करा' : 'Adjust Passport Photo for ID Card'}
            </h3>
            <p className="text-[11px] sm:text-xs text-amber-200/95">
              {isMr
                ? 'चेहरा चौकटीत मध्यभागी येण्यासाठी बोटाने सरकवा व Zoom करा'
                : 'Drag to position face inside the frame and adjust zoom'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label={isMr ? 'बंद करा' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop Viewport */}
        <div className="p-4 sm:p-5 bg-slate-100 flex flex-col items-center gap-3 overflow-y-auto">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onWheel={handleWheelZoom}
            style={{ width: CROP_BOX_WIDTH, height: CROP_BOX_HEIGHT }}
            className="relative bg-slate-900 rounded-xl border-[3.5px] border-[#d4af37] shadow-lg overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing shrink-0"
          >
            {resolvedSrc && (
              <img
                ref={imgRef}
                src={resolvedSrc}
                crossOrigin={/^https?:\/\//i.test(resolvedSrc) ? 'anonymous' : undefined}
                alt={isMr ? 'फोटो अ‍ॅडजस्ट' : 'Crop source'}
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                    setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                    setLoadError('');
                  }
                }}
                onError={() => {
                  const raw = (imageSrc || '').trim();
                  if (
                    resolvedSrc.startsWith('/api/proxy-image?') &&
                    !usedDirectFallbackRef.current &&
                    /^https?:\/\//i.test(raw)
                  ) {
                    usedDirectFallbackRef.current = true;
                    setResolvedSrc(raw);
                    return;
                  }
                  setLoadError(
                    isMr
                      ? 'हा फोटो लोड होऊ शकला नाही. कृपया गॅलरीतून दुसरा फोटो निवडा.'
                      : 'Could not load image for cropping. Please upload a fresh image.'
                  );
                }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: naturalSize ? `${naturalSize.w * totalScale}px` : '100%',
                  height: naturalSize ? `${naturalSize.h * totalScale}px` : '100%',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  opacity: naturalSize ? 1 : 0,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  pointerEvents: 'none',
                }}
              />
            )}

            {!naturalSize && !loadError && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/75 text-white text-xs font-bold pointer-events-none">
                {isMr ? 'फोटो लोड होत आहे...' : 'Loading photo...'}
              </div>
            )}

            {/* Subtle Face & Shoulders Alignment Guide Overlay */}
            <svg
              viewBox="0 0 228 279"
              className="absolute inset-0 w-full h-full pointer-events-none"
              aria-hidden="true"
            >
              {/* Head oval guide */}
              <ellipse
                cx="114"
                cy="106"
                rx="54"
                ry="68"
                fill="none"
                stroke="rgba(255,255,255,0.72)"
                strokeWidth="1.6"
                strokeDasharray="6 5"
              />
              {/* Shoulders arc guide */}
              <path
                d="M 28 274 C 34 218, 72 194, 114 194 C 156 194, 194 218, 200 274"
                fill="none"
                stroke="rgba(255,255,255,0.62)"
                strokeWidth="1.6"
                strokeDasharray="6 5"
              />
            </svg>

            {/* Bottom drag hint pill */}
            <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none">
              <span className="bg-[#0b1e36]/75 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border border-white/25">
                <Move className="w-3 h-3 text-amber-300" />
                <span>{isMr ? 'फोटो बोटाने सरकवा' : 'Drag to position'}</span>
              </span>
            </div>
          </div>

          {loadError && (
            <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-lg text-center w-full">
              {loadError}
            </p>
          )}

          {/* Zoom & Rotate Controls */}
          <div className="w-full bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => applyZoom(zoom - 0.15)}
                disabled={zoom <= 1}
                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-[#0b1e36] flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.02}
                value={zoom}
                onChange={(e) => applyZoom(parseFloat(e.target.value))}
                className="flex-1 accent-[#193568] cursor-pointer"
                aria-label="Zoom"
              />
              <button
                type="button"
                onClick={() => applyZoom(zoom + 0.2)}
                disabled={zoom >= MAX_ZOOM}
                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-[#0b1e36] flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold text-slate-600 w-11 text-right tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={handleRotate}
                className="flex-1 min-h-[38px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[#0b1e36] text-xs font-bold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5 text-[#df6b16]" />
                <span>{isMr ? '90° फिरवा' : 'Rotate 90°'}</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 min-h-[38px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isMr ? 'मूळ स्थिती' : 'Reset'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer"
          >
            {isMr ? 'रद्द करा' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            disabled={!naturalSize || Boolean(loadError) || isExporting}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#193568] hover:bg-[#0b1e36] disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Check className="w-4 h-4 text-amber-300" />
            <span>
              {isExporting
                ? isMr
                  ? 'जतन होत आहे...'
                  : 'Applying...'
                : isMr
                  ? 'फोटो पक्का करा'
                  : 'Apply Crop'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

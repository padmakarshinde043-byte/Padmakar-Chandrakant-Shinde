import React, { useEffect, useState } from 'react';
import {
  MembershipApplication,
  formatSequentialMemberNumber,
  normalizeOfficialCadre,
} from '../data/mahasanghData';
import { toEnglishDigits } from '../utils/formatters';
import { getSharpLogoDataUrl } from '../services/rkPdfGenerator';
import { ensureMontserratFontLoaded } from '../utils/imageOptimize';

interface MembershipIdCardPreviewProps {
  app: Partial<MembershipApplication> & {
    fullName: string;
    district: string;
    phone: string;
  };
  photoFallbackUrl?: string;
}

export const MembershipIdCardPreview: React.FC<MembershipIdCardPreviewProps> = ({
  app,
  photoFallbackUrl = '/president.jpg',
}) => {
  const [sharpLogoUrl, setSharpLogoUrl] = useState<string>('/logo.png');

  useEffect(() => {
    ensureMontserratFontLoaded();
    let active = true;
    getSharpLogoDataUrl(560)
      .then((url) => {
        if (active && url) setSharpLogoUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  let memberNo = toEnglishDigits((app.memberNumber || '').trim());
  if (!memberNo) {
    const rawDigits = toEnglishDigits(app.applicationNumber || '').replace(/\D/g, '');
    const seq = parseInt(rawDigits.slice(-4) || '1', 10) || 1;
    memberNo = formatSequentialMemberNumber(app.district || 'नाशिक', seq);
  }

  const displayName = `${app.salutation ? app.salutation + ' ' : ''}${app.fullName || ''}`.trim();
  const cadre = normalizeOfficialCadre(app.professional, 'केंद्रप्रमुख / शिक्षण विस्तार अधिकारी');
  const areaText = `${app.district || ''}${app.taluka ? ` (ता. ${app.taluka})` : ''}`;
  const phoneText = toEnglishDigits(app.phone || '');
  const photoSrc = app.photo || photoFallbackUrl;

  return (
    <div
      className="w-full max-w-[640px] aspect-[640/404] bg-white rounded-[16px] border-[2.5px] border-[#0a2a5e] shadow-2xl overflow-hidden relative select-none font-sans"
      style={{
        containerType: 'inline-size',
        boxShadow: '0 14px 35px rgba(10, 42, 94, 0.25), inset 0 0 0 1.5px rgba(255,255,255,0.8)',
      }}
    >
      {/* 1. TOP STRAIGHT OFFICIAL ROYAL-NAVY HEADER & METALLIC GOLD LINE SVG */}
      <svg
        viewBox="0 0 640 112"
        preserveAspectRatio="none"
        className="absolute top-0 left-0 w-full pointer-events-none"
        style={{ height: '27.7%' }}
      >
        <defs>
          <linearGradient id="idPreviewTopBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#041434" />
            <stop offset="45%" stopColor="#0c347a" />
            <stop offset="75%" stopColor="#1449a3" />
            <stop offset="100%" stopColor="#05183d" />
          </linearGradient>
          <radialGradient id="idPreviewTopBlueGlow" cx="62%" cy="42%" r="48%">
            <stop offset="0%" stopColor="#2262cc" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#041434" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="idPreviewTopGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a16207" />
            <stop offset="18%" stopColor="#f5c842" />
            <stop offset="48%" stopColor="#fef08a" />
            <stop offset="75%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#92400e" />
          </linearGradient>
          <filter id="idPreviewGoldDropShadow" x="-2%" y="-10%" width="104%" height="160%">
            <feDropShadow dx="0" dy="1.8" stdDeviation="2" floodColor="#091e42" floodOpacity="0.22" />
          </filter>
        </defs>
        {/* Top Navy Header strictly above straight gold line */}
        <rect x="0" y="0" width="640" height="95" fill="url(#idPreviewTopBlueGrad)" />
        <rect x="0" y="0" width="640" height="95" fill="url(#idPreviewTopBlueGlow)" />
        {/* Straight Metallic Gold Divider Line */}
        <rect x="0" y="95" width="640" height="7" fill="url(#idPreviewTopGoldGrad)" filter="url(#idPreviewGoldDropShadow)" />
        <rect x="0" y="95.4" width="640" height="1" fill="#fef9c3" opacity="0.7" />
        <rect x="0" y="101.2" width="640" height="0.8" fill="#854d0e" opacity="0.85" />
      </svg>

      {/* 2. BOTTOM STRAIGHT OFFICIAL METALLIC GOLD LINE & ROYAL-NAVY FOOTER SVG */}
      <svg
        viewBox="0 0 640 44"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 w-full pointer-events-none"
        style={{ height: '10.9%' }}
      >
        <defs>
          <linearGradient id="idPreviewBottomGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="28%" stopColor="#f5c842" />
            <stop offset="55%" stopColor="#fef08a" />
            <stop offset="82%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#a16207" />
          </linearGradient>
          <linearGradient id="idPreviewBottomBlueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#041434" />
            <stop offset="50%" stopColor="#124294" />
            <stop offset="100%" stopColor="#041434" />
          </linearGradient>
        </defs>
        {/* Straight Metallic Gold Divider Line */}
        <rect x="0" y="8" width="640" height="6" fill="url(#idPreviewBottomGoldGrad)" />
        <rect x="0" y="8.3" width="640" height="0.9" fill="#fef9c3" opacity="0.65" />
        {/* Bottom Navy Footer strictly below straight gold line */}
        <rect x="0" y="14" width="640" height="30" fill="url(#idPreviewBottomBlueGrad)" />
      </svg>

      {/* 3. TOP HEADER CONTENT (Crisp Circular Logo + 3 Title Lines inside straight header) */}
      <div
        className="absolute rounded-full bg-white flex items-center justify-center overflow-hidden"
        style={{
          left: '2.8%',
          top: '1.4%',
          width: '13.3%',
          aspectRatio: '1 / 1',
          border: '0.42cqw solid #eab308',
          boxShadow: '0 0.35cqw 0.9cqw rgba(0,0,0,0.45), 0 0 0 0.2cqw rgba(255,255,255,0.65)',
        }}
      >
        <img
          src={sharpLogoUrl}
          alt="Logo"
          className="w-full h-full object-cover"
        />
      </div>

      <div
        className="absolute text-center flex flex-col items-center justify-center"
        style={{ left: '16.5%', right: '6%', top: '2.6%' }}
      >
        <div
          className="font-serifDevanagari font-extrabold tracking-wide leading-tight"
          style={{ fontSize: '2.35cqw', color: '#fde047', textShadow: '0 0.15cqw 0.4cqw rgba(0,0,0,0.5)' }}
        >
          महाराष्ट्र राज्य
        </div>
        <div
          className="font-serifDevanagari font-black text-white leading-[1.22] tracking-tight whitespace-nowrap"
          style={{ fontSize: '3.85cqw', textShadow: '0 0.25cqw 0.6cqw rgba(0,0,0,0.65)', marginTop: '0.2cqw' }}
        >
          केंद्रप्रमुख व अधिकारी महासंघ
        </div>
        <div
          className="font-bold text-slate-100 leading-tight"
          style={{ fontSize: '1.75cqw', marginTop: '0.85cqw', letterSpacing: '0.02cqw' }}
        >
          नोंदणी क्र. श्रमिक संघ - महा/एनएसके/एन/2427
        </div>
      </div>

      {/* 4. SUB-HEADER BAR ('आजीवन सदस्य' + 'सदस्य क्र:') */}
      <div
        className="absolute text-center"
        style={{ left: '27%', width: '41%', top: '27.6%' }}
      >
        <div
          className="font-serifDevanagari font-black text-[#1e293b] whitespace-nowrap"
          style={{
            fontSize: '3.35cqw',
            lineHeight: '1.25',
          }}
        >
          आजीवन सदस्य
        </div>
      </div>

      <div
        className="absolute text-center leading-tight"
        style={{ right: '1.6%', top: '26.8%', width: '31%' }}
      >
        <div className="font-extrabold text-[#1e293b]" style={{ fontSize: '2.45cqw' }}>
          सदस्य क्र:
        </div>
        <div
          className="font-black text-[#091e42] whitespace-nowrap"
          style={{
            fontFamily: "'Montserrat', 'Arial Black', 'Segoe UI', sans-serif",
            fontWeight: 900,
            fontSize: memberNo.length > 21 ? '2.28cqw' : memberNo.length > 18 ? '2.55cqw' : '2.78cqw',
            letterSpacing: '-0.02cqw',
            marginTop: '0.35cqw',
          }}
        >
          {memberNo}
        </div>
      </div>

      {/* 5. LEFT PASSPORT PHOTO WITH GOLD BORDER */}
      <div
        className="absolute bg-slate-100 overflow-hidden flex items-center justify-center"
        style={{
          left: '3.6%',
          top: '31.2%',
          width: '18.0%',
          height: '35.0%',
          borderRadius: '1.4cqw',
          border: '0.45cqw solid #d4af37',
          boxShadow: '0 0.4cqw 1cqw rgba(0,0,0,0.2)',
        }}
      >
        {photoSrc ? (
          <img key={photoSrc} src={photoSrc} alt={displayName} className="w-full h-full object-cover object-top" />
        ) : (
          <div className="text-slate-400 font-bold" style={{ fontSize: '2cqw' }}>
            फोटो
          </div>
        )}
      </div>

      {/* 6. MIDDLE MEMBER DETAILS */}
      <div
        className="absolute flex flex-col justify-center"
        style={{ left: '24.2%', top: '38.0%', width: '51%' }}
      >
        <div
          className="font-serifDevanagari font-black leading-[1.2]"
          style={{
            fontSize: displayName.length > 32 ? '3.05cqw' : '3.55cqw',
            color: '#b91c1c',
            marginBottom: '1.5cqw',
          }}
        >
          {displayName}
        </div>
        <div
          className="font-bold text-[#0f172a] leading-[1.52] flex flex-col"
          style={{ fontSize: areaText.length > 34 ? '2.1cqw' : '2.3cqw', gap: '0.85cqw' }}
        >
          <div>पद: {cadre}</div>
          <div>कार्यक्षेत्र: {areaText}</div>
          <div>
            मोबाईल: <span className="font-mono font-extrabold">{phoneText}</span>
          </div>
        </div>
      </div>

      {/* 7. RIGHT QR CODE */}
      <div
        className="absolute bg-white flex items-center justify-center"
        style={{ right: '4.2%', top: '43.2%', width: '16.35%', aspectRatio: '1 / 1' }}
      >
        <img
          src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=1&ecc=M&data=https%3A%2F%2Fmahasangh.in"
          alt="QR"
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>

      {/* 8. BOTTOM-LEFT FOOTER TEXT */}
      <div
        className="absolute leading-[1.35]"
        style={{ left: '3.8%', bottom: '11.4%' }}
      >
        <div className="font-extrabold text-[#0b2559]" style={{ fontSize: '2.02cqw' }}>
          महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ
        </div>
        <div className="font-black text-[#991b1b]" style={{ fontSize: '2.12cqw' }}>
          आजीवन डिजिटल आय-कार्ड
        </div>
      </div>

      {/* 9. BOTTOM-RIGHT SIGNATURE & DESIGNATION */}
      <div
        className="absolute text-center flex flex-col items-center"
        style={{ right: '3.2%', bottom: '10.1%', minWidth: '23%' }}
      >
        <img
          src="/sign.jpg"
          alt="स्वाक्षरी"
          style={{
            height: '4.95cqw',
            objectFit: 'contain',
            mixBlendMode: 'multiply',
            filter: 'contrast(150%)',
            marginBottom: '-0.35cqw',
          }}
        />
        <div
          className="font-serifDevanagari font-black text-black leading-[1.18] whitespace-nowrap"
          style={{ fontSize: '2.36cqw' }}
        >
          श्री. राजेंद्र खैरनार
        </div>
        <div className="font-bold text-[#1e293b] leading-[1.18] whitespace-nowrap" style={{ fontSize: '1.66cqw' }}>
          (संस्थापक राज्याध्यक्ष)
        </div>
      </div>
    </div>
  );
};

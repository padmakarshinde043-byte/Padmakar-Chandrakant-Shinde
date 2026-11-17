import React, { useState, useEffect, useMemo } from 'react';
import { Search, Image as ImageIcon, MapPin, Users } from 'lucide-react';
import {
  Leader,
  DEFAULT_AUTHORITATIVE_LEADERS,
  MAHARASHTRA_DISTRICTS,
} from '../data/mahasanghData';
import { fetchDynamicLeaders } from '../services/rkFirebaseService';
import { matchesDistrictName } from '../utils/officialsCache';

interface DistrictLeadershipTabProps {
  setCurrentTab?: (tab: string) => void;
}

const DYNAMIC_LEADERSHIP_STORAGE_KEY = 'mahasangh_dynamic_leadership_v1';

const ROW_GLOSSY_THEMES = [
  {
    card: 'bg-gradient-to-br from-sky-100/90 via-white/95 to-sky-50/90 border-sky-200/90 shadow-[0_10px_28px_-10px_rgba(14,165,233,0.28)]',
    glossTop: 'from-white/90 via-sky-50/70 to-transparent',
    headerBg: 'bg-gradient-to-r from-sky-200/55 via-sky-100/70 to-cyan-100/55 border-sky-200/80 text-sky-950',
    pinColor: 'text-sky-700',
    slotBg: 'bg-white/75 border-sky-200/70',
    photoRing: 'ring-2 ring-sky-200/90',
    roleBadgeLeft: 'bg-sky-100/90 text-sky-900 border-sky-200/90',
    roleBadgeRight: 'bg-cyan-100/90 text-cyan-900 border-cyan-200/90',
    glowOrb: 'bg-sky-200/45',
  },
  {
    card: 'bg-gradient-to-br from-emerald-100/85 via-white/95 to-teal-50/90 border-emerald-200/90 shadow-[0_10px_28px_-10px_rgba(16,185,129,0.25)]',
    glossTop: 'from-white/90 via-emerald-50/70 to-transparent',
    headerBg: 'bg-gradient-to-r from-emerald-200/50 via-emerald-100/70 to-teal-100/55 border-emerald-200/80 text-emerald-950',
    pinColor: 'text-emerald-700',
    slotBg: 'bg-white/75 border-emerald-200/70',
    photoRing: 'ring-2 ring-emerald-200/90',
    roleBadgeLeft: 'bg-emerald-100/90 text-emerald-900 border-emerald-200/90',
    roleBadgeRight: 'bg-teal-100/90 text-teal-900 border-teal-200/90',
    glowOrb: 'bg-emerald-200/40',
  },
  {
    card: 'bg-gradient-to-br from-amber-100/85 via-white/95 to-orange-50/85 border-amber-200/90 shadow-[0_10px_28px_-10px_rgba(245,158,11,0.26)]',
    glossTop: 'from-white/90 via-amber-50/70 to-transparent',
    headerBg: 'bg-gradient-to-r from-amber-200/55 via-amber-100/70 to-orange-100/55 border-amber-200/80 text-amber-950',
    pinColor: 'text-amber-700',
    slotBg: 'bg-white/75 border-amber-200/70',
    photoRing: 'ring-2 ring-amber-200/90',
    roleBadgeLeft: 'bg-amber-100/90 text-amber-900 border-amber-200/90',
    roleBadgeRight: 'bg-orange-100/90 text-orange-900 border-orange-200/90',
    glowOrb: 'bg-amber-200/45',
  },
  {
    card: 'bg-gradient-to-br from-indigo-100/80 via-white/95 to-violet-50/85 border-indigo-200/90 shadow-[0_10px_28px_-10px_rgba(99,102,241,0.24)]',
    glossTop: 'from-white/90 via-indigo-50/70 to-transparent',
    headerBg: 'bg-gradient-to-r from-indigo-200/50 via-indigo-100/65 to-violet-100/55 border-indigo-200/80 text-indigo-950',
    pinColor: 'text-indigo-700',
    slotBg: 'bg-white/75 border-indigo-200/70',
    photoRing: 'ring-2 ring-indigo-200/90',
    roleBadgeLeft: 'bg-indigo-100/90 text-indigo-900 border-indigo-200/90',
    roleBadgeRight: 'bg-violet-100/90 text-violet-900 border-violet-200/90',
    glowOrb: 'bg-indigo-200/40',
  },
  {
    card: 'bg-gradient-to-br from-rose-100/80 via-white/95 to-pink-50/85 border-rose-200/90 shadow-[0_10px_28px_-10px_rgba(244,63,94,0.22)]',
    glossTop: 'from-white/90 via-rose-50/70 to-transparent',
    headerBg: 'bg-gradient-to-r from-rose-200/50 via-rose-100/65 to-pink-100/55 border-rose-200/80 text-rose-950',
    pinColor: 'text-rose-700',
    slotBg: 'bg-white/75 border-rose-200/70',
    photoRing: 'ring-2 ring-rose-200/90',
    roleBadgeLeft: 'bg-rose-100/90 text-rose-900 border-rose-200/90',
    roleBadgeRight: 'bg-pink-100/90 text-pink-900 border-pink-200/90',
    glowOrb: 'bg-rose-200/40',
  },
  {
    card: 'bg-gradient-to-br from-cyan-100/85 via-white/95 to-blue-50/85 border-cyan-200/90 shadow-[0_10px_28px_-10px_rgba(6,182,212,0.24)]',
    glossTop: 'from-white/90 via-cyan-50/70 to-transparent',
    headerBg: 'bg-gradient-to-r from-cyan-200/55 via-cyan-100/70 to-blue-100/55 border-cyan-200/80 text-cyan-950',
    pinColor: 'text-cyan-700',
    slotBg: 'bg-white/75 border-cyan-200/70',
    photoRing: 'ring-2 ring-cyan-200/90',
    roleBadgeLeft: 'bg-cyan-100/90 text-cyan-900 border-cyan-200/90',
    roleBadgeRight: 'bg-blue-100/90 text-blue-900 border-blue-200/90',
    glowOrb: 'bg-cyan-200/40',
  },
] as const;

function normalizeDistrictPairKey(region?: string): string {
  const clean = (region || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/जिल्हा/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';

  const phonetic = clean.replace(/ू/g, 'ु').replace(/ी/g, 'ि').toLowerCase();

  if (
    phonetic.includes('संभाजिनगर') ||
    phonetic.includes('औरंगाबाद') ||
    phonetic.includes('sambhajinagar') ||
    phonetic.includes('aurangabad')
  ) {
    return 'छत्रपती संभाजीनगर';
  }
  if (
    phonetic.includes('धाराशिव') ||
    phonetic.includes('उस्मानाबाद') ||
    phonetic.includes('dharashiv') ||
    phonetic.includes('osmanabad')
  ) {
    return 'धाराशिव';
  }
  if (
    phonetic.includes('अहिल्यानगर') ||
    phonetic.includes('अहमदनगर') ||
    phonetic.includes('ahilyanagar') ||
    phonetic.includes('ahmednagar')
  ) {
    return 'अहिल्यानगर';
  }
  if (phonetic.includes('सिंधुदुर्ग') || phonetic.includes('sindhudurg')) {
    return 'सिंधुदुर्ग';
  }
  if (phonetic.includes('वाशिम') || phonetic.includes('washim')) {
    return 'वाशीम';
  }
  if (phonetic.includes('बुलढाणा') || phonetic.includes('बुलडाणा') || phonetic.includes('buldhana') || phonetic.includes('buldana')) {
    return 'बुलढाणा';
  }

  const canonical = MAHARASHTRA_DISTRICTS.find((d) => {
    const dp = d.replace(/ू/g, 'ु').replace(/ी/g, 'ि').toLowerCase();
    return phonetic === dp || phonetic.includes(dp);
  });

  return canonical || clean;
}

function formatDistrictDisplayTitle(region?: string): string {
  const clean = (region || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!clean) return 'जिल्हा';
  if (clean === 'अहमदनगर') return 'अहिल्यानगर (अहमदनगर)';
  return normalizeDistrictPairKey(clean) || clean;
}

function isPlaceholderLeaderName(name?: string): boolean {
  const clean = (name || '').trim();
  return !clean || clean === '-' || clean === '.' || clean === '0';
}

interface DistrictCapsuleRow {
  districtKey: string;
  districtTitle: string;
  president?: Leader;
  secretary?: Leader;
}

export const DistrictLeadershipTab: React.FC<DistrictLeadershipTabProps> = ({ setCurrentTab }) => {
  const [districtSearch, setDistrictSearch] = useState('');
  const [allLeaders, setAllLeaders] = useState<Leader[]>(() => {
    try {
      const stored = localStorage.getItem(DYNAMIC_LEADERSHIP_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_AUTHORITATIVE_LEADERS;
  });

  const loadLeaders = async (force = false) => {
    try {
      const remoteLeaders = await fetchDynamicLeaders(force);
      if (remoteLeaders && remoteLeaders.length > 0) {
        setAllLeaders(remoteLeaders);
        localStorage.setItem(DYNAMIC_LEADERSHIP_STORAGE_KEY, JSON.stringify(remoteLeaders));
      }
    } catch (e) {
      console.warn('Error loading district leaders:', e);
    }
  };

  useEffect(() => {
    loadLeaders(false);
    const onUpdated = () => loadLeaders(false);
    window.addEventListener('mahasangh_leadership_updated', onUpdated);
    return () => window.removeEventListener('mahasangh_leadership_updated', onUpdated);
  }, []);

  const districtRows = useMemo<DistrictCapsuleRow[]>(() => {
    const presidents = allLeaders.filter(
      (l) => l && (l.category === 'जिल्हा अध्यक्ष' || l.category === 'district')
    );
    const secretaries = allLeaders.filter(
      (l) => l && l.category === 'जिल्हा सरचिटणीस'
    );

    const findMatchingSecretary = (region: string, usedSecIds: Set<string>): Leader | undefined => {
      const normKey = normalizeDistrictPairKey(region);
      const match = secretaries.find((s, idx) => {
        const sid = s.id || `${s.name}-${idx}`;
        if (usedSecIds.has(sid)) return false;
        return (
          matchesDistrictName(s.region, region) ||
          matchesDistrictName(s.region, normKey) ||
          normalizeDistrictPairKey(s.region) === normKey
        );
      });
      if (match) {
        const matchIdx = secretaries.indexOf(match);
        usedSecIds.add(match.id || `${match.name}-${matchIdx}`);
      }
      return match;
    };

    const rows: DistrictCapsuleRow[] = [];
    const seenDistrictKeys = new Set<string>();
    const usedSecretaryIds = new Set<string>();

    // 1. Preserve EXACT existing order of District Presidents
    for (const pres of presidents) {
      const rawRegion = (pres.region || '').trim();
      const key = normalizeDistrictPairKey(rawRegion) || pres.id || pres.name;
      if (!key || seenDistrictKeys.has(key)) continue;
      seenDistrictKeys.add(key);

      const secretary = findMatchingSecretary(rawRegion, usedSecretaryIds);
      rows.push({
        districtKey: key,
        districtTitle: formatDistrictDisplayTitle(rawRegion),
        president: pres,
        secretary,
      });
    }

    // 2. Append any remaining districts from official 34 districts
    for (const dist of MAHARASHTRA_DISTRICTS) {
      const key = normalizeDistrictPairKey(dist);
      if (seenDistrictKeys.has(key)) continue;
      seenDistrictKeys.add(key);
      const secretary = findMatchingSecretary(dist, usedSecretaryIds);
      rows.push({
        districtKey: key,
        districtTitle: dist,
        president: undefined,
        secretary,
      });
    }

    // 3. Any extra custom district secretaries not already included in the 34 districts
    secretaries.forEach((sec, idx) => {
      const sid = sec.id || `${sec.name}-${idx}`;
      if (usedSecretaryIds.has(sid)) return;
      const key = normalizeDistrictPairKey(sec.region) || sid;
      if (seenDistrictKeys.has(key)) return;
      seenDistrictKeys.add(key);
      rows.push({
        districtKey: key,
        districtTitle: formatDistrictDisplayTitle(sec.region),
        president: undefined,
        secretary: sec,
      });
    });

    return rows;
  }, [allLeaders]);

  const filteredRows = useMemo(() => {
    const term = districtSearch.trim().toLowerCase();
    if (!term) return districtRows;
    return districtRows.filter((row) => {
      const distMatch =
        row.districtTitle.toLowerCase().includes(term) ||
        row.districtKey.toLowerCase().includes(term);
      const presMatch = (row.president?.name || '').toLowerCase().includes(term);
      const secMatch = (row.secretary?.name || '').toLowerCase().includes(term);
      return distMatch || presMatch || secMatch;
    });
  }, [districtRows, districtSearch]);

  return (
    <div className="bg-gradient-to-b from-slate-50 via-[#f8fafc] to-slate-100 py-10 md:py-14 text-slate-800">
      {/* Page Header */}
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 mb-8">
        <div className="border-b-2 border-[#102a43] pb-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <span className="text-xs sm:text-sm uppercase tracking-widest font-bold text-amber-700">
              जिल्हास्तरीय नेतृत्व व कार्यकारिणी
            </span>
            <h1 className="font-serifDevanagari text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#0b1e36] mt-1">
              जिल्हा पदाधिकारी
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-1.5">
              राज्यातील प्रत्येक जिल्ह्याचे जिल्हाध्यक्ष व जिल्हा सरचिटणीस यांची एकत्रित माहिती
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="जिल्हा किंवा नाव शोधा..."
                value={districtSearch}
                onChange={(e) => setDistrictSearch(e.target.value)}
                className="w-full text-sm pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:border-amber-500 bg-white shadow-sm"
              />
            </div>

            {setCurrentTab && (
              <button
                type="button"
                onClick={() => {
                  setCurrentTab('leadership');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-4 py-2.5 rounded-xl bg-[#0b1e36] hover:bg-[#132f52] text-amber-300 font-bold text-xs sm:text-sm border border-amber-500/40 shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                ← राज्य पदाधिकारी पहा
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-4 sm:px-6">
        {/* Count Strip */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white/85 backdrop-blur-sm border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-[#0b1e36]">
            <Users className="w-4 h-4 text-amber-600 shrink-0" />
            <span>जिल्हाध्यक्ष व जिल्हा सरचिटणीस कार्यकारिणी</span>
          </div>
          <span className="text-xs sm:text-sm font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
            एकूण जिल्हे: <strong className="font-mono text-[#0b1e36]">{filteredRows.length}</strong>
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-500 shadow-sm">
            कोणताही जिल्हा किंवा पदाधिकारी आढळला नाही.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredRows.map((row, idx) => {
              // Each desktop 3-card row gets its own distinct soft pastel glossy color
              const rowIndex = Math.floor(idx / 3);
              const theme = ROW_GLOSSY_THEMES[rowIndex % ROW_GLOSSY_THEMES.length];

              const pres = row.president;
              const sec = row.secretary;
              const hasPresName = pres && !isPlaceholderLeaderName(pres.name);
              const hasSecName = sec && !isPlaceholderLeaderName(sec.name);

              return (
                <article
                  key={row.districtKey + idx}
                  className={`relative rounded-3xl border backdrop-blur-md p-4 sm:p-4.5 overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${theme.card}`}
                >
                  {/* Glossy specular top highlight */}
                  <div
                    className={`pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b ${theme.glossTop} opacity-80`}
                  />
                  {/* Soft ambient gloss orb */}
                  <div
                    className={`pointer-events-none -right-8 -bottom-8 w-28 h-28 rounded-full blur-2xl absolute ${theme.glowOrb}`}
                  />

                  {/* Top District Header Banner */}
                  <div
                    className={`relative z-10 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl border backdrop-blur-sm mb-3.5 shadow-inner ${theme.headerBg}`}
                  >
                    <MapPin className={`w-4 h-4 shrink-0 ${theme.pinColor}`} />
                    <h2 className="font-serifDevanagari text-base sm:text-lg font-extrabold tracking-tight text-center leading-snug">
                      {row.districtTitle}
                    </h2>
                  </div>

                  {/* Dual Portrait Row: Left = जिल्हाध्यक्ष, Right = जिल्हा सरचिटणीस */}
                  <div className="relative z-10 grid grid-cols-2 gap-3 items-stretch">
                    {/* Left Slot: जिल्हाध्यक्ष */}
                    <div
                      className={`rounded-2xl border p-2.5 flex flex-col items-center text-center shadow-sm backdrop-blur-sm ${theme.slotBg}`}
                    >
                      <div
                        className={`w-full aspect-[4/4.5] rounded-xl overflow-hidden bg-slate-100 mb-2.5 flex items-center justify-center shrink-0 ${theme.photoRing}`}
                      >
                        {pres?.photo ? (
                          <img
                            src={pres.photo}
                            alt={hasPresName ? pres!.name : `${row.districtTitle} जिल्हाध्यक्ष`}
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100/80 px-1">
                            <ImageIcon className="w-7 h-7 opacity-40" />
                            <span className="text-[10px] font-bold mt-1 text-slate-400">फोटो नाही</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 w-full flex flex-col justify-between items-center gap-1.5">
                        <h3 className="font-serifDevanagari text-sm sm:text-[15px] font-bold text-[#0b1e36] leading-snug line-clamp-2">
                          {hasPresName ? pres!.name : '-'}
                        </h3>
                        <span
                          className={`inline-block text-[11px] sm:text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${theme.roleBadgeLeft}`}
                        >
                          जिल्हाध्यक्ष
                        </span>
                      </div>
                    </div>

                    {/* Right Slot: जिल्हा सरचिटणीस */}
                    <div
                      className={`rounded-2xl border p-2.5 flex flex-col items-center text-center shadow-sm backdrop-blur-sm ${theme.slotBg}`}
                    >
                      <div
                        className={`w-full aspect-[4/4.5] rounded-xl overflow-hidden bg-slate-100 mb-2.5 flex items-center justify-center shrink-0 ${theme.photoRing}`}
                      >
                        {sec?.photo ? (
                          <img
                            src={sec.photo}
                            alt={hasSecName ? sec!.name : `${row.districtTitle} जिल्हा सरचिटणीस`}
                            className="w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100/80 px-1">
                            <ImageIcon className="w-7 h-7 opacity-40" />
                            <span className="text-[10px] font-bold mt-1 text-slate-400">फोटो नाही</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 w-full flex flex-col justify-between items-center gap-1.5">
                        <h3 className="font-serifDevanagari text-sm sm:text-[15px] font-bold text-[#0b1e36] leading-snug line-clamp-2">
                          {hasSecName ? sec!.name : '-'}
                        </h3>
                        <span
                          className={`inline-block text-[11px] sm:text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${theme.roleBadgeRight}`}
                        >
                          जिल्हा सरचिटणीस
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

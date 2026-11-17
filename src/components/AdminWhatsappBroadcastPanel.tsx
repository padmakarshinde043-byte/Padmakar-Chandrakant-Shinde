import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Send,
  Settings,
  History,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
  Users,
  Image as ImageIcon,
  Smartphone,
  Eye,
  EyeOff,
  Download,
  UserCheck,
  Search,
} from 'lucide-react';
import {
  MembershipApplication,
  Leader,
  MAHARASHTRA_DISTRICTS,
} from '../data/mahasanghData';
import { OfficialMember } from '../data/rkMaharashtraData';
import { fetchOfficials } from '../services/rkFirebaseService';
import { getAuthHeaders } from '../api/sqlBridge';
import { CloudinaryConfig, uploadToCloudinary } from '../utils/cloudinary';
import { toEnglishDigits, formatDateWithEnglishDigits } from '../utils/formatters';

interface AdminWhatsappBroadcastPanelProps {
  applications: MembershipApplication[];
  dynamicLeaders: Leader[];
  cloudinaryConfig: CloudinaryConfig;
}

type GroupKey =
  | 'approved_members'
  | 'all_applicants'
  | 'district_presidents'
  | 'district_secretaries'
  | 'appointed_officials'
  | 'state_executive'
  | 'women_wing'
  | 'divisional'
  | 'advisory_board';

interface RecipientRecord {
  phone91: string;
  mobile10: string;
  name: string;
  role: string;
  district: string;
  groupLabel: string;
}

interface SanitizedWhatsAppConfig {
  enabled: boolean;
  provider: 'meta_cloud' | 'custom_webhook';
  metaPhoneNumberId: string;
  metaApiVersion: string;
  metaSendMode: 'image_or_text' | 'template';
  metaTemplateName: string;
  metaTemplateLanguage: string;
  hasMetaAccessToken: boolean;
  metaAccessTokenPreview: string;
  customWebhookUrl: string;
  customAuthHeaderName: string;
  hasCustomAuthHeader: boolean;
  customAuthHeaderPreview: string;
  customPayloadStyle: 'standard_json' | 'aisensy' | 'ultramsg' | 'wasender';
  defaultSenderName: string;
  defaultSenderTitle: string;
  defaultSenderPhoto: string;
  delayMs: number;
}

interface CampaignLog {
  id: string;
  createdAt: string;
  sentBy: string;
  senderName: string;
  senderTitle: string;
  photoUrl: string;
  messagePreview: string;
  groups: string[];
  totalTargeted: number;
  sentCount: number;
  failedCount: number;
  provider: string;
  failures: Array<{ phone: string; name: string; error: string }>;
}

const MARATHI_DIGITS = '०१२३४५६७८९';

function normalizeClientPhone(raw?: string): { phone91: string; mobile10: string } | null {
  const converted = String(raw || '').replace(/[०-९]/g, (d) => String(MARATHI_DIGITS.indexOf(d)));
  const digits = converted.replace(/\D/g, '');
  if (!digits) return null;
  let ten = '';
  if (digits.length === 10) ten = digits;
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('091')) ten = digits.slice(3);
  else return null;

  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  // Ignore dummy static placeholders like 9800000049
  if (/^98000000\d{2}$/.test(ten) || /^(\d)\1{9}$/.test(ten)) return null;
  return { phone91: `91${ten}`, mobile10: ten };
}

export const AdminWhatsappBroadcastPanel: React.FC<AdminWhatsappBroadcastPanelProps> = ({
  applications,
  dynamicLeaders,
  cloudinaryConfig,
}) => {
  const [subView, setSubView] = useState<'compose' | 'setup' | 'logs'>('compose');
  const [officialsList, setOfficialsList] = useState<OfficialMember[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Config state
  const [config, setConfig] = useState<SanitizedWhatsAppConfig | null>(null);
  const [metaAccessTokenInput, setMetaAccessTokenInput] = useState('');
  const [customAuthInput, setCustomAuthInput] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configStatusMsg, setConfigStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Detected State President from dynamicLeaders
  const detectedPresident = useMemo(() => {
    return (
      dynamicLeaders.find(
        (l) =>
          (l.role && (l.role.includes('राज्याध्यक्ष') || l.role.includes('राज्य अध्यक्ष'))) ||
          (l.name && l.name.includes('खैरनार'))
      ) || null
    );
  }, [dynamicLeaders]);

  // Compose & Sender State
  const [senderName, setSenderName] = useState('मा. श्री. राजेंद्र खैरनार');
  const [senderTitle, setSenderTitle] = useState('राज्याध्यक्ष, महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ');
  const [senderPhoto, setSenderPhoto] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [includeSignatureHeader, setIncludeSignatureHeader] = useState(true);
  const [messageText, setMessageText] = useState(
    'सप्रेम नमस्कार {नाव} जी,\n\nसर्व केंद्रप्रमुख व अधिकारी बंधू-भगिनींना महत्त्वाची संघटनात्मक सूचना:\n\nआपल्या कार्याबद्दल व सहकार्याबद्दल मनःपूर्वक धन्यवाद!'
  );
  const [selectedGroups, setSelectedGroups] = useState<GroupKey[]>(['district_presidents']);
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [customNumbersText, setCustomNumbersText] = useState('');
  const [excludedPhones, setExcludedPhones] = useState<Set<string>>(new Set());
  const [showRecipientPreview, setShowRecipientPreview] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');

  // Test & Broadcast Execution State
  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [confirmBroadcastOpen, setConfirmBroadcastOpen] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastStatus, setBroadcastStatus] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [lastResult, setLastResult] = useState<{
    campaignId: string;
    totalTargeted: number;
    sentCount: number;
    failedCount: number;
    results: Array<{ phone: string; name: string; group: string; status: 'sent' | 'failed'; error?: string }>;
  } | null>(null);

  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const loadConfigAndOfficials = async () => {
    setIsLoadingData(true);
    try {
      const [cfgRes, logsRes, fetchedOfficials] = await Promise.all([
        fetch('/api/whatsapp/config', { credentials: 'include', headers: getAuthHeaders() }),
        fetch('/api/whatsapp/logs', { credentials: 'include', headers: getAuthHeaders() }),
        fetchOfficials(false).catch(() => [] as OfficialMember[]),
      ]);

      if (cfgRes.ok) {
        const cfgJson = await cfgRes.json();
        if (cfgJson?.config) {
          const c = cfgJson.config as SanitizedWhatsAppConfig;
          setConfig(c);
          if (c.defaultSenderName) setSenderName(c.defaultSenderName);
          if (c.defaultSenderTitle) setSenderTitle(c.defaultSenderTitle);
          if (c.defaultSenderPhoto) {
            setSenderPhoto(c.defaultSenderPhoto);
          } else if (detectedPresident?.photo) {
            setSenderPhoto(detectedPresident.photo);
          }
        }
      }
      if (logsRes.ok) {
        const lJson = await logsRes.json();
        if (Array.isArray(lJson?.logs)) setLogs(lJson.logs);
      }
      if (Array.isArray(fetchedOfficials)) {
        setOfficialsList(fetchedOfficials);
      }
    } catch (err) {
      console.warn('Error loading WhatsApp studio data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    loadConfigAndOfficials();
  }, []);

  useEffect(() => {
    if (detectedPresident) {
      setSenderName((prev) => prev || detectedPresident.name);
      setSenderPhoto((prev) => prev || detectedPresident.photo || '');
    }
  }, [detectedPresident]);

  // Build available group pools with deduplication per group
  const groupPools = useMemo(() => {
    const dedupe = (items: RecipientRecord[]): RecipientRecord[] => {
      const seen = new Set<string>();
      const out: RecipientRecord[] = [];
      for (const item of items) {
        if (seen.has(item.phone91)) continue;
        seen.add(item.phone91);
        out.push(item);
      }
      return out;
    };

    const matchesDist = (dist?: string) =>
      districtFilter === 'ALL' || String(dist || '').trim() === districtFilter;

    const appToRec = (a: MembershipApplication, label: string): RecipientRecord | null => {
      const norm = normalizeClientPhone(a.phone);
      if (!norm || !matchesDist(a.district)) return null;
      return {
        ...norm,
        name: `${a.salutation ? a.salutation + ' ' : ''}${a.fullName || ''}`.trim() || 'सदस्य',
        role: a.professional || 'सदस्य',
        district: a.district || '',
        groupLabel: label,
      };
    };

    const leaderToRec = (l: Leader, label: string): RecipientRecord | null => {
      const norm = normalizeClientPhone(l.phone);
      if (!norm) return null;
      return {
        ...norm,
        name: l.name || 'पदाधिकारी',
        role: l.role || label,
        district: l.region || 'महाराष्ट्र',
        groupLabel: label,
      };
    };

    const officialToRec = (o: OfficialMember, label: string): RecipientRecord | null => {
      const norm = normalizeClientPhone(o.mobile);
      if (!norm || !matchesDist(o.district)) return null;
      const fullName = [o.salutation, o.firstName, o.middleName, o.lastName].filter(Boolean).join(' ').trim();
      return {
        ...norm,
        name: fullName || 'पदाधिकारी',
        role: o.appointedPost || label,
        district: o.district || '',
        groupLabel: label,
      };
    };

    const approvedMembers = dedupe(
      applications
        .filter((a) => a.status === 'approved')
        .map((a) => appToRec(a, 'मंजूर सदस्य'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    const allApplicants = dedupe(
      applications
        .map((a) => appToRec(a, 'नोंदणीकृत अर्जदार'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    const districtPresidents = dedupe([
      ...dynamicLeaders
        .filter((l) => l.category === 'जिल्हा अध्यक्ष' || l.category === 'district')
        .filter((l) => districtFilter === 'ALL' || String(l.region || '').includes(districtFilter))
        .map((l) => leaderToRec(l, 'जिल्हाध्यक्ष'))
        .filter((x): x is RecipientRecord => Boolean(x)),
      ...officialsList
        .filter((o) => (o.appointedPost || '').includes('जिल्हाध्यक्ष'))
        .map((o) => officialToRec(o, 'जिल्हाध्यक्ष'))
        .filter((x): x is RecipientRecord => Boolean(x)),
    ]);

    const districtSecretaries = dedupe([
      ...dynamicLeaders
        .filter((l) => l.category === 'जिल्हा सरचिटणीस')
        .filter((l) => districtFilter === 'ALL' || String(l.region || '').includes(districtFilter))
        .map((l) => leaderToRec(l, 'जिल्हा सरचिटणीस'))
        .filter((x): x is RecipientRecord => Boolean(x)),
      ...officialsList
        .filter((o) => (o.appointedPost || '').includes('जिल्हा सरचिटणीस'))
        .map((o) => officialToRec(o, 'जिल्हा सरचिटणीस'))
        .filter((x): x is RecipientRecord => Boolean(x)),
    ]);

    const appointedOfficials = dedupe(
      officialsList
        .map((o) => officialToRec(o, 'नियुक्त पदाधिकारी'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    const stateExecutive = dedupe(
      dynamicLeaders
        .filter((l) => l.category === 'राज्य कार्यकारिणी' || l.category === 'state')
        .map((l) => leaderToRec(l, 'राज्य कार्यकारिणी'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    const womenWing = dedupe(
      dynamicLeaders
        .filter((l) => l.category === 'महिला आघाडी राज्य कार्यकारिणी')
        .map((l) => leaderToRec(l, 'महिला आघाडी'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    const divisional = dedupe(
      dynamicLeaders
        .filter(
          (l) =>
            l.category === 'विभागीय समन्वयक' ||
            l.category === 'विभागीय कार्यकारिणी' ||
            l.category === 'division'
        )
        .map((l) => leaderToRec(l, 'विभागीय कार्यकारिणी'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    const advisoryBoard = dedupe(
      dynamicLeaders
        .filter(
          (l) =>
            l.category === 'कायदेविषयक सल्लागार' ||
            l.category === 'मार्गदर्शक' ||
            l.category === 'सल्लागार' ||
            l.category === 'राज्य सल्लागार मंडळ'
        )
        .map((l) => leaderToRec(l, 'राज्य सल्लागार मंडळ'))
        .filter((x): x is RecipientRecord => Boolean(x))
    );

    return {
      approved_members: approvedMembers,
      all_applicants: allApplicants,
      district_presidents: districtPresidents,
      district_secretaries: districtSecretaries,
      appointed_officials: appointedOfficials,
      state_executive: stateExecutive,
      women_wing: womenWing,
      divisional,
      advisory_board: advisoryBoard,
    };
  }, [applications, dynamicLeaders, officialsList, districtFilter]);

  const groupMeta: Array<{ key: GroupKey; label: string; hint: string }> = [
    { key: 'district_presidents', label: 'जिल्हाध्यक्ष', hint: 'सर्व जिल्ह्यांचे जिल्हाध्यक्ष' },
    { key: 'district_secretaries', label: 'जिल्हा सरचिटणीस', hint: 'सर्व जिल्ह्यांचे सरचिटणीस' },
    { key: 'appointed_officials', label: 'नियुक्त पदाधिकारी', hint: 'जिल्हा व तालुका नियुक्त अधिकारी' },
    { key: 'approved_members', label: 'सर्व मंजूर सदस्य', hint: 'आजीवन सभासद (Approved Members)' },
    { key: 'all_applicants', label: 'सर्व अर्जदार', hint: 'मंजूर + प्रलंबित सर्व अर्जदार' },
    { key: 'state_executive', label: 'राज्य कार्यकारिणी', hint: 'राज्यस्तरीय पदाधिकारी' },
    { key: 'women_wing', label: 'महिला आघाडी राज्य कार्यकारिणी', hint: 'महिला आघाडी नेतृत्व' },
    { key: 'divisional', label: 'विभागीय कार्यकारिणी', hint: 'सर्व विभागीय समन्वयक व पदाधिकारी' },
    { key: 'advisory_board', label: 'राज्य सल्लागार मंडळ व मार्गदर्शक', hint: 'कायदेविषयक सल्लागार व मार्गदर्शक' },
  ];

  // Combine selected groups + custom numbers, deduplicated by phone91
  const combinedRecipients = useMemo<RecipientRecord[]>(() => {
    const map = new Map<string, RecipientRecord>();
    for (const gKey of selectedGroups) {
      for (const r of groupPools[gKey] || []) {
        if (!map.has(r.phone91)) {
          map.set(r.phone91, r);
        }
      }
    }
    if (customNumbersText.trim()) {
      const tokens = customNumbersText.split(/[\s,;|\n]+/).filter(Boolean);
      for (const t of tokens) {
        const norm = normalizeClientPhone(t);
        if (norm && !map.has(norm.phone91)) {
          map.set(norm.phone91, {
            ...norm,
            name: 'इतर संपर्क',
            role: 'सदस्य',
            district: '',
            groupLabel: 'कस्टम नंबर',
          });
        }
      }
    }
    return Array.from(map.values());
  }, [selectedGroups, groupPools, customNumbersText]);

  const activeRecipients = useMemo(
    () => combinedRecipients.filter((r) => !excludedPhones.has(r.phone91)),
    [combinedRecipients, excludedPhones]
  );

  const filteredPreviewRecipients = useMemo(() => {
    const q = recipientSearch.trim().toLowerCase();
    if (!q) return combinedRecipients;
    return combinedRecipients.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.mobile10.includes(q) ||
        r.district.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
    );
  }, [combinedRecipients, recipientSearch]);

  const toggleGroup = (gKey: GroupKey) => {
    setSelectedGroups((prev) =>
      prev.includes(gKey) ? prev.filter((k) => k !== gKey) : [...prev, gKey]
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!cloudinaryConfig.enabled || !cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
      setBroadcastStatus({
        type: 'error',
        text: 'WhatsApp वर फोटो पाठवण्यासाठी फोटोची सार्वजनिक https:// लिंक आवश्यक असते. कृपया आधी "क्लाउड स्टोरेज" मध्ये Cloudinary सक्रिय करा किंवा थेट https:// फोटो URL पेस्ट करा.',
      });
      return;
    }
    setIsUploadingPhoto(true);
    setBroadcastStatus(null);
    try {
      const result = await uploadToCloudinary(file, cloudinaryConfig);
      setSenderPhoto(result.url);
      setBroadcastStatus({
        type: 'success',
        text: 'राज्याध्यक्षांचा / कार्यक्रमाचा फोटो क्लाउडवर अपलोड होऊन लिंक जोडली गेली आहे!',
      });
    } catch (err: any) {
      setBroadcastStatus({
        type: 'error',
        text: err?.message || 'फोटो अपलोड अयशस्वी झाले.',
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setIsSavingConfig(true);
    setConfigStatusMsg(null);
    try {
      const payload: Record<string, any> = {
        ...config,
        defaultSenderName: senderName,
        defaultSenderTitle: senderTitle,
        defaultSenderPhoto: senderPhoto,
      };
      if (metaAccessTokenInput.trim()) payload.metaAccessToken = metaAccessTokenInput.trim();
      if (customAuthInput.trim()) payload.customAuthHeaderValue = customAuthInput.trim();

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'सेटिंग्ज जतन करता आल्या नाहीत.');
      setConfig(json.config);
      setMetaAccessTokenInput('');
      setCustomAuthInput('');
      setConfigStatusMsg({
        type: 'success',
        text: 'WhatsApp API सेटिंग्ज आणि राज्याध्यक्ष प्रोफाइल सुरक्षितरीत्या जतन झाले आहे!',
      });
    } catch (err: any) {
      setConfigStatusMsg({
        type: 'error',
        text: err?.message || 'सेटिंग्ज जतन करताना त्रुटी आली.',
      });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleSendTestMessage = async () => {
    setBroadcastStatus(null);
    const norm = normalizeClientPhone(testPhone);
    if (!norm) {
      setBroadcastStatus({
        type: 'error',
        text: 'चाचणीसाठी कृपया वैध १० अंकी मोबाईल नंबर प्रविष्ट करा.',
      });
      return;
    }
    setIsSendingTest(true);
    try {
      const res = await fetch('/api/whatsapp/test', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          phone: norm.phone91,
          senderName,
          senderTitle,
          photoUrl: senderPhoto,
          message: messageText,
          includeSignatureHeader,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'चाचणी संदेश अयशस्वी');
      setBroadcastStatus({
        type: 'success',
        text: `चाचणी WhatsApp संदेश +${json.phone} वर यशस्वीरीत्या पाठवला गेला!`,
      });
    } catch (err: any) {
      setBroadcastStatus({
        type: 'error',
        text: err?.message || 'चाचणी संदेश पाठवताना अडचण आली.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleLaunchBroadcast = async () => {
    if (activeRecipients.length === 0) return;
    setIsBroadcasting(true);
    setBroadcastStatus(null);
    setLastResult(null);
    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          recipients: activeRecipients.map((r) => ({
            phone: r.phone91,
            name: r.name,
            role: r.role,
            district: r.district,
            group: r.groupLabel,
          })),
          groups: selectedGroups,
          senderName,
          senderTitle,
          photoUrl: senderPhoto,
          message: messageText,
          includeSignatureHeader,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || 'प्रसारण अयशस्वी झाले.');

      setLastResult(json);
      setConfirmBroadcastOpen(false);
      setBroadcastStatus({
        type: json.failedCount > 0 && json.sentCount === 0 ? 'error' : 'success',
        text: `प्रसारण पूर्ण! एकूण: ${toEnglishDigits(String(json.totalTargeted))}, यशस्वी पाठवले: ${toEnglishDigits(String(json.sentCount))}, अयशस्वी: ${toEnglishDigits(String(json.failedCount))}.`,
      });
      loadConfigAndOfficials();
    } catch (err: any) {
      setBroadcastStatus({
        type: 'error',
        text: err?.message || 'प्रसारण करताना त्रुटी आली.',
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  const downloadResultCsv = () => {
    if (!lastResult) return;
    const header = 'Mobile,Name,Group,Status,Error\n';
    const rows = lastResult.results
      .map(
        (r) =>
          `"${r.phone}","${(r.name || '').replace(/"/g, '""')}","${(r.group || '').replace(/"/g, '""')}","${r.status}","${(r.error || '').replace(/"/g, '""')}"`
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `whatsapp_report_${lastResult.campaignId}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const previewFormattedText = useMemo(() => {
    const sampleName = activeRecipients[0]?.name || 'श्री. राजेश पाटील';
    const sampleRole = activeRecipients[0]?.role || 'जिल्हाध्यक्ष';
    const sampleDist = activeRecipients[0]?.district || 'नाशिक';
    const body = messageText
      .replace(/\{नाव\}|\{name\}/gi, sampleName)
      .replace(/\{पद\}|\{post\}|\{role\}/gi, sampleRole)
      .replace(/\{जिल्हा\}|\{district\}/gi, sampleDist)
      .trim();
    return includeSignatureHeader
      ? `${senderName}\n${senderTitle}\n\n${body}\n\n— महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ (mahasangh.in)`
      : body;
  }, [messageText, senderName, senderTitle, includeSignatureHeader, activeRecipients]);

  return (
    <div className="space-y-6">
      {/* Top Studio Header + Segmented Navigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
              <Smartphone className="w-4 h-4" />
              <span>फक्त सुपर ॲडमिन — अधिकृत WhatsApp API प्रसारण कक्ष</span>
            </div>
            <h2 className="font-serifDevanagari text-xl sm:text-2xl font-extrabold text-[#193568]">
              व्हॉट्सॲप संदेश प्रसारण (राज्याध्यक्षांच्या नावाने व फोटोसह)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              वेबसाईटवरील सर्व सदस्य, जिल्हाध्यक्ष, सरचिटणीस व पदाधिकारी यांचे गट निवडून एकदाच अधिकृत API द्वारे फोटोसह संदेश पाठवा.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setSubView('compose')}
              className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'compose'
                  ? 'bg-[#193568] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>संदेश पाठवा</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('setup')}
              className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'setup'
                  ? 'bg-[#df6b16] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>API सेटअप</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('logs')}
              className={`px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                subView === 'logs'
                  ? 'bg-[#193568] text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>इतिहास ({toEnglishDigits(String(logs.length))})</span>
            </button>
          </div>
        </div>

        {/* Connection Readiness Notice */}
        {config && !config.enabled && subView === 'compose' && (
          <div className="mt-4 p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                <strong>WhatsApp API अद्याप सक्रिय केलेले नाही:</strong> थेट संदेश पाठवण्यासाठी आधी <strong>"API सेटअप"</strong> मध्ये तुमचा Meta WhatsApp Cloud API किंवा Gateway Token जतन करा.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSubView('setup')}
              className="px-3 py-1.5 bg-[#df6b16] text-white rounded-md font-bold text-xs shrink-0 cursor-pointer"
            >
              API सेटअप उघडा →
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: COMPOSE & BROADCAST */}
      {subView === 'compose' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left 7 Cols: Sender Photo + Groups + Message */}
          <div className="xl:col-span-7 space-y-5">
            {/* Step 1: State President Name & Photo */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="font-serifDevanagari font-bold text-base text-[#193568]">
                  १. पाठवणाऱ्याचे नाव व फोटो (राज्याध्यक्ष)
                </h3>
                {senderPhoto && (
                  <span className="text-[11px] font-semibold text-emerald-700">फोटो तयार आहे</span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-24 h-24 rounded-xl bg-slate-100 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
                  {senderPhoto ? (
                    <img
                      src={senderPhoto}
                      alt={senderName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-400" />
                  )}
                </div>

                <div className="flex-1 w-full space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">राज्याध्यक्षांचे नाव</label>
                      <input
                        type="text"
                        value={senderName}
                        onChange={(e) => setSenderName(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">पदनाम व महासंघ ओळ</label>
                      <input
                        type="text"
                        value={senderTitle}
                        onChange={(e) => setSenderTitle(e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:border-[#df6b16]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      राज्याध्यक्षांचा फोटो (सार्वजनिक https:// लिंक किंवा अपलोड)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="url"
                        value={senderPhoto}
                        onChange={(e) => setSenderPhoto(e.target.value)}
                        placeholder="https://res.cloudinary.com/... किंवा थेट फोटो URL"
                        className="flex-1 min-w-[200px] p-2 bg-slate-50 border border-slate-300 rounded-lg text-[11px] focus:bg-white focus:outline-none focus:border-[#df6b16]"
                      />
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={isUploadingPhoto}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg font-bold text-[11px] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingPhoto ? 'अपलोड...' : 'नवीन फोटो अपलोड'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Select Target Groups */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#df6b16]" />
                  <h3 className="font-serifDevanagari font-bold text-base text-[#193568]">
                    २. वेबसाईटवरील गट निवडा (एकापेक्षा जास्त निवडता येतील)
                  </h3>
                </div>
                <select
                  value={districtFilter}
                  onChange={(e) => setDistrictFilter(e.target.value)}
                  className="p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-[#193568]"
                >
                  <option value="ALL">सर्व महाराष्ट्र (सर्व जिल्हे)</option>
                  {MAHARASHTRA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      फक्त जिल्हा: {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {groupMeta.map((g) => {
                  const count = (groupPools[g.key] || []).length;
                  const checked = selectedGroups.includes(g.key);
                  return (
                    <label
                      key={g.key}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer flex items-start gap-2.5 ${
                        checked
                          ? 'bg-emerald-50/70 border-emerald-500'
                          : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGroup(g.key)}
                        className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 truncate">{g.label}</span>
                          <span className="text-xs font-extrabold text-[#193568] tabular-nums shrink-0">
                            {toEnglishDigits(String(count))}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{g.hint}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div>
                <label className="font-bold text-xs text-slate-700 block mb-1">
                  इतर विशेष मोबाईल नंबर (ऐच्छिक — स्वल्पविराम किंवा नवीन ओळीत टाका)
                </label>
                <textarea
                  rows={2}
                  value={customNumbersText}
                  onChange={(e) => setCustomNumbersText(e.target.value)}
                  placeholder="उदा. 9822000000, 9423000000"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:bg-white focus:outline-none focus:border-[#df6b16]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                <div className="font-semibold text-slate-700 tabular-nums">
                  निवडलेले एकूण वैध WhatsApp नंबर:{' '}
                  <strong className="text-base text-emerald-700">
                    {toEnglishDigits(String(activeRecipients.length))}
                  </strong>
                  {isLoadingData && <span className="ml-2 text-slate-500">(डेटा लोड होत आहे...)</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRecipientPreview((p) => !p)}
                  className="text-xs font-bold text-[#193568] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{showRecipientPreview ? 'यादी लपवा' : 'निवडलेल्या नंबरची यादी पहा'}</span>
                </button>
              </div>

              {showRecipientPreview && (
                <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      placeholder="नाव, जिल्हा किंवा मोबाईल नंबर शोधा..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-200 text-xs bg-white rounded border border-slate-200">
                    {filteredPreviewRecipients.slice(0, 200).map((r) => {
                      const included = !excludedPhones.has(r.phone91);
                      return (
                        <label
                          key={r.phone91}
                          className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => {
                                setExcludedPhones((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(r.phone91)) next.delete(r.phone91);
                                  else next.add(r.phone91);
                                  return next;
                                });
                              }}
                              className="w-3.5 h-3.5"
                            />
                            <span className="font-bold text-slate-800 truncate">{r.name}</span>
                            <span className="text-[11px] text-slate-500 truncate">
                              {r.role} {r.district ? `· ${r.district}` : ''}
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-slate-700 shrink-0 tabular-nums">
                            {r.mobile10}
                          </span>
                        </label>
                      );
                    })}
                    {filteredPreviewRecipients.length === 0 && (
                      <div className="p-4 text-center text-slate-500">कोणतेही वैध नंबर सापडले नाहीत.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Message Body */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <h3 className="font-serifDevanagari font-bold text-base text-[#193568]">
                  ३. संदेशाचा मजकूर लिहा
                </h3>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {['{नाव}', '{पद}', '{जिल्हा}'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setMessageText((prev) => `${prev} ${tag}`)}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded border border-slate-300 cursor-pointer"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={6}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="संदेश येथे लिहा..."
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs sm:text-sm leading-relaxed focus:bg-white focus:outline-none focus:border-[#df6b16]"
              />

              <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSignatureHeader}
                  onChange={(e) => setIncludeSignatureHeader(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#df6b16]"
                />
                <span>संदेशाच्या सुरुवातीस राज्याध्यक्षांचे नाव व शेवटी महासंघाची स्वाक्षरी आपोआप जोडा</span>
              </label>
            </div>
          </div>

          {/* Right 5 Cols: Authentic WhatsApp Preview + Test + Broadcast */}
          <div className="xl:col-span-5 space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <h3 className="font-serifDevanagari font-bold text-base text-[#193568] border-b border-slate-200 pb-2.5">
                WhatsApp संदेश कसा दिसेल (Live Preview)
              </h3>

              {/* WhatsApp Chat Bubble Preview */}
              <div className="rounded-xl p-4 bg-[#efeae2] border border-slate-300">
                <div className="bg-white rounded-lg shadow-xs overflow-hidden max-w-[340px] border border-slate-200">
                  {senderPhoto ? (
                    <div className="w-full h-44 bg-slate-100 overflow-hidden">
                      <img
                        src={senderPhoto}
                        alt={senderName}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-24 bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                      राज्याध्यक्षांचा फोटो येथे दिसेल
                    </div>
                  )}
                  <div className="p-3 text-xs text-slate-900 whitespace-pre-wrap leading-relaxed">
                    {previewFormattedText}
                  </div>
                </div>
              </div>

              {broadcastStatus && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold flex items-start gap-2 border ${
                    broadcastStatus.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  {broadcastStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  )}
                  <span>{broadcastStatus.text}</span>
                </div>
              )}

              {/* Single Test Number Box */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  आधी स्वतःच्या नंबरवर चाचणी (Test Send) करा
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="१० अंकी मोबाईल नंबर"
                    className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestMessage}
                    disabled={isSendingTest}
                    className="px-3.5 py-2 bg-[#193568] hover:bg-[#11254a] text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  >
                    {isSendingTest ? 'पाठवत आहे...' : 'चाचणी पाठवा'}
                  </button>
                </div>
              </div>

              {/* Bulk Broadcast Launch */}
              {!confirmBroadcastOpen ? (
                <button
                  type="button"
                  disabled={activeRecipients.length === 0 || isBroadcasting}
                  onClick={() => setConfirmBroadcastOpen(true)}
                  className="w-full py-3.5 px-4 bg-[#16a34a] hover:bg-[#15803d] text-white font-extrabold text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    निवडलेल्या {toEnglishDigits(String(activeRecipients.length))} जणांना WhatsApp संदेश पाठवा
                  </span>
                </button>
              ) : (
                <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 space-y-3 text-xs">
                  <p className="font-extrabold text-amber-950">
                    निश्चित करा: तुम्ही एकाच वेळी {toEnglishDigits(String(activeRecipients.length))} WhatsApp नंबरवर राज्याध्यक्षांच्या नावाने व फोटोसह संदेश पाठवत आहात.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleLaunchBroadcast}
                      disabled={isBroadcasting}
                      className="flex-1 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      {isBroadcasting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>प्रसारण चालू आहे...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>होय, आत्ताच पाठवा</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isBroadcasting}
                      onClick={() => setConfirmBroadcastOpen(false)}
                      className="px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer"
                    >
                      रद्द करा
                    </button>
                  </div>
                </div>
              )}

              {lastResult && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-800">
                    <span>प्रसारण अहवाल (Campaign Report)</span>
                    <button
                      type="button"
                      onClick={downloadResultCsv}
                      className="text-[#193568] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV अहवाल</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                    <div className="bg-white p-2 rounded border border-slate-200">
                      <div className="text-[11px] text-slate-500">एकूण</div>
                      <div className="font-extrabold text-slate-900">{toEnglishDigits(String(lastResult.totalTargeted))}</div>
                    </div>
                    <div className="bg-emerald-50 p-2 rounded border border-emerald-200">
                      <div className="text-[11px] text-emerald-700">यशस्वी</div>
                      <div className="font-extrabold text-emerald-800">{toEnglishDigits(String(lastResult.sentCount))}</div>
                    </div>
                    <div className="bg-rose-50 p-2 rounded border border-rose-200">
                      <div className="text-[11px] text-rose-700">अयशस्वी</div>
                      <div className="font-extrabold text-rose-800">{toEnglishDigits(String(lastResult.failedCount))}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: API SETUP */}
      {subView === 'setup' && config && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveConfig}
            className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4 text-xs"
          >
            <h3 className="font-serifDevanagari font-bold text-lg text-[#193568] border-b border-slate-200 pb-2.5">
              WhatsApp API जोडणी सेटिंग्ज
            </h3>

            {configStatusMsg && (
              <div
                className={`p-3 rounded-lg font-semibold flex items-center gap-2 border ${
                  configStatusMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <span>{configStatusMsg.text}</span>
              </div>
            )}

            <label className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <span className="font-bold text-slate-900 text-sm">
                WhatsApp API प्रसारण सक्रिय ठेवा (Enable API)
              </span>
            </label>

            <div>
              <label className="font-bold text-slate-700 block mb-1.5">API सेवा प्रदाता (Provider)</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, provider: 'meta_cloud' })}
                  className={`p-3 rounded-lg border text-left font-bold cursor-pointer ${
                    config.provider === 'meta_cloud'
                      ? 'bg-[#193568] text-white border-[#193568]'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <div>Meta WhatsApp Cloud API</div>
                  <div className="text-[11px] font-normal opacity-80 mt-0.5">अधिकृत WhatsApp Business API</div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, provider: 'custom_webhook' })}
                  className={`p-3 rounded-lg border text-left font-bold cursor-pointer ${
                    config.provider === 'custom_webhook'
                      ? 'bg-[#df6b16] text-white border-[#df6b16]'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  <div>Indian Gateway / Custom API</div>
                  <div className="text-[11px] font-normal opacity-80 mt-0.5">AiSensy / UltraMsg / WaSender / WATI</div>
                </button>
              </div>
            </div>

            {config.provider === 'meta_cloud' ? (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Meta Phone Number ID</label>
                    <input
                      type="text"
                      value={config.metaPhoneNumberId}
                      onChange={(e) => setConfig({ ...config, metaPhoneNumberId: e.target.value })}
                      placeholder="उदा. 412345678901234"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Graph API Version</label>
                    <input
                      type="text"
                      value={config.metaApiVersion}
                      onChange={(e) => setConfig({ ...config, metaApiVersion: e.target.value })}
                      placeholder="v21.0"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700">
                      Permanent Access Token {config.hasMetaAccessToken && `(सध्या जतन: ${config.metaAccessTokenPreview})`}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSecrets((s) => !s)}
                      className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showSecrets ? 'लपवा' : 'दाखवा'}</span>
                    </button>
                  </div>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={metaAccessTokenInput}
                    onChange={(e) => setMetaAccessTokenInput(e.target.value)}
                    placeholder={config.hasMetaAccessToken ? 'बदलण्यासाठी नवीन Token टाका (जुना सुरक्षित आहे)' : 'EAAG... Token येथे पेस्ट करा'}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">पाठवण्याची पद्धत (Send Mode)</label>
                    <select
                      value={config.metaSendMode}
                      onChange={(e) =>
                        setConfig({ ...config, metaSendMode: e.target.value as 'image_or_text' | 'template' })
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                    >
                      <option value="template">Approved Template (सर्व सदस्यांसाठी)</option>
                      <option value="image_or_text">Direct Image + Caption (24h Window)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Template Name</label>
                    <input
                      type="text"
                      value={config.metaTemplateName}
                      onChange={(e) => setConfig({ ...config, metaTemplateName: e.target.value })}
                      placeholder="mahasangh_president_notice"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Template Language</label>
                    <input
                      type="text"
                      value={config.metaTemplateLanguage}
                      onChange={(e) => setConfig({ ...config, metaTemplateLanguage: e.target.value })}
                      placeholder="mr किंवा en_US"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Gateway API Endpoint URL</label>
                  <input
                    type="url"
                    value={config.customWebhookUrl}
                    onChange={(e) => setConfig({ ...config, customWebhookUrl: e.target.value })}
                    placeholder="https://api.example.com/send-message"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Payload फॉरमॅट</label>
                    <select
                      value={config.customPayloadStyle}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          customPayloadStyle: e.target.value as SanitizedWhatsAppConfig['customPayloadStyle'],
                        })
                      }
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold"
                    >
                      <option value="standard_json">Standard JSON (Webhook / Custom)</option>
                      <option value="aisensy">AiSensy Campaign API</option>
                      <option value="ultramsg">UltraMsg API</option>
                      <option value="wasender">WaSender API</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Auth Header नाव</label>
                    <input
                      type="text"
                      value={config.customAuthHeaderName}
                      onChange={(e) => setConfig({ ...config, customAuthHeaderName: e.target.value })}
                      placeholder="Authorization"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    API Key / Bearer Token {config.hasCustomAuthHeader && `(जतन: ${config.customAuthHeaderPreview})`}
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={customAuthInput}
                    onChange={(e) => setCustomAuthInput(e.target.value)}
                    placeholder={config.hasCustomAuthHeader ? 'बदलण्यासाठी नवीन Key टाका' : 'Bearer xxxxx किंवा API Key'}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSavingConfig}
                className="w-full sm:w-auto px-6 py-3 bg-[#193568] hover:bg-[#11254a] text-white font-bold rounded-lg shadow-xs cursor-pointer disabled:opacity-60"
              >
                {isSavingConfig ? 'सेव्ह होत आहे...' : 'API सेटिंग्ज जतन करा'}
              </button>
            </div>
          </form>

          {/* Setup Guide in Marathi */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3 text-xs text-slate-700 leading-relaxed">
            <h3 className="font-serifDevanagari font-bold text-base text-[#193568] border-b border-slate-200 pb-2">
              WhatsApp API जोडणी मार्गदर्शन (मराठी)
            </h3>
            <p>
              <strong>पर्याय १ — अधिकृत Meta WhatsApp Cloud API:</strong>
            </p>
            <ol className="list-decimal pl-4 space-y-1.5">
              <li>
                <strong>developers.facebook.com</strong> वर Mahasangh Business App तयार करून WhatsApp उत्पादन जोडा.
              </li>
              <li>
                तेथील <strong>Phone Number ID</strong> व <strong>System User Permanent Token</strong> येथे पेस्ट करा.
              </li>
              <li>
                सर्व सदस्यांना एकाच वेळी संदेश पाठवण्यासाठी Meta मध्ये एक <strong>Marketing / Utility Template</strong> (Header: Image + Body: <code className="font-mono">{'{{1}}'}</code>) मंजूर करून घ्या व त्याचे नाव येथे भरा.
              </li>
            </ol>
            <p className="pt-2">
              <strong>पर्याय २ — भारतीय WhatsApp Gateway (AiSensy / WATI / UltraMsg इ.):</strong>
            </p>
            <p>
              जर तुम्हाला Meta Template शिवाय साधा नंबर लिंक करायचा असेल, तर तुमचा Gateway URL व API Key निवडून येथे सेव्ह करा — सर्व्हर आपोआप राज्याध्यक्षांचा फोटो व संदेश पाठवेल.
            </p>
          </div>
        </div>
      )}

      {/* VIEW 3: LOGS */}
      {subView === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
            <h3 className="font-serifDevanagari font-bold text-base sm:text-lg text-[#193568]">
              पूर्वीच्या WhatsApp प्रसारणांचा इतिहास
            </h3>
            <button
              type="button"
              onClick={loadConfigAndOfficials}
              className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
              <span>रिफ्रेश</span>
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-10 text-xs sm:text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
              अद्याप कोणतेही WhatsApp प्रसारण केलेले नाही.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-bold">दिनांक</th>
                    <th className="py-2.5 px-3 font-bold">पाठवणारे (राज्याध्यक्ष)</th>
                    <th className="py-2.5 px-3 font-bold">संदेश सारांश</th>
                    <th className="py-2.5 px-3 font-bold text-right">लक्ष्य</th>
                    <th className="py-2.5 px-3 font-bold text-right">यशस्वी</th>
                    <th className="py-2.5 px-3 font-bold text-right">अयशस्वी</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">
                        {formatDateWithEnglishDigits(l.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[#193568]">{l.senderName}</td>
                      <td className="py-2.5 px-3 max-w-xs truncate text-slate-600">{l.messagePreview}</td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums">{toEnglishDigits(String(l.totalTargeted))}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700 tabular-nums">{toEnglishDigits(String(l.sentCount))}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-700 tabular-nums">{toEnglishDigits(String(l.failedCount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface FeedbackCriterionDef {
  key: FeedbackCriterionKey;
  index: number;
  labelMr: string;
  labelEn: string;
  shortLabelMr: string;
}

export type FeedbackCriterionKey =
  | 'design'
  | 'navigation'
  | 'speed'
  | 'mobile'
  | 'overall';

export type FeedbackRatingsMap = Record<FeedbackCriterionKey, number>;

export interface WebsiteFeedbackRecord {
  id: string;
  designRating: number;
  navigationRating: number;
  speedRating: number;
  mobileRating: number;
  overallRating: number;
  averageRating: number;
  suggestion: string;
  pagePath?: string;
  deviceType?: 'mobile' | 'desktop' | 'unknown';
  createdAt: string;
}

export interface FeedbackCriterionSummary {
  key: FeedbackCriterionKey;
  labelMr: string;
  labelEn: string;
  shortLabelMr: string;
  average: number;
  ratedCount: number;
}

export interface FeedbackAggregateSummary {
  totalResponses: number;
  overallAverage: number;
  withSuggestionsCount: number;
  criteria: FeedbackCriterionSummary[];
  starDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export const FEEDBACK_STORAGE_KEY = 'mahasangh_website_feedback_done_v1';

export const FEEDBACK_CRITERIA: FeedbackCriterionDef[] = [
  {
    key: 'design',
    index: 1,
    labelMr: 'डिझाइन आणि मांडणी',
    labelEn: 'Design & Look',
    shortLabelMr: 'डिझाइन',
  },
  {
    key: 'navigation',
    index: 2,
    labelMr: 'माहिती शोधण्याची सुलभता',
    labelEn: 'Ease of Navigation',
    shortLabelMr: 'सुलभता',
  },
  {
    key: 'speed',
    index: 3,
    labelMr: 'वेबसाइटचा वेग',
    labelEn: 'Speed & Performance',
    shortLabelMr: 'वेग',
  },
  {
    key: 'mobile',
    index: 4,
    labelMr: 'मोबाईलवर दिसण्याची पद्धत',
    labelEn: 'Mobile Experience',
    shortLabelMr: 'मोबाईल',
  },
  {
    key: 'overall',
    index: 5,
    labelMr: 'महासंघाचा हा डिजिटल प्लॅटफॉर्म आपल्याला कसा वाटला?',
    labelEn: 'Overall Digital Platform Experience',
    shortLabelMr: 'एकूण अनुभव',
  },
];

export function clampStarRating(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const rounded = Math.round(num);
  if (rounded < 0) return 0;
  if (rounded > 5) return 5;
  return rounded;
}

export function computeRecordAverageRating(ratings: {
  designRating: number;
  navigationRating: number;
  speedRating: number;
  mobileRating: number;
  overallRating: number;
}): number {
  const values = [
    clampStarRating(ratings.designRating),
    clampStarRating(ratings.navigationRating),
    clampStarRating(ratings.speedRating),
    clampStarRating(ratings.mobileRating),
    clampStarRating(ratings.overallRating),
  ].filter((v) => v >= 1 && v <= 5);

  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

export function validateAndNormalizeFeedbackInput(raw: Record<string, unknown>): {
  valid: boolean;
  error?: string;
  record?: WebsiteFeedbackRecord;
} {
  const designRating = clampStarRating(raw.designRating ?? (raw.ratings as any)?.design);
  const navigationRating = clampStarRating(
    raw.navigationRating ?? (raw.ratings as any)?.navigation
  );
  const speedRating = clampStarRating(raw.speedRating ?? (raw.ratings as any)?.speed);
  const mobileRating = clampStarRating(raw.mobileRating ?? (raw.ratings as any)?.mobile);
  const overallRating = clampStarRating(raw.overallRating ?? (raw.ratings as any)?.overall);

  const ratedValues = [
    designRating,
    navigationRating,
    speedRating,
    mobileRating,
    overallRating,
  ].filter((v) => v >= 1 && v <= 5);

  if (ratedValues.length === 0) {
    return {
      valid: false,
      error: 'कृपया किमान एका मुद्द्यासाठी स्टार रेटिंग द्या.',
    };
  }

  const suggestion = String(raw.suggestion ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, 1000);

  const pagePathRaw = String(raw.pagePath ?? '/').trim().slice(0, 200);
  const pagePath = pagePathRaw.startsWith('/') ? pagePathRaw : '/';

  const rawDevice = String(raw.deviceType ?? '').toLowerCase();
  const deviceType: 'mobile' | 'desktop' | 'unknown' =
    rawDevice === 'mobile' || rawDevice === 'desktop' ? rawDevice : 'unknown';

  const idRaw = String(raw.id ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  const id = idRaw || `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim()
      ? raw.createdAt.trim().slice(0, 64)
      : new Date().toISOString();

  const averageRating = computeRecordAverageRating({
    designRating,
    navigationRating,
    speedRating,
    mobileRating,
    overallRating,
  });

  return {
    valid: true,
    record: {
      id,
      designRating,
      navigationRating,
      speedRating,
      mobileRating,
      overallRating,
      averageRating,
      suggestion,
      pagePath,
      deviceType,
      createdAt,
    },
  };
}

export function computeFeedbackSummary(
  records: WebsiteFeedbackRecord[]
): FeedbackAggregateSummary {
  const starDistribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  if (!Array.isArray(records) || records.length === 0) {
    return {
      totalResponses: 0,
      overallAverage: 0,
      withSuggestionsCount: 0,
      criteria: FEEDBACK_CRITERIA.map((c) => ({
        key: c.key,
        labelMr: c.labelMr,
        labelEn: c.labelEn,
        shortLabelMr: c.shortLabelMr,
        average: 0,
        ratedCount: 0,
      })),
      starDistribution,
    };
  }

  const fieldByKey: Record<FeedbackCriterionKey, keyof WebsiteFeedbackRecord> = {
    design: 'designRating',
    navigation: 'navigationRating',
    speed: 'speedRating',
    mobile: 'mobileRating',
    overall: 'overallRating',
  };

  const criteriaSums: Record<FeedbackCriterionKey, { sum: number; count: number }> = {
    design: { sum: 0, count: 0 },
    navigation: { sum: 0, count: 0 },
    speed: { sum: 0, count: 0 },
    mobile: { sum: 0, count: 0 },
    overall: { sum: 0, count: 0 },
  };

  let overallSum = 0;
  let overallCount = 0;
  let withSuggestionsCount = 0;

  for (const rec of records) {
    if (rec.suggestion && rec.suggestion.trim().length > 0) {
      withSuggestionsCount += 1;
    }

    const avg =
      rec.averageRating > 0
        ? rec.averageRating
        : computeRecordAverageRating(rec);

    if (avg > 0) {
      overallSum += avg;
      overallCount += 1;
      const bucket = Math.min(5, Math.max(1, Math.round(avg))) as 1 | 2 | 3 | 4 | 5;
      starDistribution[bucket] += 1;
    }

    for (const c of FEEDBACK_CRITERIA) {
      const val = clampStarRating(rec[fieldByKey[c.key]]);
      if (val >= 1 && val <= 5) {
        criteriaSums[c.key].sum += val;
        criteriaSums[c.key].count += 1;
      }
    }
  }

  return {
    totalResponses: records.length,
    overallAverage:
      overallCount > 0 ? Math.round((overallSum / overallCount) * 100) / 100 : 0,
    withSuggestionsCount,
    criteria: FEEDBACK_CRITERIA.map((c) => {
      const bucket = criteriaSums[c.key];
      return {
        key: c.key,
        labelMr: c.labelMr,
        labelEn: c.labelEn,
        shortLabelMr: c.shortLabelMr,
        average:
          bucket.count > 0 ? Math.round((bucket.sum / bucket.count) * 100) / 100 : 0,
        ratedCount: bucket.count,
      };
    }),
    starDistribution,
  };
}

export interface VisitorTransitionInput {
  currentTotal: number;
  currentToday: number;
  lastDate: string;
  todayDateStr: string;
  incrementVisit: boolean;
  minBaseline?: number;
}

export interface VisitorTransitionResult {
  today: number;
  total: number;
  shouldPersist: boolean;
}

/**
 * Pure daily IST visitor counter transition helper.
 * - Resets `today` to 1 at 12:00 AM IST on the first visit of the new calendar day.
 * - Auto-heals if `currentToday === 0` (e.g. after manual DB zeroing) so `today` starts cleanly at 1.
 * - Keeps `today` & `total` unchanged when the same browser refreshes on the same IST day.
 */
export function computeNextVisitorStats(input: VisitorTransitionInput): VisitorTransitionResult {
  const minBaseline = input.minBaseline ?? 5155;
  const safeTotal = Math.max(Number(input.currentTotal) || 0, minBaseline);
  const safeToday = Math.max(Number(input.currentToday) || 0, 0);
  const isSameDay = input.lastDate === input.todayDateStr;

  if (!input.incrementVisit) {
    if (!isSameDay || safeToday < 1) {
      return {
        today: 1,
        total: safeTotal,
        shouldPersist: true,
      };
    }
    return {
      today: safeToday,
      total: safeTotal,
      shouldPersist: false,
    };
  }

  const nextTotal = safeTotal + 1;
  const nextToday = isSameDay ? safeToday + 1 : 1;

  return {
    today: nextToday,
    total: nextTotal,
    shouldPersist: true,
  };
}

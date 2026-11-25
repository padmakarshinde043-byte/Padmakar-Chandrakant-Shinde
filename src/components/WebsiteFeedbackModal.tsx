import React, { useEffect, useState } from 'react';
import { X, Star, CheckCircle2, Send } from 'lucide-react';
import {
  FEEDBACK_CRITERIA,
  FeedbackCriterionKey,
  FeedbackRatingsMap,
} from '../utils/feedbackAnalytics';
import {
  hasUserCompletedOrDismissedFeedback,
  markFeedbackPopupHandled,
  submitWebsiteFeedbackToEndpoint,
} from '../services/feedbackService';

interface WebsiteFeedbackModalProps {
  /** Delay before showing popup automatically (default: 7000ms, within 5-10s window) */
  delayMs?: number;
  /** Disable popup on internal routes like /admin or /center-update */
  disabled?: boolean;
}

const INITIAL_RATINGS: FeedbackRatingsMap = {
  design: 0,
  navigation: 0,
  speed: 0,
  mobile: 0,
  overall: 0,
};

export const WebsiteFeedbackModal: React.FC<WebsiteFeedbackModalProps> = ({
  delayMs = 7000,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [ratings, setRatings] = useState<FeedbackRatingsMap>(INITIAL_RATINGS);
  const [hoverRatings, setHoverRatings] = useState<FeedbackRatingsMap>(INITIAL_RATINGS);
  const [suggestion, setSuggestion] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Trigger strictly once per browser after 5-10s (default 7s)
  useEffect(() => {
    if (disabled) return;
    if (hasUserCompletedOrDismissedFeedback()) return;

    const timer = window.setTimeout(() => {
      if (!hasUserCompletedOrDismissedFeedback()) {
        setIsOpen(true);
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, disabled]);

  // Close on Escape key and lock background scroll while open
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        markFeedbackPopupHandled('dismissed');
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isSubmitting]);

  const handleDismiss = () => {
    markFeedbackPopupHandled('dismissed');
    setIsOpen(false);
  };

  const handleSelectStar = (key: FeedbackCriterionKey, value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
    if (errorMsg) setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const hasAnyRating = Object.values(ratings).some((val) => val >= 1 && val <= 5);
    if (!hasAnyRating) {
      setErrorMsg('कृपया किमान एका मुद्द्यासाठी स्टार रेटिंग निवडा.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const deviceType =
        typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop';
      const pagePath =
        typeof window !== 'undefined' ? window.location.pathname || '/' : '/';

      await submitWebsiteFeedbackToEndpoint({
        designRating: ratings.design,
        navigationRating: ratings.navigation,
        speedRating: ratings.speed,
        mobileRating: ratings.mobile,
        overallRating: ratings.overall,
        suggestion,
        pagePath,
        deviceType,
      });

      markFeedbackPopupHandled('submitted');
      setIsSubmitted(true);

      window.setTimeout(() => {
        setIsOpen(false);
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'अभिप्राय पाठवताना तांत्रिक अडचण आली. कृपया पुन्हा प्रयत्न करा.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-[#09172e]/70 backdrop-blur-[2px] mhs-modal-enter"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mhs-feedback-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          handleDismiss();
        }
      }}
    >
      <div className="w-full max-w-[500px] max-h-[94vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-[#FBB03B]/45 overflow-hidden">
        {/* Deep Navy Brand Header (#0F254B) with Golden Yellow (#FBB03B) accent */}
        <div className="relative bg-gradient-to-r from-[#0b1e36] via-[#0F254B] to-[#163363] text-white px-4 sm:px-5 py-3.5 sm:py-4 border-b-2 border-[#FBB03B]">
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="बंद करा"
            title="बंद करा"
            className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBB03B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="pr-9 flex items-center gap-2.5">
            <img
              src="/logo-opt.webp"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/logo.png';
              }}
              alt="महाराष्ट्र राज्य केंद्रप्रमुख व अधिकारी महासंघ"
              className="w-9 h-9 rounded-full ring-2 ring-[#FBB03B] bg-white object-contain shrink-0"
            />
            <div className="min-w-0">
              <h2
                id="mhs-feedback-modal-title"
                className="font-serifDevanagari text-base sm:text-lg font-extrabold text-white leading-tight"
              >
                वेबसाइट अभिप्राय (Feedback)
              </h2>
              <p className="text-[11px] sm:text-xs text-amber-200/95 leading-snug mt-0.5">
                आपली वेबसाइट अधिक चांगली करण्यासाठी तुमचे १ मिनिटाचे मत नोंदवा.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        {isSubmitted ? (
          <div className="px-6 py-10 text-center space-y-3 bg-white">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="font-serifDevanagari text-xl font-extrabold text-[#0F254B]">
              तुमच्या अमूल्य अभिप्रायाबद्दल धन्यवाद!
            </h3>
            <p className="text-sm text-slate-600">
              तुमचे मत महासंघाचे डिजिटल व्यासपीठ अधिक उत्कृष्ट करण्यासाठी मोलाचे ठरेल.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-4 sm:px-5 py-3.5 sm:py-4 space-y-3 bg-white">
            {/* 5 Interactive Star Rating Criteria (Compact single-view layout) */}
            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-xl bg-[#fbf8f2]/55 px-3 sm:px-3.5">
              {FEEDBACK_CRITERIA.map((criterion) => {
                const selectedVal = ratings[criterion.key];
                const activeVal = hoverRatings[criterion.key] || selectedVal;

                return (
                  <div
                    key={criterion.key}
                    className="py-2 sm:py-2.5 flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1.5 sm:gap-3"
                  >
                    <div className="min-w-0 pr-1">
                      <span className="text-[13px] sm:text-sm font-bold text-[#0F254B] leading-snug block">
                        {criterion.index}. {criterion.labelMr}
                      </span>
                    </div>

                    <div
                      className="flex items-center gap-0.5 shrink-0"
                      role="radiogroup"
                      aria-label={criterion.labelMr}
                      onMouseLeave={() =>
                        setHoverRatings((prev) => ({ ...prev, [criterion.key]: 0 }))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((starVal) => {
                        const isLit = starVal <= activeVal;
                        return (
                          <button
                            key={starVal}
                            type="button"
                            role="radio"
                            aria-checked={selectedVal === starVal}
                            aria-label={`${criterion.labelMr} - ${starVal} स्टार`}
                            onMouseEnter={() =>
                              setHoverRatings((prev) => ({
                                ...prev,
                                [criterion.key]: starVal,
                              }))
                            }
                            onClick={() => handleSelectStar(criterion.key, starVal)}
                            className="p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBB03B] transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                          >
                            <Star
                              className={`w-6 h-6 sm:w-[25px] sm:h-[25px] transition-colors ${
                                isLit
                                  ? 'fill-[#FBB03B] text-[#e09112]'
                                  : 'fill-transparent text-slate-300 hover:text-[#FBB03B]'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional Suggestion Textarea */}
            <div>
              <textarea
                rows={2}
                maxLength={1000}
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder="तुमच्या काही महत्त्वाच्या सूचना किंवा सुधारणा असल्यास येथे लिहा (ऐच्छिक)..."
                className="allow-copy w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-[#0F254B] placeholder:text-slate-400 focus:border-[#0F254B] focus:outline-none focus:ring-2 focus:ring-[#FBB03B]/50 resize-none"
              />
            </div>

            {errorMsg && (
              <p
                role="alert"
                className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              >
                {errorMsg}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleDismiss}
                disabled={isSubmitting}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                नंतर कळवतो
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0F254B] to-[#193568] hover:from-[#163363] hover:to-[#1e407d] text-white font-extrabold text-sm shadow-md border-b-2 border-[#FBB03B] transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <Send className="w-4 h-4 text-[#FBB03B] shrink-0" />
                <span>{isSubmitting ? 'पाठवत आहे...' : 'अभिप्राय पाठवा'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default WebsiteFeedbackModal;

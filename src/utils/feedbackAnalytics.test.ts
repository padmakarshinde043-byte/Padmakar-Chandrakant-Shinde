import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampStarRating,
  computeRecordAverageRating,
  validateAndNormalizeFeedbackInput,
  computeFeedbackSummary,
} from './feedbackAnalytics';

test('clampStarRating bounds values cleanly between 0 and 5', () => {
  assert.equal(clampStarRating(5), 5);
  assert.equal(clampStarRating(9), 5);
  assert.equal(clampStarRating(-2), 0);
  assert.equal(clampStarRating('4'), 4);
  assert.equal(clampStarRating(undefined), 0);
});

test('validateAndNormalizeFeedbackInput rejects submission with zero ratings', () => {
  const res = validateAndNormalizeFeedbackInput({
    designRating: 0,
    navigationRating: 0,
    speedRating: 0,
    mobileRating: 0,
    overallRating: 0,
    suggestion: 'छान आहे',
  });
  assert.equal(res.valid, false);
  assert.ok(res.error);
});

test('validateAndNormalizeFeedbackInput normalizes partial ratings and trims suggestion safely', () => {
  const res = validateAndNormalizeFeedbackInput({
    ratings: { design: 5, navigation: 4, speed: 0, mobile: 5, overall: 5 },
    suggestion: '   वेबसाइट अतिशय सुंदर आणि उपयुक्त आहे.   ',
    pagePath: '/membership',
    deviceType: 'mobile',
  });
  assert.equal(res.valid, true);
  assert.ok(res.record);
  assert.equal(res.record.designRating, 5);
  assert.equal(res.record.navigationRating, 4);
  assert.equal(res.record.speedRating, 0);
  assert.equal(res.record.averageRating, 4.75);
  assert.equal(res.record.suggestion, 'वेबसाइट अतिशय सुंदर आणि उपयुक्त आहे.');
  assert.equal(res.record.pagePath, '/membership');
  assert.equal(res.record.deviceType, 'mobile');
});

test('computeFeedbackSummary aggregates overall average, per-criterion averages, and star distribution', () => {
  const r1 = validateAndNormalizeFeedbackInput({
    designRating: 5,
    navigationRating: 4,
    speedRating: 5,
    mobileRating: 4,
    overallRating: 5,
    suggestion: 'अतिशय उत्तम',
  }).record!;
  const r2 = validateAndNormalizeFeedbackInput({
    designRating: 3,
    navigationRating: 4,
    speedRating: 3,
    mobileRating: 4,
    overallRating: 4,
    suggestion: '',
  }).record!;

  assert.equal(computeRecordAverageRating(r1), 4.6);
  const summary = computeFeedbackSummary([r1, r2]);
  assert.equal(summary.totalResponses, 2);
  assert.equal(summary.withSuggestionsCount, 1);
  assert.equal(summary.overallAverage, 4.1);
  assert.equal(summary.criteria.find((c) => c.key === 'design')?.average, 4);
  assert.equal(summary.criteria.find((c) => c.key === 'navigation')?.average, 4);
  assert.equal(summary.criteria.find((c) => c.key === 'overall')?.average, 4.5);
  assert.equal(summary.starDistribution[5], 1);
  assert.equal(summary.starDistribution[4], 1);
});

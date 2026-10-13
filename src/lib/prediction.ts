export type ProgressSample = { report_date: string | Date; progress_quantity: number };
export type PredictionInput = {
  plannedQuantity: number;
  completedQuantity: number;
  progressPercent: number;
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
  targetDailyQuantity?: number | null;
  overrunRatio?: number;
  samples: ProgressSample[];
};

const clamp = (n: number, low = 0, high = 1) => Math.min(high, Math.max(low, n));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
function normalCdf(x: number) {
  const sign = x < 0 ? -1 : 1;
  const value = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * value);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-value * value);
  return 0.5 * (1 + sign * erf);
}
function daysBetween(a: string | Date, b: string | Date) {
  const start = a instanceof Date ? new Date(a.getTime()) : new Date(a);
  start.setHours(0, 0, 0, 0);
  const end = b instanceof Date ? new Date(b.getTime()) : new Date(b);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

export function predictTask(input: PredictionInput) {
  const remaining = Math.max(0, input.plannedQuantity - input.completedQuantity);
  const grouped = new Map<string, number>();
  for (const sample of input.samples) {
    const date = new Date(sample.report_date).toISOString().slice(0, 10);
    grouped.set(date, (grouped.get(date) ?? 0) + Number(sample.progress_quantity));
  }
  const daily = [...grouped.values()].filter((n) => n > 0);
  const meanObserved = daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length : 0;
  const rate = meanObserved || Number(input.targetDailyQuantity) || 0;
  const variance = daily.length > 1 ? daily.reduce((sum, n) => sum + (n - meanObserved) ** 2, 0) / (daily.length - 1) : rate ** 2 * 0.25;
  const deviation = Math.sqrt(variance);
  const horizon = input.dueDate ? Math.max(0, daysBetween(new Date(), input.dueDate)) : 7;
  let scheduleGapPoints = 0;
  if (input.startDate && input.dueDate) {
    const duration = Math.max(1, daysBetween(input.startDate, input.dueDate));
    const elapsed = clamp(daysBetween(input.startDate, new Date()) / duration, 0, 1);
    scheduleGapPoints = Math.max(-40, Math.min(40, input.progressPercent - elapsed * 100));
  } else if (input.dueDate && horizon === 0 && input.progressPercent < 100) {
    const overdueDays = Math.max(0, daysBetween(input.dueDate, new Date()));
    scheduleGapPoints = -Math.min(40, overdueDays * 2);
  }
  const overrun = Math.max(-0.5, Math.min(2, Number(input.overrunRatio) || 0));
  const hasLogisticEvidence = daily.length > 0 || Number(input.targetDailyQuantity) > 0 || Boolean(input.dueDate);
  const logistic = hasLogisticEvidence ? sigmoid(1.15 + 0.055 * scheduleGapPoints - 1.3 * overrun) : null;

  let normal: number | null = null;
  let uniform: number | null = null;
  if (rate > 0 && horizon > 0) {
    const expected = rate * horizon;
    const uncertainty = Math.max(0.001, deviation * Math.sqrt(horizon));
    normal = clamp(normalCdf((expected - remaining) / uncertainty));
    if (daily.length >= 2) {
      const low = Math.min(...daily), high = Math.max(...daily);
      uniform = high === low ? (high * horizon >= remaining ? 1 : 0) : clamp((high - remaining / horizon) / (high - low));
    }
  }
  const availableModels = [logistic, normal, uniform].filter((v): v is number => v !== null);
  const combined = availableModels.length ? availableModels.reduce((a, b) => a + b, 0) / availableModels.length : null;
  const expectedRate = rate;
  return {
    logisticProbability: logistic,
    normalProbability: normal,
    uniformProbability: uniform,
    combinedProbability: combined,
    predictedPercent7d: Math.min(100, input.progressPercent + (expectedRate * 7 / input.plannedQuantity) * 100),
    expectedDailyQuantity: expectedRate,
    remainingQuantity: remaining,
    horizonDays: horizon,
    sampleDays: daily.length,
    evidence: daily.length >= 7 ? 'MOYENNE' : daily.length >= 2 ? 'LIMITÉE' : 'FAIBLE',
    horizonBasis: input.dueDate ? 'ÉCHÉANCE DE LA TÂCHE' : 'PROJECTION À 7 JOURS',
  };
}

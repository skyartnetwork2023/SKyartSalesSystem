export interface YearlyTotal {
  year: number;
  total: number;
}

export interface ForecastResult {
  year: number;
  value: number;
  method: string;
  note: string;
}

const integerFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

type FormatOptions = {
  allowNegative?: boolean;
};

export const formatTZS = (value: number, options?: FormatOptions) => {
  const rounded = Math.round(value);
  const resolved = options?.allowNegative ? rounded : Math.max(0, rounded);
  return `${integerFormatter.format(resolved)}`;
};

export function computeForecast(yearlyTotals: YearlyTotal[]): ForecastResult | null {
  if (!yearlyTotals.length) return null;
  const sorted = [...yearlyTotals].sort((a, b) => a.year - b.year);
  const years = sorted.map((entry) => entry.year);
  const values = sorted.map((entry) => entry.total);
  const lastYear = years[years.length - 1];
  const nextYear = lastYear + 1;

  if (sorted.length >= 3) {
    const n = sorted.length;
    const sumX = years.reduce((sum, year) => sum + year, 0);
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXX = years.reduce((sum, year) => sum + year * year, 0);
    const sumXY = sorted.reduce((sum, entry) => sum + entry.year * entry.total, 0);
    const denominator = n * sumXX - sumX * sumX;
    const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const prediction = Math.max(intercept + slope * nextYear, 0);
    return {
      year: nextYear,
      value: prediction,
      method: 'Linear regression trend',
      note: `Best-fit line across ${n} years (${years[0]}-${lastYear}).`,
    };
  }

  if (sorted.length === 2) {
    const growth = values[0] === 0 ? 0 : values[1] / values[0] - 1;
    const prediction = Math.max(values[1] * (1 + (Number.isFinite(growth) ? growth : 0)) || values[1], 0);
    const pct = Number.isFinite(growth) ? (growth * 100).toFixed(1) : '0.0';
    return {
      year: nextYear,
      value: prediction,
      method: 'Average year-over-year growth',
      note: `Growth rate of ${pct}% observed between ${years[0]} and ${years[1]}.`,
    };
  }

  return {
    year: nextYear,
    value: values[0],
    method: 'Carry-forward baseline',
    note: `Only ${years[0]} is available; repeating last recorded total.`,
  };
}

export function generateFutureForecasts(
  yearlyTotals: YearlyTotal[],
  startYearExclusive: number,
  horizon: number
): ForecastResult[] {
  if (!yearlyTotals.length || horizon <= 0) return [];
  const workingTotals = [...yearlyTotals].sort((a, b) => a.year - b.year);
  const projections: ForecastResult[] = [];
  let iterations = 0;
  const maxIterations = horizon + 10;

  while (projections.length < horizon && iterations < maxIterations) {
    iterations += 1;
    const next = computeForecast(workingTotals);
    if (!next) break;
    workingTotals.push({ year: next.year, total: next.value });
    if (next.year > startYearExclusive) {
      projections.push(next);
    }
  }

  return projections.slice(0, horizon);
}

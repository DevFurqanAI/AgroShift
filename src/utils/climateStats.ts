import { parseClimateMonthlyRecord } from '../components/charts/ClimateCharts';
import type { ClimateHistoryMonthlyPoint } from '../types/api';

export interface IncompleteClimateYearInfo {
  year: number;
  validMonths: number;
  observedRecords: number;
}

export interface ClimatePeriodStats {
  totalRecords: number;
  validTempCount: number;
  validPrecipCount: number;
  yearsWithRecords: number;
  completeYearsCount: number;
  completeYears: number[];
  incompleteYears: IncompleteClimateYearInfo[];
  meanTempC: number | null;
  minTempC: number | null;
  maxTempC: number | null;
  /** Mean annual precipitation computed strictly over complete 12-month calendar years */
  meanAnnualRainMm: number | null;
  /** Backend-aligned climatological annual sum (sum of 12 calendar-month means when all 12 calendar months exist) */
  climatologicalAnnualMeanMm: number | null;
  /** Sum of observed monthly precipitation strictly across complete years */
  completeYearsTotalRainMm: number | null;
  /** Sum of all observed monthly precipitation across all records (including partial years) */
  totalObservedRainMm: number | null;
  meanDailyRate: number | null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInCalendarMonth(year: number, monthNum: number): number {
  if (monthNum === 2) return isLeapYear(year) ? 29 : 28;
  if (monthNum === 4 || monthNum === 6 || monthNum === 9 || monthNum === 11) return 30;
  return 31;
}

/**
 * Summarize historical climate records without dividing partial/incomplete years by total calendar years,
 * and without treating missing monthly observations as 0 mm.
 * Aligns climatological annual sum with backend/app/rotation/rainfall.py and leap-year day counts with nasa_power.py.
 */
export function computeClimatePeriodStats(
  rawMonthly: ClimateHistoryMonthlyPoint[] | null | undefined
): ClimatePeriodStats | null {
  if (!rawMonthly || rawMonthly.length === 0) return null;

  const parsed = rawMonthly
    .map(parseClimateMonthlyRecord)
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (parsed.length === 0) return null;

  const allTemps = parsed
    .map((r) => r.temperatureC)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const allRainRates = parsed
    .map((r) => r.precipMmDay)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const yearBuckets = new Map<
    number,
    { monthRainMm: Map<number, number>; observedRecords: number }
  >();
  const calendarMonthRain = new Map<number, number[]>();

  let validPrecipCount = 0;
  let totalObservedRainMmSum = 0;

  for (const row of parsed) {
    let bucket = yearBuckets.get(row.year);
    if (!bucket) {
      bucket = { monthRainMm: new Map<number, number>(), observedRecords: 0 };
      yearBuckets.set(row.year, bucket);
    }
    bucket.observedRecords += 1;

    const monthlyMm =
      row.estimatedMonthlyMm !== null
        ? row.estimatedMonthlyMm
        : row.precipMmDay !== null
          ? row.precipMmDay * daysInCalendarMonth(row.year, row.monthNum)
          : null;

    if (monthlyMm !== null && Number.isFinite(monthlyMm)) {
      validPrecipCount += 1;
      totalObservedRainMmSum += monthlyMm;
      bucket.monthRainMm.set(row.monthNum, monthlyMm);

      const list = calendarMonthRain.get(row.monthNum) ?? [];
      list.push(monthlyMm);
      calendarMonthRain.set(row.monthNum, list);
    } else if (row.precipMmDay !== null) {
      validPrecipCount += 1;
    }
  }

  const completeYears: number[] = [];
  const incompleteYears: IncompleteClimateYearInfo[] = [];
  let completeYearsTotal = 0;

  const sortedYears = Array.from(yearBuckets.keys()).sort((a, b) => a - b);
  for (const year of sortedYears) {
    const bucket = yearBuckets.get(year)!;
    if (bucket.monthRainMm.size === 12) {
      completeYears.push(year);
      for (const mm of bucket.monthRainMm.values()) {
        completeYearsTotal += mm;
      }
    } else {
      incompleteYears.push({
        year,
        validMonths: bucket.monthRainMm.size,
        observedRecords: bucket.observedRecords,
      });
    }
  }

  const meanAnnualRainMm =
    completeYears.length > 0 ? completeYearsTotal / completeYears.length : null;

  // Align with backend summarize_monthly_rainfall(): sum 12 calendar-month means only if all 12 months have data
  let climatologicalAnnualMeanMm: number | null = null;
  if (calendarMonthRain.size === 12) {
    let sum = 0;
    for (let m = 1; m <= 12; m += 1) {
      const vals = calendarMonthRain.get(m)!;
      sum += vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    climatologicalAnnualMeanMm = Number(sum.toFixed(1));
  }

  return {
    totalRecords: parsed.length,
    validTempCount: allTemps.length,
    validPrecipCount,
    yearsWithRecords: sortedYears.length,
    completeYearsCount: completeYears.length,
    completeYears,
    incompleteYears,
    meanTempC:
      allTemps.length > 0 ? allTemps.reduce((a, b) => a + b, 0) / allTemps.length : null,
    minTempC: allTemps.length > 0 ? Math.min(...allTemps) : null,
    maxTempC: allTemps.length > 0 ? Math.max(...allTemps) : null,
    meanAnnualRainMm:
      meanAnnualRainMm !== null ? Number(meanAnnualRainMm.toFixed(1)) : null,
    climatologicalAnnualMeanMm,
    completeYearsTotalRainMm:
      completeYears.length > 0 ? Number(completeYearsTotal.toFixed(1)) : null,
    totalObservedRainMm:
      validPrecipCount > 0 ? Number(totalObservedRainMmSum.toFixed(1)) : null,
    meanDailyRate:
      allRainRates.length > 0
        ? allRainRates.reduce((a, b) => a + b, 0) / allRainRates.length
        : null,
  };
}

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ClimateHistoryMonthlyPoint } from '../../types/api';
import type { TemperatureUnit } from '../../types/farm';
import { celsiusToFahrenheit } from '../../utils/units';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface ParsedMonthlyClimatePoint {
  year: number;
  monthNum: number;
  monthKey: string;
  label: string;
  temperatureC: number | null;
  precipMmDay: number | null;
  estimatedMonthlyMm: number | null;
}

export function parseClimateMonthlyRecord(
  pt: ClimateHistoryMonthlyPoint
): ParsedMonthlyClimatePoint | null {
  if (!pt || typeof pt.month !== 'string' || !/^\d{6}$/.test(pt.month)) {
    return null;
  }
  const year = Number(pt.month.slice(0, 4));
  const monthNum = Number(pt.month.slice(4, 6));
  if (!Number.isFinite(year) || monthNum < 1 || monthNum > 12) return null;

  const mName = MONTH_NAMES[monthNum - 1] ?? `M${monthNum}`;
  return {
    year,
    monthNum,
    monthKey: pt.month,
    label: `${mName} ${year}`,
    temperatureC:
      pt.temperature_c !== null && pt.temperature_c !== undefined && Number.isFinite(pt.temperature_c)
        ? pt.temperature_c
        : null,
    precipMmDay:
      pt.precipitation_mm_per_day !== null &&
      pt.precipitation_mm_per_day !== undefined &&
      Number.isFinite(pt.precipitation_mm_per_day)
        ? pt.precipitation_mm_per_day
        : null,
    estimatedMonthlyMm:
      pt.estimated_monthly_precipitation_mm !== null &&
      pt.estimated_monthly_precipitation_mm !== undefined &&
      Number.isFinite(pt.estimated_monthly_precipitation_mm)
        ? pt.estimated_monthly_precipitation_mm
        : null,
  };
}

interface ClimateChartsProps {
  monthlyData: ClimateHistoryMonthlyPoint[];
  temperatureUnit: TemperatureUnit;
}

export function ClimateCharts({ monthlyData, temperatureUnit }: ClimateChartsProps) {
  const isF = temperatureUnit === 'fahrenheit';
  const tempUnitLabel = isF ? '°F' : '°C';

  const parsed = monthlyData
    .map(parseClimateMonthlyRecord)
    .filter((x): x is ParsedMonthlyClimatePoint => x !== null)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthNum - b.monthNum));

  const hasEstimatedMonthlyMm = parsed.some((pt) => pt.estimatedMonthlyMm !== null);

  // Build chronological series preserving null gaps (never turn null into 0)
  const chronologicalSeries = parsed.map((pt) => ({
    label: pt.label,
    avgTemp:
      pt.temperatureC === null
        ? null
        : Number((isF ? celsiusToFahrenheit(pt.temperatureC) : pt.temperatureC).toFixed(1)),
    precipValue: hasEstimatedMonthlyMm ? pt.estimatedMonthlyMm : pt.precipMmDay,
  }));

  // Compute monthly climatology (across selected years, averaging only non-null points)
  const monthlyClimatology = MONTH_NAMES.map((name, idx) => {
    const monthNum = idx + 1;
    const rows = parsed.filter((d) => d.monthNum === monthNum);

    const avgNonNull = (vals: Array<number | null>) => {
      const valid = vals.filter((v): v is number => v !== null && Number.isFinite(v));
      if (valid.length === 0) return null;
      return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
    };

    const meanTempC = avgNonNull(rows.map((r) => r.temperatureC));
    const meanPrecip = hasEstimatedMonthlyMm
      ? avgNonNull(rows.map((r) => r.estimatedMonthlyMm))
      : avgNonNull(rows.map((r) => r.precipMmDay));

    return {
      month: name,
      meanTemp:
        meanTempC === null
          ? null
          : Number((isF ? celsiusToFahrenheit(meanTempC) : meanTempC).toFixed(1)),
      meanPrecip,
      sampleCount: rows.length,
    };
  });

  const precipLabel = hasEstimatedMonthlyMm
    ? 'Estimated monthly precipitation (mm)'
    : 'Daily precipitation rate (mm/day)';

  return (
    <div className="space-y-6">
      {/* Temperature Trend Over Selected Period */}
      <section className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            Historical Monthly Mean Temperature ({tempUnitLabel})
          </h3>
          <p className="text-xs text-[var(--as-text-muted)] mt-1">
            NASA POWER historical surface air temperature observations across selected months. Gaps indicate missing observations.
          </p>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chronologicalSeries} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--as-chart-grid)" opacity={0.7} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                stroke="var(--as-chart-grid)"
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                stroke="var(--as-chart-grid)"
                unit={` ${tempUnitLabel}`}
                width={54}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111D18',
                  borderColor: '#23362D',
                  borderRadius: '8px',
                  color: '#E8F1EC',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--as-text-primary)' }} />
              <Line
                type="monotone"
                dataKey="avgTemp"
                name={`Mean Temp (${tempUnitLabel})`}
                stroke="var(--as-chart-temp)"
                strokeWidth={2.25}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Precipitation Trend */}
        <section className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Historical Precipitation Pattern
            </h3>
            <p className="text-xs text-[var(--as-text-muted)] mt-1">
              Displayed unit:{' '}
              <span className="font-medium text-[#172B22] dark:text-[#E8F1EC]">
                {precipLabel}
              </span>
            </p>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chronologicalSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--as-chart-grid)" opacity={0.7} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                  stroke="var(--as-chart-grid)"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                  stroke="var(--as-chart-grid)"
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111D18',
                    borderColor: '#23362D',
                    borderRadius: '8px',
                    color: '#E8F1EC',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="precipValue"
                  name={precipLabel}
                  fill="var(--as-chart-rain)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly Climatology Profile */}
        <section className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Average Seasonal Cycle by Month
            </h3>
            <p className="text-xs text-[var(--as-text-muted)] mt-1">
              Multi-year historical monthly average from NASA POWER (
              {hasEstimatedMonthlyMm ? 'mm est.' : 'mm/day rate'}).
            </p>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyClimatology} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--as-chart-grid)" opacity={0.7} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                  stroke="var(--as-chart-grid)"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                  stroke="var(--as-chart-grid)"
                  width={42}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: 'var(--as-chart-axis)' }}
                  stroke="var(--as-chart-grid)"
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111D18',
                    borderColor: '#23362D',
                    borderRadius: '8px',
                    color: '#E8F1EC',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--as-text-primary)' }} />
                <Bar
                  yAxisId="left"
                  dataKey="meanPrecip"
                  name={
                    hasEstimatedMonthlyMm
                      ? 'Avg Monthly Rain (mm est.)'
                      : 'Avg Rain Rate (mm/day)'
                  }
                  fill="var(--as-chart-rain)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="meanTemp"
                  name={`Avg Temp (${tempUnitLabel})`}
                  fill="var(--as-chart-temp)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

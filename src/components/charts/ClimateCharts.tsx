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

interface ClimateChartsProps {
  monthlyData: ClimateHistoryMonthlyPoint[];
  temperatureUnit: TemperatureUnit;
}

export function ClimateCharts({ monthlyData, temperatureUnit }: ClimateChartsProps) {
  const isF = temperatureUnit === 'fahrenheit';
  const tempUnitLabel = isF ? '°F' : '°C';

  // Determine whether backend provided estimated_monthly_precipitation_mm on records
  const hasEstimatedMonthlyMm = monthlyData.some(
    (pt) =>
      pt.estimated_monthly_precipitation_mm !== null &&
      pt.estimated_monthly_precipitation_mm !== undefined
  );

  // Build chronological series preserving null gaps (never turn null into 0)
  const chronologicalSeries = monthlyData
    .slice()
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .map((pt) => {
      const mLabel = pt.month_label || MONTH_NAMES[(pt.month - 1) % 12] || `M${pt.month}`;
      const toDisplayTemp = (val?: number | null) =>
        val === null || val === undefined || !Number.isFinite(val)
          ? null
          : Number((isF ? celsiusToFahrenheit(val) : val).toFixed(1));

      return {
        label: `${mLabel} ${pt.year}`,
        avgTemp: toDisplayTemp(pt.t2m_c),
        maxTemp: toDisplayTemp(pt.t2m_max_c),
        minTemp: toDisplayTemp(pt.t2m_min_c),
        precipValue: hasEstimatedMonthlyMm
          ? pt.estimated_monthly_precipitation_mm ?? null
          : pt.prectotcorr_mm_day ?? null,
      };
    });

  // Compute monthly climatology (across selected years, averaging only non-null points)
  const monthlyClimatology = MONTH_NAMES.map((name, idx) => {
    const monthNum = idx + 1;
    const rows = monthlyData.filter((d) => d.month === monthNum);

    const avgNonNull = (vals: Array<number | null | undefined>) => {
      const valid = vals.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
      if (valid.length === 0) return null;
      return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
    };

    const meanTempC = avgNonNull(rows.map((r) => r.t2m_c));
    const meanPrecip = hasEstimatedMonthlyMm
      ? avgNonNull(rows.map((r) => r.estimated_monthly_precipitation_mm))
      : avgNonNull(rows.map((r) => r.prectotcorr_mm_day));

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
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            Historical Monthly Temperature ({tempUnitLabel})
          </h3>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
            NASA POWER historical surface air temperature observations across selected months. Gaps indicate missing observations.
          </p>
        </div>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chronologicalSeries} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748B' }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748B' }}
                unit={` ${tempUnitLabel}`}
                width={54}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111D18',
                  borderColor: '#1E2E26',
                  borderRadius: '8px',
                  color: '#E8F1EC',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="avgTemp"
                name={`Mean Temp (${tempUnitLabel})`}
                stroke="#14532D"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="maxTemp"
                name={`Max Temp (${tempUnitLabel})`}
                stroke="#D97706"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="minTemp"
                name={`Min Temp (${tempUnitLabel})`}
                stroke="#10B981"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Precipitation Trend */}
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Historical Precipitation Pattern
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
              Displayed unit: <span className="font-medium text-[#172B22] dark:text-[#E8F1EC]">{precipLabel}</span>
            </p>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chronologicalSeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111D18',
                    borderColor: '#1E2E26',
                    borderRadius: '8px',
                    color: '#E8F1EC',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="precipValue"
                  name={precipLabel}
                  fill="#16A34A"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly Climatology Profile */}
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Average Seasonal Cycle by Month
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
              Multi-year historical monthly average from NASA POWER ({hasEstimatedMonthlyMm ? 'mm est.' : 'mm/day rate'}).
            </p>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyClimatology} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.5} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748B' }} width={42} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  width={42}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111D18',
                    borderColor: '#1E2E26',
                    borderRadius: '8px',
                    color: '#E8F1EC',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  yAxisId="left"
                  dataKey="meanPrecip"
                  name={hasEstimatedMonthlyMm ? 'Avg Monthly Rain (mm est.)' : 'Avg Rain Rate (mm/day)'}
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="meanTemp"
                  name={`Avg Temp (${tempUnitLabel})`}
                  fill="#14532D"
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

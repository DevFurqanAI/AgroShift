import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CloudSun,
  Loader2,
  PlusCircle,
  RefreshCw,
  Info,
} from 'lucide-react';
import { ClimateCharts, parseClimateMonthlyRecord } from '../components/charts/ClimateCharts';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { useAgroShift } from '../context/AgroShiftContext';
import { useClimateHistory } from '../hooks/useClimateHistory';
import { formatCoordinate, formatTemperature } from '../utils/units';

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_END_YEAR = CURRENT_YEAR - 1;
const DEFAULT_START_YEAR = DEFAULT_END_YEAR - 4;

const SEASON_GROUPS: Array<{ label: string; months: number[] }> = [
  { label: 'Dec–Feb', months: [12, 1, 2] },
  { label: 'Mar–May', months: [3, 4, 5] },
  { label: 'Jun–Aug', months: [6, 7, 8] },
  { label: 'Sep–Nov', months: [9, 10, 11] },
];

export function ClimatePage() {
  const { activeFarm, settings } = useAgroShift();

  const [startYear, setStartYear] = useState(DEFAULT_START_YEAR);
  const [endYear, setEndYear] = useState(DEFAULT_END_YEAR);
  const [appliedRange, setAppliedRange] = useState({
    startYear: DEFAULT_START_YEAR,
    endYear: DEFAULT_END_YEAR,
  });
  const [rangeError, setRangeError] = useState<string | null>(null);

  const climateQuery = useClimateHistory({
    farmId: activeFarm?.id,
    latitude: activeFarm?.location.latitude,
    longitude: activeFarm?.location.longitude,
    startYear: appliedRange.startYear,
    endYear: appliedRange.endYear,
    enabled: Boolean(activeFarm),
  });

  const data = climateQuery.data;

  const seasonalSummary = useMemo(() => {
    const rawMonthly = data?.monthly;
    if (!rawMonthly || rawMonthly.length === 0) return [];
    const parsed = rawMonthly
      .map(parseClimateMonthlyRecord)
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (parsed.length === 0) return [];

    return SEASON_GROUPS.map((group) => {
      const rows = parsed.filter((r) => group.months.includes(r.monthNum));
      const temps = rows
        .map((r) => r.temperatureC)
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const monthlyMm = rows
        .map((r) => r.estimatedMonthlyMm)
        .filter((v): v is number => v !== null && Number.isFinite(v));
      const rates = rows
        .map((r) => r.precipMmDay)
        .filter((v): v is number => v !== null && Number.isFinite(v));

      return {
        season: group.label,
        avgTempC: temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
        avgMonthlyMm:
          monthlyMm.length > 0 ? monthlyMm.reduce((a, b) => a + b, 0) / monthlyMm.length : null,
        avgRateMmDay: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
      };
    });
  }, [data?.monthly]);

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<CloudSun className="w-6 h-6" />}
        title="Select or Add a Farm to View Climate Data"
        description="NASA POWER historical climate observations are fetched for your farm's exact coordinates."
        primaryAction={
          <Link
            to="/dashboard/farms/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] text-white"
          >
            <PlusCircle className="w-4 h-4" />
            Add Farm
          </Link>
        }
      />
    );
  }

  const handleApplyRange = (e: React.FormEvent) => {
    e.preventDefault();
    setRangeError(null);
    if (startYear < 1981 || endYear > CURRENT_YEAR) {
      setRangeError(`Select years between 1981 and ${CURRENT_YEAR}.`);
      return;
    }
    if (startYear > endYear) {
      setRangeError('Start year must be earlier than or equal to end year.');
      return;
    }
    if (endYear - startYear > 30) {
      setRangeError('Please select a period of up to 31 years.');
      return;
    }
    setAppliedRange({ startYear, endYear });
  };

  const monthlyRecords = data?.monthly ?? [];

  return (
    <div className="space-y-6">
      {/* Header & Coordinates */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">
            Historical Climate Intelligence — {activeFarm.details.name}
          </h2>
          <p className="text-xs font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] mt-1">
            Source: NASA POWER Historical Observations ·{' '}
            {formatCoordinate(activeFarm.location.latitude, 'lat')} ·{' '}
            {formatCoordinate(activeFarm.location.longitude, 'lon')}
          </p>
        </div>

        {/* Year Range Controls */}
        <form onSubmit={handleApplyRange} className="flex flex-wrap items-end gap-2.5">
          <div>
            <label htmlFor="climate-start" className="block text-[11px] text-[#64748B] mb-1">
              Start Year
            </label>
            <input
              id="climate-start"
              type="number"
              min={1981}
              max={CURRENT_YEAR}
              value={startYear}
              onChange={(e) => setStartYear(Number(e.target.value))}
              className="w-24 px-2.5 py-1.5 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
            />
          </div>
          <div>
            <label htmlFor="climate-end" className="block text-[11px] text-[#64748B] mb-1">
              End Year
            </label>
            <input
              id="climate-end"
              type="number"
              min={1981}
              max={CURRENT_YEAR}
              value={endYear}
              onChange={(e) => setEndYear(Number(e.target.value))}
              className="w-24 px-2.5 py-1.5 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
            />
          </div>
          <button
            type="submit"
            disabled={climateQuery.isFetching}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white disabled:opacity-50 whitespace-nowrap"
          >
            {climateQuery.isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Load Period
          </button>
        </form>
      </div>

      {rangeError && (
        <p role="alert" className="text-xs text-[#DC2626]">
          {rangeError}
        </p>
      )}

      {/* Scientific Context Note */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-4 flex items-start gap-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
        <Info className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-[#172B22] dark:text-[#E8F1EC]">
            Historical Observations vs. Forecasts:
          </strong>{' '}
          NASA POWER records show historical climate behavior at your coordinates—they are not future weather forecasts.{' '}
          {data?.note ? data.note : 'Monthly rainfall estimates are computed from historical satellite and gridded records.'}
        </p>
      </div>

      {/* Loading State */}
      {climateQuery.isLoading && (
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-10 text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" />
          <p className="text-sm font-medium">
            Loading NASA POWER historical climate records ({appliedRange.startYear}–
            {appliedRange.endYear})...
          </p>
        </div>
      )}

      {/* Farmer-Friendly Error State */}
      {climateQuery.isError && (
        <StatusBanner
          tone="error"
          title="Climate Information Temporarily Unavailable"
          description={climateQuery.error.message}
          action={
            <button
              type="button"
              onClick={() => climateQuery.refetch()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#14532D] text-white whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          }
        />
      )}

      {/* Unavailable Data State (data_available === false or empty monthly array) */}
      {data && (!data.data_available || monthlyRecords.length === 0) && (
        <StatusBanner
          tone="warning"
          title="Historical Climate Observations Unavailable for This Period"
          description={
            data.message ||
            'No usable monthly climate observations were returned for this location and year range. Try adjusting the years or retrying.'
          }
          action={
            <button
              type="button"
              onClick={() => climateQuery.refetch()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          }
        />
      )}

      {/* Valid Data Visualizations */}
      {data && data.data_available && monthlyRecords.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-4">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Data Source</p>
              <p className="text-sm font-semibold mt-1">{data.source || 'NASA POWER'}</p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-4">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Observation Window</p>
              <p className="text-sm font-semibold tabular-nums mt-1">
                {data.start_year ?? appliedRange.startYear}–{data.end_year ?? appliedRange.endYear}
              </p>
            </div>
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-4">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Monthly Records</p>
              <p className="text-sm font-semibold tabular-nums mt-1">
                {monthlyRecords.length} months
              </p>
            </div>
          </div>

          <ClimateCharts
            monthlyData={monthlyRecords}
            temperatureUnit={settings.temperatureUnit}
          />

          {seasonalSummary.length > 0 && (
            <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
              <h3 className="text-base font-semibold">Quarter-Year Historical Averages</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {seasonalSummary.map((s) => (
                  <div
                    key={s.season}
                    className="p-3.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-1 text-xs"
                  >
                    <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                      {s.season}
                    </p>
                    <p className="tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                      Avg Temp:{' '}
                      {s.avgTempC !== null
                        ? formatTemperature(s.avgTempC, settings.temperatureUnit)
                        : 'Unavailable'}
                    </p>
                    {s.avgMonthlyMm !== null ? (
                      <p className="tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                        Avg Monthly Rain: {s.avgMonthlyMm.toFixed(1)} mm/mo
                      </p>
                    ) : s.avgRateMmDay !== null ? (
                      <p className="tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                        Rain Rate: {s.avgRateMmDay.toFixed(2)} mm/day
                      </p>
                    ) : (
                      <p className="text-[#64748B]">Precipitation unavailable</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

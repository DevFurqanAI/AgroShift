import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CloudSun,
  Loader2,
  PlusCircle,
  RefreshCw,
  Info,
} from 'lucide-react';
import { ClimateCharts } from '../components/charts/ClimateCharts';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { useAgroShift } from '../context/AgroShiftContext';
import { useClimateHistory } from '../hooks/useClimateHistory';
import { formatCoordinate, formatTemperature } from '../utils/units';

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_END_YEAR = CURRENT_YEAR - 1;
const DEFAULT_START_YEAR = DEFAULT_END_YEAR - 4;

export function ClimatePage() {
  const { activeFarm, backendStatus, settings } = useAgroShift();

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
    enabled: backendStatus.connection.configured && Boolean(activeFarm),
  });

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
    if (endYear - startYear > 10) {
      setRangeError('Please request up to 10 years at a time to respect backend query limits.');
      return;
    }
    setAppliedRange({ startYear, endYear });
  };

  const data = climateQuery.data;

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
            disabled={!backendStatus.connection.configured || climateQuery.isFetching}
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
          NASA POWER records show historical climate behavior at your coordinates—they are not future weather forecasts. Monthly precipitation may be reported as daily rates (mm/day) or backend-estimated monthly totals (mm) depending on endpoint fields.
        </p>
      </div>

      {/* Not Configured State */}
      {!backendStatus.connection.configured && (
        <StatusBanner
          tone="warning"
          title="FastAPI Climate Service Not Configured"
          description="Live NASA POWER queries require the separately hosted Python FastAPI backend (GET /api/v1/climate/history). Your saved farm profile remains safe. Configure VITE_API_BASE_URL or enter a backend URL in Settings."
          action={
            <Link
              to="/dashboard/settings"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#14532D] text-white whitespace-nowrap"
            >
              Open Settings
            </Link>
          }
        />
      )}

      {/* Loading State */}
      {backendStatus.connection.configured && climateQuery.isLoading && (
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-10 text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#16A34A] mx-auto" />
          <p className="text-sm font-medium">
            Requesting NASA POWER historical climate records ({appliedRange.startYear}–
            {appliedRange.endYear})...
          </p>
        </div>
      )}

      {/* Error State */}
      {backendStatus.connection.configured && climateQuery.isError && (
        <StatusBanner
          tone="error"
          title="Unable to Load NASA POWER Climate Data"
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
      {data &&
        (!data.data_available || !data.monthly_data || data.monthly_data.length === 0) && (
          <StatusBanner
            tone="warning"
            title="Historical Climate Observations Unavailable for This Query"
            description={
              data.message ||
              'NASA POWER did not return usable monthly climate observations for this coordinate and year window. No synthetic values are displayed.'
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
      {data && data.data_available && data.monthly_data && data.monthly_data.length > 0 && (
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
                {data.monthly_data.length} months
              </p>
            </div>
          </div>

          <ClimateCharts
            monthlyData={data.monthly_data}
            temperatureUnit={settings.temperatureUnit}
          />

          {data.seasonal_summary && data.seasonal_summary.length > 0 && (
            <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
              <h3 className="text-base font-semibold">Seasonal Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {data.seasonal_summary.map((s) => (
                  <div
                    key={s.season}
                    className="p-3.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-1 text-xs"
                  >
                    <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                      {s.season}
                    </p>
                    <p className="tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                      Avg Temp: {formatTemperature(s.avg_temp_c, settings.temperatureUnit)}
                    </p>
                    {s.estimated_precip_mm !== null && s.estimated_precip_mm !== undefined ? (
                      <p className="tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                        Est. Precip: {s.estimated_precip_mm.toFixed(1)} mm
                      </p>
                    ) : s.mean_precip_mm_day !== null && s.mean_precip_mm_day !== undefined ? (
                      <p className="tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                        Precip Rate: {s.mean_precip_mm_day.toFixed(2)} mm/day
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

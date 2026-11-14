import { Link } from 'react-router-dom';
import {
  Info,
  Loader2,
  PlusCircle,
  RefreshCw,
  Satellite,
} from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { useAgroShift } from '../context/AgroShiftContext';
import { useFieldHealthAnalysis } from '../hooks/useFieldHealth';
import { formatAreaDual, formatCoordinate, formatTemperature } from '../utils/units';

export function FieldHealthPage() {
  const { activeFarm, backendStatus, settings, latestFieldHealthByFarm } = useAgroShift();
  const analyzeMutation = useFieldHealthAnalysis(activeFarm);

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<Satellite className="w-6 h-6" />}
        title="Select or Add a Farm for Field Health"
        description="Field analysis uses your farm's coordinates, area, and optional boundary polygon to request vegetation and weather indicators."
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

  const result = analyzeMutation.data ?? latestFieldHealthByFarm[activeFarm.id] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">
            Field Health & Vegetation Indicators — {activeFarm.details.name}
          </h2>
          <p className="text-xs font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] mt-1">
            {formatCoordinate(activeFarm.location.latitude, 'lat')} ·{' '}
            {formatCoordinate(activeFarm.location.longitude, 'lon')} ·{' '}
            {formatAreaDual(activeFarm.details.areaHectares)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => analyzeMutation.mutate()}
          disabled={!backendStatus.connection.configured || analyzeMutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white disabled:opacity-50 transition-colors whitespace-nowrap self-start"
        >
          {analyzeMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {result ? 'Refresh Field Analysis' : 'Run Field Analysis'}
        </button>
      </div>

      {/* Attribution & Methodological Transparency */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-4 flex items-start gap-3 text-xs text-[#64748B] dark:text-[#94A3B8]">
        <Info className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-[#172B22] dark:text-[#E8F1EC]">
              Attribution:
            </strong>{' '}
            Vegetation indices (NDVI and NDMI) come from{' '}
            <strong className="text-[#172B22] dark:text-[#E8F1EC]">
              ESA / Copernicus Sentinel-2
            </strong>{' '}
            optical imagery (separate from NASA POWER climate records). Weather observations come from Open-Meteo / configured weather providers.
          </p>
          <p>
            NDVI and NDMI are canopy vegetation and moisture indicators—not direct soil fertility lab tests or confirmed agronomic diagnoses.
          </p>
        </div>
      </div>

      {!backendStatus.connection.configured && (
        <StatusBanner
          tone="warning"
          title="FastAPI Field Analysis Service Not Configured"
          description="Analyzing Copernicus Sentinel-2 vegetation indices (POST /api/v1/analyze) requires a connected FastAPI backend. Configure VITE_API_BASE_URL or enter your backend URL in Settings."
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

      {analyzeMutation.isError && (
        <StatusBanner
          tone="error"
          title="Field Analysis Request Failed"
          description={analyzeMutation.error.message}
          action={
            <button
              type="button"
              onClick={() => analyzeMutation.mutate()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#14532D] text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          }
        />
      )}

      {!result && backendStatus.connection.configured && !analyzeMutation.isPending && !analyzeMutation.isError && (
        <EmptyState
          icon={<Satellite className="w-6 h-6" />}
          title="No Field Analysis Loaded Yet"
          description="Click Run Field Analysis to request the latest available ESA / Copernicus Sentinel-2 NDVI & NDMI vegetation indicators and weather context for this farm."
        />
      )}

      {result && result.data_available === false && (
        <StatusBanner
          tone="warning"
          title="Field Observations Currently Unavailable"
          description={
            result.message ||
            'The backend reported that satellite or weather observations were unavailable for this field at this time. No placeholder measurements are shown.'
          }
        />
      )}

      {result && result.data_available !== false && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                NDVI Vegetation Indicator
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.ndvi !== null && result.ndvi !== undefined
                  ? result.ndvi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.ndvi_category
                  ? `Indicator band: ${result.ndvi_category} (not a soil diagnosis)`
                  : 'Copernicus Sentinel-2 canopy vigor indicator'}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                NDMI Moisture Indicator
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.ndmi !== null && result.ndmi !== undefined
                  ? result.ndmi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.ndmi_category
                  ? `Indicator band: ${result.ndmi_category}`
                  : 'Canopy water content indicator'}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Latest Imagery Date
              </p>
              <p className="text-base font-semibold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.observation_date || 'Not reported'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.cloud_cover_percent !== null &&
                result.cloud_cover_percent !== undefined
                  ? `Approx. unusable sampled pixels: ${result.cloud_cover_percent.toFixed(
                      1
                    )}% (not meteorological cloud cover)`
                  : 'Pixel usability rate not reported'}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Current Weather Context
              </p>
              <p className="text-base font-semibold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.weather?.temperature_c !== null &&
                result.weather?.temperature_c !== undefined
                  ? formatTemperature(result.weather.temperature_c, settings.temperatureUnit)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.weather?.condition || result.weather?.source || 'Weather provider context'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
              <h3 className="text-base font-semibold">Field Condition Summary</h3>
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                {result.field_explanation ||
                  'No narrative field explanation was returned by the backend.'}
              </p>
            </section>

            <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
              <h3 className="text-base font-semibold">Confidence & Limitations</h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Reported confidence:{' '}
                <span className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                  {result.confidence || 'Not specified'}
                </span>
              </p>
              {result.limitations && result.limitations.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
                  {result.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  Optical satellite indicators can be affected by cloud shadow, small field size relative to 10m–20m pixels, and bare soil reflectance between seasons.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  CheckCircle2,
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

function formatStatusBand(band: string | null | undefined): string {
  if (!band) return 'Not available';
  return band
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function FieldHealthPage() {
  const { activeFarm, settings, latestFieldHealthByFarm } = useAgroShift();
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
          disabled={analyzeMutation.isPending}
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
            optical imagery (separate from NASA POWER climate records). Weather observations come from Open-Meteo / fallback weather providers.
          </p>
          <p>
            NDVI and NDMI are canopy vegetation and moisture indicators—not direct soil fertility lab tests or confirmed agronomic diagnoses.
          </p>
        </div>
      </div>

      {analyzeMutation.isError && (
        <StatusBanner
          tone="error"
          title="Field Analysis Temporarily Unavailable"
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

      {!result && !analyzeMutation.isPending && !analyzeMutation.isError && (
        <EmptyState
          icon={<Satellite className="w-6 h-6" />}
          title="No Field Analysis Loaded Yet"
          description="Click Run Field Analysis to request the latest available ESA / Copernicus Sentinel-2 NDVI & NDMI vegetation indicators and weather context for this farm."
        />
      )}

      {result && (
        <div className="space-y-6">
          {/* Partial availability alerts when satellite or weather was unavailable */}
          {!result.satellite_available && (
            <StatusBanner
              tone="warning"
              title="Satellite Imagery Currently Unavailable"
              description={
                result.satellite_message ||
                'No cloud-free Sentinel-2 observation was available for this field recently. No synthetic vegetation values are shown.'
              }
            />
          )}

          {!result.weather_available && (
            <StatusBanner
              tone="warning"
              title="Current Weather Observations Unavailable"
              description={
                result.weather_message ||
                'Current weather readings could not be retrieved for this location right now.'
              }
            />
          )}

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                NDVI Vegetation Indicator
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.satellite_available &&
                result.ndvi !== null &&
                result.ndvi !== undefined
                  ? result.ndvi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.ndvi_status
                  ? `Indicator band: ${formatStatusBand(result.ndvi_status)}`
                  : 'Copernicus Sentinel-2 canopy vigor indicator'}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                NDMI Moisture Indicator
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.satellite_available &&
                result.ndmi !== null &&
                result.ndmi !== undefined
                  ? result.ndmi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.ndmi_status
                  ? `Indicator band: ${formatStatusBand(result.ndmi_status)}`
                  : 'Canopy water content indicator'}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Latest Satellite Date
              </p>
              <p className="text-base font-semibold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.satellite_observation_date || 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.cloud_cover_percent !== null &&
                result.cloud_cover_percent !== undefined
                  ? `Approx. unusable sampled pixels: ${result.cloud_cover_percent.toFixed(
                      1
                    )}%`
                  : 'Pixel usability rate not reported'}
              </p>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1">
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Recent Weather Context
              </p>
              <p className="text-base font-semibold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
                {result.weather_available &&
                result.temperature_c !== null &&
                result.temperature_c !== undefined
                  ? formatTemperature(result.temperature_c, settings.temperatureUnit)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {result.weather_available
                  ? [
                      result.humidity_percent !== null &&
                      result.humidity_percent !== undefined
                        ? `Humidity ${result.humidity_percent}%`
                        : null,
                      result.recent_rainfall_mm !== null &&
                      result.recent_rainfall_mm !== undefined
                        ? `Rain ${result.recent_rainfall_mm} mm`
                        : null,
                      result.heat_risk ? `Heat risk: ${formatStatusBand(result.heat_risk)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Weather context loaded'
                  : 'Weather provider unavailable'}
              </p>
            </div>
          </div>

          {/* Summary, Recommendations & Confidence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Field Condition Summary</h3>
                <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                  Confidence: {formatStatusBand(result.analysis_confidence)}
                </span>
              </div>
              <p className="text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                {result.ai_explanation ||
                  'No field explanation was returned.'}
              </p>
              {result.possible_water_stress !== null &&
                result.possible_water_stress !== undefined && (
                  <p className="text-xs font-medium text-[#172B22] dark:text-[#E8F1EC]">
                    Moisture stress signal:{' '}
                    {result.possible_water_stress
                      ? 'Possible moisture stress detected — inspect field moisture'
                      : 'No acute moisture-stress signal flagged'}
                  </p>
                )}
            </section>

            <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
              <h3 className="text-base font-semibold">Practical Next Checks</h3>
              {result.recommendations && result.recommendations.length > 0 ? (
                <ul className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
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

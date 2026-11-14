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
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary"
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
            Field Health &amp; Vegetation Indicators — {activeFarm.details.name}
          </h2>
          <p className="text-xs font-mono tabular-nums text-[var(--as-text-muted)] mt-1">
            {formatCoordinate(activeFarm.location.latitude, 'lat')} ·{' '}
            {formatCoordinate(activeFarm.location.longitude, 'lon')} ·{' '}
            {formatAreaDual(activeFarm.details.areaHectares)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap self-start"
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
      <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-4 flex items-start gap-3 text-xs text-[var(--as-text-muted)]">
        <Info className="w-4 h-4 as-text-accent shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-[var(--as-text)]">
              Attribution:
            </strong>{' '}
            Vegetation indices (NDVI and NDMI) come from{' '}
            <strong className="text-[var(--as-text)]">
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg as-btn-primary"
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
              title={
                result.weather_available
                  ? 'Weather Data Loaded — Satellite Imagery Temporarily Unavailable'
                  : 'Satellite Imagery Currently Unavailable'
              }
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
            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-1">
              <p className="text-xs text-[var(--as-text-muted)]">
                NDVI Vegetation Indicator
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[var(--as-text)]">
                {result.satellite_available &&
                result.ndvi !== null &&
                result.ndvi !== undefined
                  ? result.ndvi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[var(--as-text-muted)]">
                {result.ndvi_status
                  ? `Indicator band: ${formatStatusBand(result.ndvi_status)}`
                  : 'Copernicus Sentinel-2 canopy vigor indicator'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-1">
              <p className="text-xs text-[var(--as-text-muted)]">
                NDMI Moisture Indicator
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[var(--as-text)]">
                {result.satellite_available &&
                result.ndmi !== null &&
                result.ndmi !== undefined
                  ? result.ndmi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[var(--as-text-muted)]">
                {result.ndmi_status
                  ? `Indicator band: ${formatStatusBand(result.ndmi_status)}`
                  : 'Canopy water content indicator'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-1">
              <p className="text-xs text-[var(--as-text-muted)]">
                Latest Satellite Date
              </p>
              <p className="text-base font-semibold tabular-nums text-[var(--as-text)]">
                {result.satellite_observation_date || 'Unavailable'}
              </p>
              <p className="text-xs text-[var(--as-text-muted)]">
                {result.cloud_cover_percent !== null &&
                result.cloud_cover_percent !== undefined
                  ? `Approx. unusable sampled pixels: ${result.cloud_cover_percent.toFixed(
                      1
                    )}%`
                  : 'Pixel usability rate not reported'}
              </p>
            </div>

            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-1">
              <p className="text-xs text-[var(--as-text-muted)]">
                Recent Weather Context
              </p>
              <p className="text-base font-semibold tabular-nums text-[var(--as-text)]">
                {result.weather_available &&
                result.temperature_c !== null &&
                result.temperature_c !== undefined
                  ? formatTemperature(result.temperature_c, settings.temperatureUnit)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[var(--as-text-muted)]">
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
            <section className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Field Condition Summary</h3>
                <span className="text-xs font-medium text-[var(--as-text-muted)]">
                  Confidence: {formatStatusBand(result.analysis_confidence)}
                </span>
              </div>
              <p className="text-sm text-[var(--as-text-muted)] leading-relaxed">
                {result.ai_explanation ||
                  'No field explanation was returned.'}
              </p>
              {result.possible_water_stress !== null &&
                result.possible_water_stress !== undefined && (
                  <p className="text-xs font-medium text-[var(--as-text)]">
                    Moisture stress signal:{' '}
                    {result.possible_water_stress
                      ? 'Possible moisture stress detected — inspect field moisture'
                      : 'No acute moisture-stress signal flagged'}
                  </p>
                )}
            </section>

            <section className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-3">
              <h3 className="text-base font-semibold">Practical Next Checks</h3>
              {result.recommendations && result.recommendations.length > 0 ? (
                <ul className="space-y-2">
                  {result.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-[var(--as-text-muted)]"
                    >
                      <CheckCircle2 className="w-4 h-4 as-text-accent shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--as-text-muted)]">
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

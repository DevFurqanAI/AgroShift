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
import { IndexRangeMeter, InfoTooltipHint } from '../components/common/MetricPrimitives';
import { StatusBanner } from '../components/common/StatusBanner';
import { useAgroShift } from '../context/AgroShiftContext';
import { useFieldHealthAnalysis } from '../hooks/useFieldHealth';
import type { FieldAnalyzeResponse } from '../types/api';
import { formatAreaDual, formatCoordinate, formatTemperature } from '../utils/units';

function formatStatusBand(band: string | null | undefined): string {
  if (!band) return 'Not available';
  return band
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function describeDataAvailability(result: FieldAnalyzeResponse): string {
  if (result.satellite_available && result.weather_available) {
    return 'Satellite + Weather loaded';
  }
  if (result.satellite_available) {
    return 'Satellite only (weather unavailable)';
  }
  if (result.weather_available) {
    return 'Weather only (satellite unavailable)';
  }
  return 'Observations unavailable';
}

export function describeObservationQuality(result: FieldAnalyzeResponse): string {
  if (result.observation_quality) {
    return formatStatusBand(result.observation_quality);
  }
  if (!result.satellite_available && !result.weather_available) return 'Unavailable';
  if (!result.satellite_available) return 'Limited';
  const excluded = result.excluded_pixel_percent ?? result.cloud_cover_percent;
  if (!result.weather_available || (excluded !== null && excluded !== undefined && excluded > 50)) {
    return 'Limited';
  }
  if (excluded !== null && excluded !== undefined && excluded > 20) {
    return 'Moderate';
  }
  return 'Good';
}

export function describeInterpretationConfidence(result: FieldAnalyzeResponse): string {
  if (!result.satellite_available || !result.weather_available) {
    return 'Low (incomplete data)';
  }
  if (result.ndvi !== null && result.ndvi !== undefined && result.ndvi < 0.2) {
    return 'Low (sparse/bare cover)';
  }
  const excluded = result.excluded_pixel_percent ?? result.cloud_cover_percent;
  if (excluded !== null && excluded !== undefined && excluded > 40) {
    return 'Low (high masked pixels)';
  }
  const raw = (result.analysis_confidence || '').toUpperCase();
  if (raw === 'LOW') {
    return 'Low';
  }
  // Single-date remote sensing without crop/stage/soil ground truth never exceeds screening (Moderate).
  return 'Screening only (Moderate)';
}

export function describeMoistureStress(result: FieldAnalyzeResponse): string {
  if (!result.satellite_available || !result.weather_available) {
    return 'Unavailable — both satellite moisture indicators and weather context are needed for screening; check field moisture directly.';
  }
  if (
    result.moisture_stress_status === 'INCONCLUSIVE_LOW_VEGETATION' ||
    (result.ndvi !== null && result.ndvi !== undefined && result.ndvi < 0.2)
  ) {
    return 'Inconclusive — very low vegetation cover means optical NDMI mainly reflects bare soil, residue, or early emergence rather than crop water status.';
  }
  if (result.moisture_stress_status === 'POSSIBLE_STRESS' || result.possible_water_stress === true) {
    return 'Possible moisture-stress pattern — check crop canopy and root-zone soil moisture on site.';
  }
  if (
    result.moisture_stress_status === 'INCONCLUSIVE_MIXED' ||
    result.possible_water_stress === null ||
    result.possible_water_stress === undefined
  ) {
    return 'Inconclusive — single-date optical indices and 1-day weather cannot confirm or rule out crop moisture stress; check root-zone moisture on site.';
  }
  return 'No combined heat-and-low-NDMI alert in this snapshot (cannot rule out localized field stress without an on-site check).';
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
            optical imagery (separate from NASA POWER climate records).{' '}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium as-text-accent underline hover:opacity-80"
            >
              Weather data by Open-Meteo.com
            </a>{' '}
            (CC BY 4.0), with optional fallback weather providers when configured.
          </p>
          <p>
            NDVI and NDMI interpretation depends on crop type, growth stage, soil background, season, and pixel quality—these are screening indicators, not lab soil tests or confirmed diagnoses.
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

          {/* Metric Cards with Visual Ranges & Context */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--as-text-muted)]">
                  NDVI Vegetation Indicator
                </p>
                {result.ndvi_status && (
                  <span className="text-[11px] font-medium text-[var(--as-text-muted)]">
                    {formatStatusBand(result.ndvi_status)}
                  </span>
                )}
              </div>
              <p className="text-2xl font-mono font-bold tabular-nums text-[var(--as-text)]">
                {result.satellite_available &&
                result.ndvi !== null &&
                result.ndvi !== undefined
                  ? result.ndvi.toFixed(3)
                  : 'Unavailable'}
              </p>
              <p className="text-xs text-[var(--as-text-muted)]">
                {result.satellite_available && result.ndvi !== null && result.ndvi !== undefined
                  ? result.ndvi < 0.2
                    ? `NDVI: ${result.ndvi.toFixed(3)} — Low vegetation signal (bare soil / early emergence)`
                    : result.ndvi_status
                      ? `Indicator band: ${formatStatusBand(result.ndvi_status)}`
                      : 'Copernicus Sentinel-2 canopy vigor indicator'
                  : 'Copernicus Sentinel-2 canopy vigor indicator'}
              </p>
              <IndexRangeMeter
                label="NDVI optical vegetation index"
                value={result.satellite_available ? result.ndvi : null}
                min={-0.2}
                max={1.0}
                thresholdValue={0.2}
                thresholdLabel="0.20 sparse/soil"
                lowLabel="Bare/Water"
                highLabel="Dense"
              />
            </div>

            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--as-text-muted)]">
                  NDMI Moisture Indicator
                </p>
                {result.ndmi_status && (
                  <span className="text-[11px] font-medium text-[var(--as-text-muted)]">
                    {formatStatusBand(result.ndmi_status)}
                  </span>
                )}
              </div>
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
              <IndexRangeMeter
                label="NDMI canopy moisture index"
                value={result.satellite_available ? result.ndmi : null}
                min={-0.5}
                max={0.5}
                thresholdValue={0.0}
                thresholdLabel="0.00 threshold"
                lowLabel="Dry/Bare"
                highLabel="Moist"
              />
            </div>

            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-2">
              <p className="text-xs font-medium text-[var(--as-text-muted)]">
                Latest Satellite Date &amp; Pixel Quality
              </p>
              <p className="text-base font-mono font-semibold tabular-nums text-[var(--as-text)]">
                {result.satellite_observation_date || 'Unavailable'}
              </p>
              {(() => {
                const excludedPct =
                  result.excluded_pixel_percent ?? result.cloud_cover_percent;
                const validPct =
                  result.valid_coverage_percent ??
                  (excludedPct !== null && excludedPct !== undefined
                    ? Math.max(0, Math.min(100, 100 - excludedPct))
                    : null);
                if (
                  excludedPct !== null &&
                  excludedPct !== undefined &&
                  validPct !== null
                ) {
                  return (
                    <>
                      <div
                        role="progressbar"
                        aria-label="Valid pixel sample coverage percentage"
                        aria-valuenow={Number(validPct.toFixed(1))}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-2 w-full rounded-full bg-[var(--as-warning-surface)] border border-[var(--as-border)] overflow-hidden"
                      >
                        <div
                          className="h-full bg-[#15803D] dark:bg-[#34D399]"
                          style={{ width: `${Math.max(0, Math.min(100, validPct))}%` }}
                        />
                      </div>
                      <p className="text-xs font-mono tabular-nums text-[var(--as-text-muted)]">
                        Valid sample coverage: {validPct.toFixed(1)}% · Excluded/unusable: {excludedPct.toFixed(1)}%
                      </p>
                      <p className="text-[11px] text-[var(--as-text-muted)]">
                        Masked clouds, shadow, or boundary edge (quality: {describeObservationQuality(result)})
                      </p>
                    </>
                  );
                }
                return (
                  <p className="text-xs text-[var(--as-text-muted)]">
                    Pixel coverage rate not reported
                  </p>
                );
              })()}
            </div>

            <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-2">
              <p className="text-xs font-medium text-[var(--as-text-muted)]">
                Recent Weather Context
              </p>
              <p className="text-2xl font-mono font-bold tabular-nums text-[var(--as-text)]">
                {result.weather_available &&
                result.temperature_c !== null &&
                result.temperature_c !== undefined
                  ? formatTemperature(result.temperature_c, settings.temperatureUnit)
                  : 'Unavailable'}
              </p>
              <p className="text-xs font-mono tabular-nums text-[var(--as-text-muted)]">
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
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Weather context loaded'
                  : 'Weather provider unavailable'}
              </p>
              {result.weather_available && (result.heat_risk || result.rainfall_status) && (
                <p className="text-[11px] text-[var(--as-text-muted)]">
                  {[
                    result.heat_risk ? `Heat risk: ${formatStatusBand(result.heat_risk)}` : null,
                    result.rainfall_status
                      ? `Rainfall: ${formatStatusBand(result.rainfall_status)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              {result.weather_available && (
                <p className="text-[11px] text-[var(--as-text-muted)] pt-0.5">
                  {result.weather_source === 'openweathermap' ? (
                    'Weather data via OpenWeatherMap fallback'
                  ) : (
                    <a
                      href="https://open-meteo.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="as-text-accent underline hover:opacity-80"
                    >
                      Weather data by Open-Meteo.com
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Connected Screening Logic Strip */}
          <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 sm:p-5 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[var(--as-text)]">
                How Signals Connect to Moisture-Stress Screening
              </p>
              <InfoTooltipHint
                label="Explain moisture stress screening thresholds"
                explanation="NDVI below 0.20 usually indicates bare soil or very sparse cover, so NDMI moisture screening becomes inconclusive. When NDVI >= 0.20, low NDMI combined with moderate/high heat or low recent rain flags possible moisture stress rather than confirming crop disease or exact irrigation volume."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1">
                <span className="text-[11px] text-[var(--as-text-muted)]">1. Data Availability</span>
                <p className="font-semibold text-[var(--as-text)]">{describeDataAvailability(result)}</p>
              </div>
              <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1">
                <span className="text-[11px] text-[var(--as-text-muted)]">2. Observation Quality</span>
                <p className="font-semibold text-[var(--as-text)]">{describeObservationQuality(result)}</p>
              </div>
              <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1">
                <span className="text-[11px] text-[var(--as-text-muted)]">3. Interpretation Confidence</span>
                <p className="font-semibold text-[var(--as-text)]">{describeInterpretationConfidence(result)}</p>
              </div>
            </div>
          </div>

          {/* Summary, Recommendations & Expandable Technical Metadata */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">Field Condition Summary</h3>
                <span className="text-xs font-medium text-[var(--as-text-muted)]">
                  Interpretation confidence: {describeInterpretationConfidence(result)}
                </span>
              </div>
              <p className="text-sm text-[var(--as-text-muted)] leading-relaxed">
                {result.ai_explanation ||
                  'No field explanation was returned.'}
              </p>
              <p className="text-xs text-[var(--as-text-muted)]">
                {result.confidence_reason ||
                  'Interpretation depends on crop type, growth stage, soil background, season, and pixel quality.'}
              </p>
              <div className="pt-2 border-t border-[var(--as-border)]">
                <p className="text-xs font-medium text-[var(--as-text)]">
                  Moisture stress screening: {describeMoistureStress(result)}
                </p>
              </div>

              <details className="pt-2 text-xs text-[var(--as-text-muted)]">
                <summary className="cursor-pointer font-semibold as-text-accent hover:underline">
                  Technical Observation &amp; Classification Details
                </summary>
                <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 font-mono text-[11px]">
                  <dt className="text-[var(--as-text-muted)]">NDVI / Status</dt>
                  <dd className="tabular-nums text-[var(--as-text)] text-right">
                    {result.ndvi !== null ? result.ndvi.toFixed(3) : 'null'} ({result.ndvi_status || 'N/A'})
                  </dd>
                  <dt className="text-[var(--as-text-muted)]">NDMI / Status</dt>
                  <dd className="tabular-nums text-[var(--as-text)] text-right">
                    {result.ndmi !== null ? result.ndmi.toFixed(3) : 'null'} ({result.ndmi_status || 'N/A'})
                  </dd>
                  <dt className="text-[var(--as-text-muted)]">Stress Code</dt>
                  <dd className="tabular-nums text-[var(--as-text)] text-right">
                    {result.moisture_stress_status || String(result.possible_water_stress ?? 'null')}
                  </dd>
                  <dt className="text-[var(--as-text-muted)]">Weather Provider</dt>
                  <dd className="text-[var(--as-text)] text-right">
                    {result.weather_source || (result.weather_available ? 'open-meteo' : 'unavailable')}
                  </dd>
                </dl>
              </details>
            </section>

            <section className="rounded-xl border border-[var(--as-border)] bg-[var(--as-surface)] p-5 space-y-3">
              <h3 className="text-base font-semibold">Practical Next Checks</h3>
              {result.recommendations && result.recommendations.length > 0 ? (
                <ul className="space-y-2.5">
                  {result.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-xs text-[var(--as-text-muted)] leading-relaxed"
                    >
                      <CheckCircle2 className="w-4 h-4 as-text-accent shrink-0 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--as-text-muted)]">
                  Optical satellite indices depend on crop type, growth stage, soil background, season, and pixel quality; verify field and root-zone moisture on site before acting.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { Download, FileText, PlusCircle, Printer } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { useAgroShift } from '../context/AgroShiftContext';
import {
  formatArea,
  formatAreaDual,
  formatCoordinate,
  formatTemperature,
} from '../utils/units';

function formatTimestamp(iso?: string | null): string {
  if (!iso) return 'Timestamp unavailable';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function getObservationAgeHours(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 3_600_000);
}

export function ReportsPage() {
  const {
    activeFarm,
    plans,
    settings,
    latestClimateByFarm,
    latestFieldHealthByFarm,
    latestRotationByFarm,
    observationTimestampsByFarm,
    observationFreshFlagsByFarm,
  } = useAgroShift();

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<FileText className="w-6 h-6" />}
        title="No Farm Selected for Reporting"
        description="Add or select a farm to generate a printable field summary or export your farm record as JSON."
        primaryAction={
          <Link
            to="/dashboard/farms/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Add Farm
          </Link>
        }
      />
    );
  }

  const farmPlans = plans.filter((p) => p.farmId === activeFarm.id);
  const climateObs = latestClimateByFarm[activeFarm.id] ?? null;
  const fieldObs = latestFieldHealthByFarm[activeFarm.id] ?? null;
  const rotationObs = latestRotationByFarm[activeFarm.id] ?? null;
  const obsTimestamps = observationTimestampsByFarm[activeFarm.id] ?? {};
  const obsFreshFlags = observationFreshFlagsByFarm[activeFarm.id] ?? {};

  const climateAgeHours = getObservationAgeHours(obsTimestamps.climateFetchedAt);
  const fieldAgeHours = getObservationAgeHours(obsTimestamps.fieldHealthFetchedAt);
  const rotationAgeHours = getObservationAgeHours(obsTimestamps.rotationScreenedAt);

  const locationDisplay =
    [
      activeFarm.location.locality,
      activeFarm.location.region,
      activeFarm.location.country,
    ]
      .filter(Boolean)
      .join(', ') || 'Coordinates saved (address unresolved)';

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sourceApplication: 'AgroShift',
      displayUnits: {
        areaUnit: settings.areaUnit,
        temperatureUnit: settings.temperatureUnit,
      },
      farm: activeFarm,
      savedRotationPlans: farmPlans,
      latestComputedRotationScreening: rotationObs
        ? {
            savedByFarmer: false,
            retrievedInCurrentSession: Boolean(obsFreshFlags.rotation),
            screenedAt: obsTimestamps.rotationScreenedAt ?? null,
            source: rotationObs.climate_source || 'NASA POWER historical screening',
            result: rotationObs,
          }
        : null,
      sessionObservations: {
        nasaPowerClimate: climateObs
          ? {
              retrievedAt: obsTimestamps.climateFetchedAt ?? null,
              retrievedInCurrentSession: Boolean(obsFreshFlags.climate),
              source: climateObs.source || 'NASA POWER',
              data: climateObs,
            }
          : null,
        fieldAnalysis: fieldObs
          ? {
              retrievedAt: obsTimestamps.fieldHealthFetchedAt ?? null,
              retrievedInCurrentSession: Boolean(obsFreshFlags.fieldHealth),
              source: 'Copernicus Sentinel-2 + Weather Provider',
              data: fieldObs,
            }
          : null,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agroshift-${activeFarm.details.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const orderedSeasons = activeFarm.history.seasons ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="font-display text-xl font-bold">
            Farm Dossier — {activeFarm.details.name}
          </h2>
          <p className="text-sm text-[var(--as-text-muted)]">
            Transparent record distinguishing farmer-entered inputs, farmer-saved rotation plans, unsaved session screenings, and retrieved Earth observations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-surface)]"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Summary
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg as-btn-primary transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </div>

      <article className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-6 space-y-6">
        <header className="border-b border-[var(--as-border)] pb-4 flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xs font-semibold as-text-accent">AgroShift Farm Record</p>
            <h3 className="text-xl font-bold mt-1">{activeFarm.details.name}</h3>
            <p className="text-xs text-[var(--as-text-muted)] mt-0.5">{locationDisplay}</p>
            <p className="text-[11px] font-mono tabular-nums text-[var(--as-text-muted)] mt-1">
              Profile updated: {formatTimestamp(activeFarm.updatedAt)}
            </p>
          </div>
          <div className="text-right text-xs font-mono tabular-nums text-[var(--as-text-muted)]">
            <p>{formatCoordinate(activeFarm.location.latitude, 'lat')}</p>
            <p>{formatCoordinate(activeFarm.location.longitude, 'lon')}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[var(--as-text-muted)]">Area &amp; Operation</p>
            <p className="font-mono tabular-nums font-medium">
              {formatArea(activeFarm.details.areaHectares, settings.areaUnit)} ({formatAreaDual(activeFarm.details.areaHectares)})
            </p>
            <p className="text-xs text-[var(--as-text-muted)] capitalize">
              Area source: {(activeFarm.details.areaSource ?? 'manual').replace(/_/g, ' ')} ·{' '}
              {activeFarm.details.farmType.replace(/_/g, ' ')} · Irrigation:{' '}
              {activeFarm.details.irrigationMethod.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[var(--as-text-muted)]">Ordered Crop History</p>
            {orderedSeasons.length > 0 ? (
              <ol className="text-xs text-[var(--as-text-primary)] space-y-0.5 list-decimal pl-4">
                {orderedSeasons.map((s, idx) => (
                  <li key={s.id}>
                    {s.cropName}
                    {idx === 0 ? ' (Most recent)' : ''}
                    {s.plantingDate || s.harvestDate
                      ? ` — ${s.plantingDate || '?'} to ${s.harvestDate || '?'}`
                      : ''}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-medium">Previous: {activeFarm.history.previousCropName}</p>
            )}
          </div>
        </section>

        <section className="border-t border-[var(--as-border)] pt-4 space-y-2 text-xs">
          <h4 className="text-sm font-semibold">Soil Provenance</h4>
          <p className="text-[var(--as-text-muted)]">
            Knowledge level:{' '}
            {(activeFarm.soil.knowledgeLevel ?? 'unsure').replace(/_/g, ' ')} · Texture:{' '}
            {activeFarm.soil.texture.replace(/_/g, ' ')} (
            {activeFarm.soil.textureProvenance.replace(/_/g, ' ')}) · pH:{' '}
            {activeFarm.soil.ph !== null
              ? `${activeFarm.soil.ph} (${activeFarm.soil.phProvenance.replace(/_/g, ' ')})`
              : 'Not recorded'}{' '}
            · Drainage: {activeFarm.soil.drainage.replace(/_/g, ' ')} · Salinity:{' '}
            {(activeFarm.soil.salinityConcern ?? 'unknown').replace(/_/g, ' ')}
          </p>
          {activeFarm.environmentalContext && (
            <p className="text-[var(--as-text-muted)]">
              Saved public reference ({new Date(activeFarm.environmentalContext.retrievedAt).toLocaleDateString()}):{' '}
              {activeFarm.environmentalContext.soilAvailable && activeFarm.environmentalContext.soilReference
                ? `${activeFarm.environmentalContext.soilSource || 'SoilGrids v2.0'} (${activeFarm.environmentalContext.soilReference.spatialResolution || '250 m'}${
                    activeFarm.environmentalContext.soilReference.socGKg !== null &&
                    activeFarm.environmentalContext.soilReference.socGKg !== undefined
                      ? `, SOC ${activeFarm.environmentalContext.soilReference.socGKg} g/kg — distinct from lab OM%`
                      : ''
                  })`
                : 'SoilGrids unavailable'}
              {activeFarm.environmentalContext.nasaWetnessAvailable &&
              activeFarm.environmentalContext.wetnessSummary
                ? ` · NASA MERRA-2 wetness (0–1): surface ${activeFarm.environmentalContext.wetnessSummary.surfaceWetnessIndex ?? '—'}, root-zone ${activeFarm.environmentalContext.wetnessSummary.rootZoneWetnessIndex ?? '—'}`
                : ''}
            </p>
          )}
        </section>

        {/* 1. Farmer-Selected Saved Plans */}
        <section className="border-t border-[var(--as-border)] pt-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              1. Farmer-Selected Saved Rotation Plans ({farmPlans.length})
            </h4>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold as-badge-success">
              Saved on this device
            </span>
          </div>

          {farmPlans.length === 0 ? (
            <p className="text-[var(--as-text-muted)]">
              No rotation plans have been saved by the farmer yet for {activeFarm.details.name}. Screening crops in the Planner does not automatically save a plan until you choose &ldquo;Save This Option&rdquo; or &ldquo;Save Plan Snapshot&rdquo;.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {farmPlans.map((plan) => (
                <li
                  key={plan.id}
                  className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-[var(--as-text-primary)]">
                      {plan.title}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--as-text-muted)]">
                      Saved: {formatTimestamp(plan.updatedAt || plan.createdAt)}
                    </span>
                  </div>
                  <p className="text-[var(--as-text-muted)] font-mono tabular-nums">
                    {plan.horizonSeasons} seasons · {plan.localSeasonLabel} · Prev:{' '}
                    {plan.previousCropName} · Goal: {plan.activeBackendGoal}
                    {plan.topPlanSnapshot
                      ? ` · Sequence: ${plan.topPlanSnapshot.seasons
                          .map((s) => s.name)
                          .join(' → ')} (${plan.topPlanSnapshot.score.toFixed(1)}/100)`
                      : ' · Manual snapshot (no screening option attached)'}
                  </p>
                  {plan.notes && (
                    <p className="text-[var(--as-text-muted)] italic">
                      Notes: &ldquo;{plan.notes}&rdquo;
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. Latest Computed Rotation Screening (Unsaved Session Result) */}
        <section className="border-t border-[var(--as-border)] pt-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              2. Latest Computed Rotation Screening (Current Session)
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {rotationObs && (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold border border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-muted)]">
                  {obsFreshFlags.rotation ? 'Fresh in this session' : 'Cached from prior session'}
                </span>
              )}
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold as-badge-warning">
                Unsaved screening output
              </span>
            </div>
          </div>

          {rotationObs ? (
            rotationObs.status === 'ok' && rotationObs.plans.length > 0 ? (
              <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--as-text-muted)]">
                  <span>
                    Source: {rotationObs.climate_source || 'NASA POWER historical screening'}
                  </span>
                  <span className="font-mono tabular-nums">
                    Computed: {formatTimestamp(obsTimestamps.rotationScreenedAt)}
                  </span>
                </div>
                {rotationAgeHours !== null && rotationAgeHours > 168 && (
                  <p className="text-[11px] as-text-warning">
                    Cached screening is over 7 days old — rerun in Planner to refresh against current farm settings.
                  </p>
                )}
                <ul className="space-y-1 font-mono tabular-nums text-[var(--as-text-primary)]">
                  {rotationObs.plans.slice(0, 3).map((opt, idx) => (
                    <li key={`screen-${idx}`}>
                      Option #{idx + 1}: {opt.seasons.map((s) => s.name).join(' → ')} —{' '}
                      {opt.score.toFixed(1)}/100
                      {opt.compatibility_band ? ` (${opt.compatibility_band})` : ''}
                    </li>
                  ))}
                </ul>
                {rotationObs.current_practice_comparison?.comparison_summary && (
                  <p className="text-[11px] text-[var(--as-text-primary)]">
                    Current practice baseline: {rotationObs.current_practice_comparison.comparison_summary}
                  </p>
                )}
                {rotationObs.plans[0]?.historical_resilience?.summary && (
                  <p className="text-[11px] text-[var(--as-text-muted)]">
                    Top-option historical variability: {rotationObs.plans[0].historical_resilience.summary}
                  </p>
                )}
                <p className="text-[11px] text-[var(--as-text-muted)]">
                  Preliminary screening comparison only — not a farmer-saved plan until explicitly saved in the Planner.
                </p>
              </div>
            ) : (
              <p className="text-[var(--as-text-muted)]">
                Screening ran ({formatTimestamp(obsTimestamps.rotationScreenedAt)}) with status:{' '}
                {rotationObs.status}. {rotationObs.message || 'No feasible sequences returned.'}
              </p>
            )
          ) : (
            <p className="text-[var(--as-text-muted)]">
              No crop rotation screening recorded for this farm yet.
            </p>
          )}
        </section>

        {/* 3. Climate & Satellite Observations Retrieved in Session */}
        <section className="border-t border-[var(--as-border)] pt-4 space-y-2.5 text-xs">
          <h4 className="text-sm font-semibold">
            3. Climate &amp; Satellite Observations Retrieved in Session
          </h4>

          <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--as-text-primary)]">
                NASA POWER Historical Climate
              </span>
              {climateObs && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--as-text-muted)]">
                  <span className="px-1.5 py-0.5 rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] font-medium">
                    {obsFreshFlags.climate ? 'Fresh in session' : 'Cached on device'}
                  </span>
                  <span className="font-mono tabular-nums">
                    Retrieved: {formatTimestamp(obsTimestamps.climateFetchedAt)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-[var(--as-text-muted)] font-mono tabular-nums">
              {climateObs?.data_available
                ? `${climateObs.monthly?.length ?? 0} historical monthly records (${climateObs.start_year}–${climateObs.end_year}) · Source: ${climateObs.source || 'NASA POWER'} · Historical archive only (not a forecast)`
                : 'Not yet retrieved for this farm'}
            </p>
            {climateAgeHours !== null && climateAgeHours > 168 && !obsFreshFlags.climate && (
              <p className="text-[11px] as-text-warning">
                Cached climate archive is over 7 days old — open Climate History to refresh if needed.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--as-text-primary)]">
                Sentinel-2 Satellite &amp; Weather Snapshot
              </span>
              {fieldObs && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--as-text-muted)]">
                  <span className="px-1.5 py-0.5 rounded border border-[var(--as-border)] bg-[var(--as-bg-surface)] font-medium">
                    {obsFreshFlags.fieldHealth ? 'Fresh in session' : 'Cached snapshot'}
                  </span>
                  <span className="font-mono tabular-nums">
                    Retrieved: {formatTimestamp(obsTimestamps.fieldHealthFetchedAt)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-[var(--as-text-muted)] font-mono tabular-nums">
              {fieldObs
                ? fieldObs.satellite_available
                  ? `NDVI ${fieldObs.ndvi !== null ? fieldObs.ndvi.toFixed(3) : 'N/A'} / NDMI ${fieldObs.ndmi !== null ? fieldObs.ndmi.toFixed(3) : 'N/A'} (Scene: ${fieldObs.satellite_observation_date ?? 'Date N/A'}${fieldObs.valid_coverage_percent != null ? ` · Valid pixels: ${fieldObs.valid_coverage_percent.toFixed(0)}%` : ''})`
                  : `Satellite unavailable (${fieldObs.satellite_message || 'No recent clear scene'})`
                : 'Not yet retrieved for this farm'}
            </p>
            {fieldObs?.weather_available && (
              <p className="text-[var(--as-text-muted)] font-mono tabular-nums">
                Weather:{' '}
                {fieldObs.temperature_c !== null
                  ? formatTemperature(fieldObs.temperature_c, settings.temperatureUnit)
                  : 'N/A'}
                {fieldObs.humidity_percent !== null
                  ? ` · ${fieldObs.humidity_percent}% humidity`
                  : ''}
                {fieldObs.recent_rainfall_mm !== null
                  ? ` · ${fieldObs.recent_rainfall_mm} mm recent rain`
                  : ''}{' '}
                ·{' '}
                {fieldObs.weather_source === 'openweathermap' ? (
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
                {fieldObs.weather_observation_window ? ` (${fieldObs.weather_observation_window})` : ''}
              </p>
            )}
            {fieldAgeHours !== null && fieldAgeHours > 24 && !obsFreshFlags.fieldHealth && (
              <p className="text-[11px] as-text-warning">
                Cached weather/satellite snapshot is {Math.floor(fieldAgeHours)}h old — refresh in Field Health for current conditions.
              </p>
            )}
          </div>
        </section>
      </article>
    </div>
  );
}

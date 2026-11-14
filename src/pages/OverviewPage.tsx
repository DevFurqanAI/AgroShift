import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CloudSun,
  Droplets,
  MapPin,
  PlusCircle,
  Repeat,
  Satellite,
  Sprout,
} from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { GlobalFarmMap } from '../components/maps/GlobalFarmMap';
import { useAgroShift } from '../context/AgroShiftContext';
import { formatAreaDual, formatCoordinate, formatTemperature } from '../utils/units';

export function OverviewPage() {
  const {
    farms,
    activeFarm,
    plans,
    activities,
    settings,
    latestClimateByFarm,
    latestFieldHealthByFarm,
  } = useAgroShift();

  if (farms.length === 0 || !activeFarm) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<Sprout className="w-6 h-6" />}
          title="Welcome to AgroShift — Add Your First Farm"
          description="Set up your farm location anywhere in the world, record your cultivated area, water conditions, and crop history to explore climate patterns and crop rotation options."
          primaryAction={
            <Link
              to="/dashboard/farms/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Add Your First Farm
            </Link>
          }
        />
      </div>
    );
  }

  const climateObs = latestClimateByFarm[activeFarm.id];
  const fieldObs = latestFieldHealthByFarm[activeFarm.id];
  const farmPlans = plans.filter((p) => p.farmId === activeFarm.id);
  const farmActivity = activities.filter((a) => a.farmId === activeFarm.id).slice(0, 5);

  const validTempMonths =
    climateObs?.monthly?.filter((m) => m.temperature_c !== null && m.temperature_c !== undefined) ??
    [];
  const avgClimateTemp =
    validTempMonths.length > 0
      ? validTempMonths.reduce((sum, m) => sum + (m.temperature_c ?? 0), 0) /
        validTempMonths.length
      : null;

  const locationSummary = [
    activeFarm.location.locality,
    activeFarm.location.region,
    activeFarm.location.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-6">
      {/* A. Welcome Section */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-[26px] sm:text-[28px] font-bold tracking-tight text-[var(--as-text-primary)]">
            {activeFarm.details.name}
          </h2>
          <p className="text-[15px] text-[var(--as-text-muted)] mt-1">
            {locationSummary || 'Coordinates saved'} · Last updated{' '}
            {new Date(activeFarm.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`/dashboard/farms/${activeFarm.id}/edit`}
            className="inline-flex items-center min-h-[44px] px-4 py-2 text-[15px] font-medium rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-surface)] hover:border-[var(--as-accent-text)] transition-colors whitespace-nowrap"
          >
            Edit Farm Profile
          </Link>
          <Link
            to="/dashboard/planner"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-[15px] font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap"
          >
            <Repeat className="w-4 h-4" />
            Open Rotation Planner
          </Link>
        </div>
      </section>

      {/* NASA-to-Farmer Decision Chain */}
      <section
        aria-label="How AgroShift connects farm and NASA data"
        className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[17px] font-semibold text-[var(--as-text-primary)]">
            How AgroShift Connects Your Data
          </h3>
          <span className="text-[13px] text-[var(--as-text-muted)]">
            NASA Earth observations + soil context + your goals
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-[14px]">
          <Link
            to="/dashboard/climate"
            className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3.5 space-y-1 hover:border-[var(--as-accent-text)] transition-colors"
          >
            <p className="font-semibold text-[var(--as-text-primary)]">1. NASA Climate &amp; Wetness</p>
            <p className="text-[13px] text-[var(--as-text-muted)] leading-snug">
              Multi-year temperature, rain &amp; root-zone wetness for your coordinates.
            </p>
          </Link>
          <Link
            to={`/dashboard/farms/${activeFarm.id}/edit`}
            className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3.5 space-y-1 hover:border-[var(--as-accent-text)] transition-colors"
          >
            <p className="font-semibold text-[var(--as-text-primary)]">2. Local Soil &amp; Farm Setup</p>
            <p className="text-[13px] text-[var(--as-text-muted)] leading-snug">
              Your observed soil kept separate from public SoilGrids estimates.
            </p>
          </Link>
          <Link
            to="/dashboard/field-health"
            className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3.5 space-y-1 hover:border-[var(--as-accent-text)] transition-colors"
          >
            <p className="font-semibold text-[var(--as-text-primary)]">3. Field Vegetation Check</p>
            <p className="text-[13px] text-[var(--as-text-muted)] leading-snug">
              Sentinel-2 greenness (NDVI) &amp; moisture (NDMI) with weather context.
            </p>
          </Link>
          <Link
            to="/dashboard/planner"
            className="rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] p-3.5 space-y-1 hover:border-[var(--as-accent-text)] transition-colors"
          >
            <p className="font-semibold text-[var(--as-text-primary)]">4. Crop &amp; Water Plan</p>
            <p className="text-[13px] text-[var(--as-text-muted)] leading-snug">
              Compare rotations by your priority, past climate fit, and water need.
            </p>
          </Link>
        </div>
      </section>

      {/* B–G. Key Farm Summary Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--as-text-muted)]">
            <MapPin className="w-4 h-4 as-text-accent" />
            <span>Farm Location</span>
          </div>
          <p className="text-[17px] font-semibold text-[var(--as-text-primary)]">
            {locationSummary || 'Location coordinates set'}
          </p>
          <p className="text-[13px] tabular-nums text-[var(--as-text-muted)]">
            {formatCoordinate(activeFarm.location.latitude, 'lat')} ·{' '}
            {formatCoordinate(activeFarm.location.longitude, 'lon')}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-2">
          <p className="text-[13px] font-medium text-[var(--as-text-muted)]">
            Cultivated Area &amp; Boundary
          </p>
          <p className="text-[17px] font-semibold tabular-nums text-[var(--as-text-primary)]">
            {formatAreaDual(activeFarm.details.areaHectares)}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)]">
            {activeFarm.location.geometryType === 'polygon'
              ? 'Field boundary polygon saved'
              : 'Single reference point saved'}
            {activeFarm.details.areaSource === 'calculated_from_boundary'
              ? ' · From boundary'
              : ''}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--as-text-muted)]">
            <Sprout className="w-4 h-4 as-text-accent" />
            <span>Most Recent Crop</span>
          </div>
          <p className="text-[17px] font-semibold text-[var(--as-text-primary)]">
            {activeFarm.history.previousCropName}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)]">
            {activeFarm.history.seasons && activeFarm.history.seasons.length > 1
              ? `${activeFarm.history.seasons.length} seasons recorded`
              : activeFarm.history.typicalPlantingWindow
                ? `Planting: ${activeFarm.history.typicalPlantingWindow}`
                : 'Planting dates not specified'}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--as-text-muted)]">
            <Droplets className="w-4 h-4 as-text-accent" />
            <span>Water &amp; Irrigation</span>
          </div>
          <p className="text-[17px] font-semibold capitalize text-[var(--as-text-primary)]">
            {activeFarm.details.waterAvailability.replace(/_/g, ' ')}
          </p>
          <p className="text-[13px] text-[var(--as-text-muted)] capitalize">
            Method: {activeFarm.details.irrigationMethod.replace(/_/g, ' ')}
            {activeFarm.details.irrigationMethod === 'rainfed_only' &&
            activeFarm.details.rainfallReliability &&
            activeFarm.details.rainfallReliability !== 'unknown'
              ? ` · Rainfall: ${activeFarm.details.rainfallReliability}`
              : ''}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--as-text-muted)]">
            <CloudSun className="w-4 h-4 as-text-accent" />
            <span>NASA POWER Climate</span>
          </div>
          <p className="text-[17px] font-semibold tabular-nums text-[var(--as-text-primary)]">
            {climateObs
              ? climateObs.data_available
                ? avgClimateTemp !== null
                  ? `Mean ${formatTemperature(avgClimateTemp, settings.temperatureUnit)} (${climateObs.monthly?.length ?? 0} mo)`
                  : `${climateObs.monthly?.length ?? 0} monthly records loaded`
                : 'No records returned'
              : 'Ready to inspect'}
          </p>
          {climateObs?.data_available && climateObs.start_year && climateObs.end_year && (
            <p className="text-[13px] tabular-nums text-[var(--as-text-muted)]">
              Window: {climateObs.start_year}–{climateObs.end_year}
            </p>
          )}
          <Link
            to="/dashboard/climate"
            className="inline-flex items-center gap-1 min-h-[36px] text-sm font-medium as-text-accent hover:underline"
          >
            View Climate Intelligence
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-2">
          <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--as-text-muted)]">
            <Satellite className="w-4 h-4 as-text-accent" />
            <span>Field Health</span>
          </div>
          <p className="text-[17px] font-semibold tabular-nums text-[var(--as-text-primary)]">
            {fieldObs
              ? fieldObs.ndvi !== null && fieldObs.ndvi !== undefined
                ? `Greenness (NDVI) ${fieldObs.ndvi.toFixed(3)}${
                    fieldObs.ndmi !== null && fieldObs.ndmi !== undefined
                      ? ` · Moisture (NDMI) ${fieldObs.ndmi.toFixed(3)}`
                      : ''
                  }`
                : fieldObs.weather_available && fieldObs.temperature_c !== null
                  ? `Weather ${formatTemperature(fieldObs.temperature_c, settings.temperatureUnit)}`
                  : 'Checked in this session'
              : 'Not yet analyzed in session'}
          </p>
          {fieldObs?.satellite_available && (
            <p className="text-[13px] tabular-nums text-[var(--as-text-muted)]">
              {fieldObs.satellite_observation_date || 'Recent'}
              {fieldObs.valid_coverage_percent != null
                ? ` · ${fieldObs.valid_coverage_percent.toFixed(0)}% valid pixels`
                : ''}
            </p>
          )}
          <Link
            to="/dashboard/field-health"
            className="inline-flex items-center gap-1 min-h-[36px] text-sm font-medium as-text-accent hover:underline"
          >
            Open Field Health
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </section>

      {/* Map + Environmental Info */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[17px] font-semibold text-[var(--as-text-primary)]">
              Saved Field Location
            </h3>
            <Link
              to={`/dashboard/farms/${activeFarm.id}/edit`}
              className="min-h-[36px] inline-flex items-center text-sm font-medium as-text-accent hover:underline"
            >
              Adjust location
            </Link>
          </div>
          <GlobalFarmMap
            key={activeFarm.id}
            latitude={activeFarm.location.latitude}
            longitude={activeFarm.location.longitude}
            polygonGeoJSON={activeFarm.location.polygonGeoJSON}
            geometryType={activeFarm.location.geometryType}
            readOnly
            heightClass="h-[290px]"
          />
        </div>

        {/* Latest Real Environmental Info + Soil Provenance */}
        <div className="lg:col-span-5 rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-4">
          <h3 className="text-[17px] font-semibold text-[var(--as-text-primary)]">
            Latest Environmental &amp; Soil Summary
          </h3>

          {fieldObs ? (
            <div className="p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] space-y-1.5 text-[14px]">
              <p className="font-semibold as-text-accent">
                Copernicus Sentinel-2 &amp; Weather Snapshot
              </p>
              <p className="tabular-nums">
                Greenness (NDVI):{' '}
                {fieldObs.ndvi !== null && fieldObs.ndvi !== undefined
                  ? fieldObs.ndvi.toFixed(3)
                  : 'Unavailable'}{' '}
                · Moisture (NDMI):{' '}
                {fieldObs.ndmi !== null && fieldObs.ndmi !== undefined
                  ? fieldObs.ndmi.toFixed(3)
                  : 'Unavailable'}
              </p>
              {fieldObs.weather_available &&
                fieldObs.temperature_c !== null &&
                fieldObs.temperature_c !== undefined && (
                  <>
                    <p className="tabular-nums">
                      Observed weather:{' '}
                      {formatTemperature(fieldObs.temperature_c, settings.temperatureUnit)}
                      {fieldObs.humidity_percent !== null &&
                      fieldObs.humidity_percent !== undefined
                        ? ` · ${fieldObs.humidity_percent}% humidity`
                        : ''}
                    </p>
                    <p className="text-[13px] text-[var(--as-text-muted)]">
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
                    </p>
                  </>
                )}
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)] text-[14px] text-[var(--as-text-muted)] leading-[1.55]">
              Run Field Health or Climate Intelligence to view the latest satellite and historical climate context for this farm.
            </div>
          )}

          <div className="space-y-2 text-[14px] border-t border-[var(--as-border)] pt-3">
            <p className="font-semibold text-[var(--as-text-primary)]">
              Recorded Soil Information
            </p>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--as-text-muted)]">Texture</span>
              <span className="capitalize text-right">
                {activeFarm.soil.texture.replace(/_/g, ' ')} (
                {activeFarm.soil.textureProvenance.replace(/_/g, ' ')})
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--as-text-muted)]">Soil pH</span>
              <span className="tabular-nums text-right">
                {activeFarm.soil.ph !== null
                  ? `${activeFarm.soil.ph} (${activeFarm.soil.phProvenance.replace(/_/g, ' ')})`
                  : 'Not recorded'}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--as-text-muted)]">Drainage</span>
              <span className="capitalize text-right">
                {activeFarm.soil.drainage.replace(/_/g, ' ')}
              </span>
            </div>
            {activeFarm.environmentalContext?.soilAvailable &&
              activeFarm.environmentalContext.soilReference && (
                <div className="pt-2 border-t border-[var(--as-border)] text-[13px] text-[var(--as-text-muted)] space-y-0.5">
                  <p className="font-medium text-[var(--as-text-primary)]">
                    Public Reference ({activeFarm.environmentalContext.soilSource || 'SoilGrids 250 m'})
                  </p>
                  <p className="tabular-nums">
                    {activeFarm.environmentalContext.soilReference.socGKg !== null &&
                    activeFarm.environmentalContext.soilReference.socGKg !== undefined
                      ? `Soil carbon (SOC, reference only) ${activeFarm.environmentalContext.soilReference.socGKg} g/kg`
                      : ''}
                    {activeFarm.environmentalContext.soilReference.usdaTexture
                      ? ` · ${activeFarm.environmentalContext.soilReference.usdaTexture}`
                      : ''}
                    {activeFarm.environmentalContext.wetnessSummary?.rootZoneWetnessIndex !== null &&
                    activeFarm.environmentalContext.wetnessSummary?.rootZoneWetnessIndex !== undefined
                      ? ` · NASA root wetness ${activeFarm.environmentalContext.wetnessSummary.rootZoneWetnessIndex}`
                      : ''}
                  </p>
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Saved Plans & Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[17px] font-semibold text-[var(--as-text-primary)]">
              Saved Rotation Plans ({farmPlans.length})
            </h3>
            <Link
              to="/dashboard/planner"
              className="min-h-[36px] inline-flex items-center text-sm font-medium as-text-accent hover:underline"
            >
              Open Planner
            </Link>
          </div>
          {farmPlans.length === 0 ? (
            <p className="text-[15px] text-[var(--as-text-muted)]">
              No rotation plans saved for {activeFarm.details.name} yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--as-border)]">
              {farmPlans.slice(0, 4).map((plan) => (
                <li key={plan.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium truncate">{plan.title}</p>
                    <p className="text-[13px] tabular-nums text-[var(--as-text-muted)]">
                      {plan.horizonSeasons} seasons · {plan.localSeasonLabel || 'Custom schedule'}
                      {plan.topPlanSnapshot
                        ? ` · ${plan.topPlanSnapshot.score.toFixed(1)}/100`
                        : ''}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/planner"
                    className="min-h-[36px] inline-flex items-center text-sm font-medium as-text-accent hover:underline shrink-0"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-4">
          <h3 className="text-[17px] font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            Recent Farm Activity
          </h3>
          {farmActivity.length === 0 ? (
            <p className="text-[15px] text-[#64748B] dark:text-[#94A3B8]">
              Activity for this farm will appear here as you update profiles or save rotation plans.
            </p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0] dark:divide-[#1E2E26]">
              {farmActivity.map((item) => (
                <li key={item.id} className="py-3 flex items-center justify-between gap-3 text-[14px]">
                  <span className="text-[#172B22] dark:text-[#E8F1EC]">{item.action}</span>
                  <span className="tabular-nums text-[13px] text-[#64748B] dark:text-[#94A3B8] shrink-0">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

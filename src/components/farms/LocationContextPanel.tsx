import {
  AlertCircle,
  Check,
  CloudSun,
  Droplets,
  Edit3,
  EyeOff,
  Layers,
  Loader2,
  Lock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { EnvironmentalContextResponse } from '../../types/api';
import type { DataProvenance, SoilTexture, TemperatureUnit } from '../../types/farm';
import { formatTemperature } from '../../utils/units';
import {
  canApplyPublicSuggestion,
  formatProvenanceLabel,
  normalizeFarmTextureValue,
} from '../../utils/provenance';

interface LocationContextPanelProps {
  coordinatesValid: boolean;
  latitude: number | null;
  longitude: number | null;
  temperatureUnit: TemperatureUnit;
  isLoading: boolean;
  errorMessage: string | null;
  contextData: EnvironmentalContextResponse | null;
  isStaleForCoordinates: boolean;
  currentTexture: SoilTexture;
  currentTextureProvenance: DataProvenance;
  currentPh: string;
  currentPhProvenance: DataProvenance;
  decisions: {
    texture?: 'accepted' | 'edited' | 'ignored';
    ph?: 'accepted' | 'edited' | 'ignored';
  };
  onCheckLocation: () => void;
  onAcceptTexture: (texture: SoilTexture) => void;
  onEditTexture: () => void;
  onIgnoreTexture: () => void;
  onAcceptPh: (ph: number) => void;
  onEditPh: () => void;
  onIgnorePh: () => void;
}

export function LocationContextPanel({
  coordinatesValid,
  latitude,
  longitude,
  temperatureUnit,
  isLoading,
  errorMessage,
  contextData,
  isStaleForCoordinates,
  currentTexture,
  currentTextureProvenance,
  currentPh,
  currentPhProvenance,
  decisions,
  onCheckLocation,
  onAcceptTexture,
  onEditTexture,
  onIgnoreTexture,
  onAcceptPh,
  onEditPh,
  onIgnorePh,
}: LocationContextPanelProps) {
  const climateVars = contextData?.nasa_climate?.variables ?? {};
  const wetnessVars = contextData?.nasa_soil_wetness?.variables ?? {};
  const soilProps = contextData?.soil_context?.properties ?? {};
  const phSuggestion = contextData?.suggested_farm_defaults?.soil_ph;
  const textureSuggestion = contextData?.suggested_farm_defaults?.soil_texture;

  const canAcceptPh = canApplyPublicSuggestion({
    currentHasValue: currentPh.trim() !== '',
    currentProvenance: currentPhProvenance,
    farmerLocked: decisions.ph === 'edited',
  });
  const canAcceptTexture = canApplyPublicSuggestion({
    currentHasValue: currentTexture !== 'unknown',
    currentProvenance: currentTextureProvenance,
    farmerLocked: decisions.texture === 'edited',
  });

  const t2m = climateVars.air_temperature_c;
  const precip = climateVars.precipitation_mm_per_year;
  const solar = climateVars.solar_radiation;
  const rh = climateVars.relative_humidity_percent;

  const gwetTop = wetnessVars.surface_soil_wetness;
  const gwetRoot = wetnessVars.root_zone_soil_wetness;

  const soc = soilProps.soc;
  const bdod = soilProps.bdod;
  const sand = soilProps.sand;
  const silt = soilProps.silt;
  const clay = soilProps.clay;
  const phProp = soilProps.phh2o;

  return (
    <div className="rounded-lg border border-[#D9E2EC] dark:border-[#23362D] bg-[#F8FAF7] dark:bg-[#0B1310] p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 as-text-accent shrink-0" />
            <h4 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Automatic Public Location Context (Optional)
            </h4>
          </div>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            Retrieve coarse NASA climate &amp; soil wetness plus public SoilGrids estimates for these coordinates. Skippable anytime—existing lab tests or farmer observations are never overwritten.
          </p>
        </div>

        <button
          type="button"
          onClick={onCheckLocation}
          disabled={!coordinatesValid || isLoading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#15803D]/40 bg-white dark:bg-[#111D18] text-[#14532D] dark:text-[#34D399] hover:border-[#16A34A] disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking public datasets...
            </>
          ) : (
            <>
              <CloudSun className="w-3.5 h-3.5" />
              Check available information for this location
            </>
          )}
        </button>
      </div>

      {!coordinatesValid && (
        <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
          Select a point or boundary on the map above to enable automatic public data lookup.
        </p>
      )}

      {isStaleForCoordinates && contextData && (
        <div className="rounded-lg border border-[#D97706]/40 bg-[#D97706]/8 px-3 py-2 text-xs as-text-warning flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Coordinates changed since the last lookup ({latitude?.toFixed(3)}, {longitude?.toFixed(3)}). Click &ldquo;Check available information for this location&rdquo; to refresh for the updated location.
          </span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-[#D97706]/40 bg-[#D97706]/8 px-3 py-2 text-xs as-text-warning flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {contextData && (
        <div className="space-y-4 pt-1">
          {/* 1. NASA Climate Observations */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] inline-flex items-center gap-1.5">
                <CloudSun className="w-3.5 h-3.5 text-[#16A34A]" />
                1. NASA Climate Observations ({contextData.start_year}–{contextData.end_year})
              </h5>
              <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                Historical gridded climatology
              </span>
            </div>

            {contextData.nasa_climate?.available ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                  <p className="text-[11px] text-[#64748B]">Mean Air Temp (T2M)</p>
                  <p className="font-mono font-semibold tabular-nums mt-0.5">
                    {t2m?.available && t2m.value !== null
                      ? formatTemperature(t2m.value, temperatureUnit)
                      : 'Unavailable'}
                  </p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">{t2m?.spatial_resolution}</p>
                </div>

                <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                  <p className="text-[11px] text-[#64748B]">Annual Rainfall (PRECTOTCORR)</p>
                  <p className="font-mono font-semibold tabular-nums mt-0.5">
                    {precip?.available && precip.value !== null
                      ? `${precip.value} mm/year`
                      : precip?.mean_daily_mm !== null && precip?.mean_daily_mm !== undefined
                        ? `${precip.mean_daily_mm} mm/day (partial yrs)`
                        : 'Unavailable'}
                  </p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">
                    {precip?.complete_years_count ?? 0} complete yr(s)
                  </p>
                </div>

                <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                  <p className="text-[11px] text-[#64748B]">Solar Radiation (CERES)</p>
                  <p className="font-mono font-semibold tabular-nums mt-0.5">
                    {solar?.available && solar.value !== null
                      ? `${solar.value} ${solar.unit}`
                      : 'Unavailable'}
                  </p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">{solar?.spatial_resolution}</p>
                </div>

                <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                  <p className="text-[11px] text-[#64748B]">Relative Humidity (RH2M)</p>
                  <p className="font-mono font-semibold tabular-nums mt-0.5">
                    {rh?.available && rh.value !== null ? `${rh.value}%` : 'Unavailable'}
                  </p>
                  <p className="text-[10px] text-[#64748B] mt-0.5">{rh?.spatial_resolution}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#64748B]">
                {contextData.nasa_climate?.message ||
                  'NASA POWER climate observations were unavailable for this coordinate.'}
              </p>
            )}
          </div>

          {/* 2. NASA Soil Wetness Context */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] inline-flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-[#0284C7]" />
                2. NASA Soil Wetness Context (Coarse Reanalysis)
              </h5>
              <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                Not a field moisture probe
              </span>
            </div>

            {contextData.nasa_soil_wetness?.available ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                    <p className="text-[11px] text-[#64748B]">Surface Wetness Index (0–5 cm, GWETTOP)</p>
                    <p className="font-mono font-semibold tabular-nums mt-0.5">
                      {gwetTop?.available && gwetTop.value !== null
                        ? `${gwetTop.value} (0–1 fraction)`
                        : 'Unavailable'}
                    </p>
                    <p className="text-[10px] text-[#64748B] mt-0.5">{gwetTop?.spatial_resolution}</p>
                  </div>
                  <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                    <p className="text-[11px] text-[#64748B]">Root-Zone Wetness Index (10–100 cm, GWETROOT)</p>
                    <p className="font-mono font-semibold tabular-nums mt-0.5">
                      {gwetRoot?.available && gwetRoot.value !== null
                        ? `${gwetRoot.value} (0–1 fraction)`
                        : 'Unavailable'}
                    </p>
                    <p className="text-[10px] text-[#64748B] mt-0.5">{gwetRoot?.spatial_resolution}</p>
                  </div>
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Coarse ~50 × 60 km MERRA-2 modeled wetness index only. It does not measure individual-field moisture, irrigation delivery, or drainage class.
                </p>
              </>
            ) : (
              <p className="text-xs text-[#64748B]">
                Coarse soil wetness indices were not available at this coordinate.
              </p>
            )}
          </div>

          {/* 3. Public Estimated Soil Properties */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] inline-flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#D97706]" />
                3. Public Estimated Soil Properties ({contextData.soil_context.source}, 250 m Grid)
              </h5>
              {contextData.soil_context.endpoint_used && (
                <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                  via {contextData.soil_context.endpoint_used}
                </span>
              )}
            </div>

            {contextData.soil_context.available ? (
              <div className="space-y-3">
                {/* Mappable fields with explicit Accept / Edit / Ignore */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Soil pH Suggestion */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                          Estimated Soil pH
                        </p>
                        <p className="font-mono font-semibold tabular-nums text-sm mt-0.5">
                          {phProp?.value !== null && phProp?.value !== undefined
                            ? `${phProp.value} pH`
                            : 'Unavailable'}
                        </p>
                      </div>
                      {decisions.ph && (
                        <span className="text-[11px] font-medium as-text-accent capitalize">
                          {decisions.ph}
                        </span>
                      )}
                    </div>
                    {phProp && (
                      <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                        Depth: {phProp.depth_interval}
                        {phProp.q05 !== null &&
                        phProp.q05 !== undefined &&
                        phProp.q95 !== null &&
                        phProp.q95 !== undefined
                          ? ` · 5th–95th percentile range: ${phProp.q05}–${phProp.q95}`
                          : ''}
                      </p>
                    )}

                    {!canAcceptPh ? (
                      <p className="text-[11px] text-[#64748B] inline-flex items-center gap-1">
                        <Lock className="w-3 h-3 shrink-0" />
                        Protected: keeping your {formatProvenanceLabel(currentPhProvenance)} ({currentPh || 'locked'}).
                      </p>
                    ) : phSuggestion?.available && phSuggestion.suggested_value !== null ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => onAcceptPh(Number(phSuggestion.suggested_value))}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#15803D] bg-[#15803D]/10 text-[#14532D] dark:text-[#34D399] font-medium hover:bg-[#15803D]/20"
                        >
                          <Check className="w-3 h-3" />
                          Accept estimate
                        </button>
                        <button
                          type="button"
                          onClick={onEditPh}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#172B22] dark:text-[#E8F1EC]"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit myself
                        </button>
                        <button
                          type="button"
                          onClick={onIgnorePh}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B]"
                        >
                          <EyeOff className="w-3 h-3" />
                          Ignore
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {/* Soil Texture Suggestion */}
                  <div className="p-3 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                          Estimated Soil Texture
                        </p>
                        <p className="font-semibold text-sm mt-0.5">
                          {contextData.soil_context.derived_usda_texture || 'Unavailable'}
                        </p>
                      </div>
                      {decisions.texture && (
                        <span className="text-[11px] font-medium as-text-accent capitalize">
                          {decisions.texture}
                        </span>
                      )}
                    </div>
                    {(sand || silt || clay) && (
                      <p className="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                        Sand {sand?.value ?? '—'}% · Silt {silt?.value ?? '—'}% · Clay{' '}
                        {clay?.value ?? '—'}% ({sand?.depth_interval || '0–15 cm'})
                      </p>
                    )}

                    {!canAcceptTexture ? (
                      <p className="text-[11px] text-[#64748B] inline-flex items-center gap-1">
                        <Lock className="w-3 h-3 shrink-0" />
                        Protected: keeping your {formatProvenanceLabel(currentTextureProvenance)} ({currentTexture.replace(/_/g, ' ')}).
                      </p>
                    ) : textureSuggestion?.available && textureSuggestion.suggested_value ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            onAcceptTexture(
                              normalizeFarmTextureValue(String(textureSuggestion.suggested_value))
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#15803D] bg-[#15803D]/10 text-[#14532D] dark:text-[#34D399] font-medium hover:bg-[#15803D]/20"
                        >
                          <Check className="w-3 h-3" />
                          Accept estimate
                        </button>
                        <button
                          type="button"
                          onClick={onEditTexture}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#172B22] dark:text-[#E8F1EC]"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit myself
                        </button>
                        <button
                          type="button"
                          onClick={onIgnoreTexture}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B]"
                        >
                          <EyeOff className="w-3 h-3" />
                          Ignore
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Reference SoilGrids Context NOT equated to lab OM% */}
                {(soc || bdod) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    {soc && (
                      <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                        <p className="text-[11px] text-[#64748B]">
                          Soil Organic Carbon (SOC, reference only)
                        </p>
                        <p className="font-mono font-semibold tabular-nums mt-0.5">
                          {soc.value} {soc.unit}
                          {soc.q05 !== null && soc.q95 !== null
                            ? ` (Q05–Q95: ${soc.q05}–${soc.q95})`
                            : ''}
                        </p>
                        <p className="text-[10px] text-[#64748B] mt-0.5">
                          Distinct from laboratory Organic Matter (%); never copied silently into OM%.
                        </p>
                      </div>
                    )}
                    {bdod && (
                      <div className="p-2.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                        <p className="text-[11px] text-[#64748B]">Bulk Density (Fine Earth)</p>
                        <p className="font-mono font-semibold tabular-nums mt-0.5">
                          {bdod.value} {bdod.unit}
                          {bdod.q05 !== null && bdod.q95 !== null
                            ? ` (Q05–Q95: ${bdod.q05}–${bdod.q95})`
                            : ''}
                        </p>
                        <p className="text-[10px] text-[#64748B] mt-0.5">
                          Depth: {bdod.depth_interval} · 250 m SoilGrids v2.0
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                {contextData.soil_context.message ||
                  'Public soil estimates are unavailable for this coordinate. Unknown soil fields remain blank.'}
              </p>
            )}
          </div>

          {/* 4. Details Farmer Still Needs to Confirm */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-3.5 space-y-2">
            <h5 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] inline-flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[#15803D]" />
              4. Details You Still Need to Confirm
            </h5>
            <ul className="list-disc pl-4 space-y-1 text-xs text-[#64748B] dark:text-[#94A3B8]">
              {contextData.details_farmer_must_confirm.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] pt-1 border-t border-[#E2E8F0] dark:border-[#1E2E26]">
              Retrieved {new Date(contextData.retrieved_at).toLocaleString()} · Public datasets are advisory spatial context only and never alter rotation scoring weights automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

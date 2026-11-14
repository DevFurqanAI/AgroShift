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
import { StatusBanner } from '../components/common/StatusBanner';
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
    backendStatus,
    latestClimateByFarm,
    latestFieldHealthByFarm,
    refreshBackendHealth,
  } = useAgroShift();

  if (farms.length === 0 || !activeFarm) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<Sprout className="w-6 h-6" />}
          title="Welcome to AgroShift — Add Your First Farm"
          description="Set up your farm location anywhere in the world, record your farm size, water conditions, and previous crop to start climate and crop rotation planning."
          primaryAction={
            <Link
              to="/dashboard/farms/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Add Your First Farm
            </Link>
          }
          secondaryAction={
            <Link
              to="/dashboard/settings"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
            >
              Check Backend Settings
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
          <h2 className="font-display text-2xl font-bold text-[#172B22] dark:text-[#E8F1EC]">
            {activeFarm.details.name}
          </h2>
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mt-1">
            {locationSummary} · Last updated {new Date(activeFarm.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to={`/dashboard/farms/${activeFarm.id}/edit`}
            className="px-4 py-2 text-xs sm:text-sm font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] hover:border-[#16A34A] transition-colors whitespace-nowrap"
          >
            Edit Farm Profile
          </Link>
          <Link
            to="/dashboard/planner"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white transition-colors whitespace-nowrap"
          >
            <Repeat className="w-4 h-4" />
            Open Rotation Planner
          </Link>
        </div>
      </section>

      {/* Connection Status Banner when FastAPI is absent or offline */}
      {backendStatus.state === 'not_configured' && (
        <StatusBanner
          tone="info"
          title="FastAPI Earth Observation Backend Not Configured"
          description="Your saved farm profiles, crop history, and rotation planning workspace work offline in this browser. Live NASA POWER climate and Copernicus Sentinel-2 field analysis require setting VITE_API_BASE_URL or entering your FastAPI endpoint in Settings."
          action={
            <Link
              to="/dashboard/settings"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] whitespace-nowrap"
            >
              Configure Backend
            </Link>
          }
        />
      )}

      {backendStatus.state === 'unreachable' && (
        <StatusBanner
          tone="warning"
          title="Live Observation Backend Unreachable"
          description={
            backendStatus.errorMessage ||
            'Unable to connect to the FastAPI backend. Local farm records remain available.'
          }
          action={
            <button
              type="button"
              onClick={() => refreshBackendHealth()}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#14532D] text-white whitespace-nowrap"
            >
              Retry Connection
            </button>
          }
        />
      )}

      {/* B–G. Key Farm Summary Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Farm Location</span>
          </div>
          <p className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            {locationSummary || activeFarm.location.country}
          </p>
          <p className="text-xs font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
            {formatCoordinate(activeFarm.location.latitude, 'lat')} ·{' '}
            {formatCoordinate(activeFarm.location.longitude, 'lon')}
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1.5">
          <p className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            Farm Size & Geometry
          </p>
          <p className="text-base font-semibold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
            {formatAreaDual(activeFarm.details.areaHectares)}
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {activeFarm.location.geometryType === 'polygon'
              ? 'Field boundary polygon saved'
              : 'Single reference point saved'}
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            <Sprout className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Previous Crop</span>
          </div>
          <p className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            {activeFarm.history.previousCropName}
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
            {activeFarm.history.typicalPlantingWindow
              ? `Planting: ${activeFarm.history.typicalPlantingWindow}`
              : 'Planting window not specified'}
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            <Droplets className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Water Availability</span>
          </div>
          <p className="text-base font-semibold capitalize text-[#172B22] dark:text-[#E8F1EC]">
            {activeFarm.details.waterAvailability.replace(/_/g, ' ')}
          </p>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] capitalize">
            Irrigation: {activeFarm.details.irrigationMethod.replace(/_/g, ' ')}
          </p>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            <CloudSun className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>NASA POWER Climate Status</span>
          </div>
          <p className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            {climateObs
              ? climateObs.data_available
                ? `${climateObs.monthly_data?.length ?? 0} monthly records loaded`
                : 'No records returned'
              : backendStatus.state === 'connected'
                ? 'Ready to fetch'
                : 'Backend required'}
          </p>
          <Link
            to="/dashboard/climate"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#14532D] dark:text-[#10B981] hover:underline"
          >
            View Climate Intelligence
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            <Satellite className="w-3.5 h-3.5 text-[#16A34A]" />
            <span>Latest Field Analysis</span>
          </div>
          <p className="text-base font-semibold tabular-nums text-[#172B22] dark:text-[#E8F1EC]">
            {fieldObs
              ? fieldObs.ndvi !== null && fieldObs.ndvi !== undefined
                ? `NDVI ${fieldObs.ndvi.toFixed(2)} (${fieldObs.observation_date || 'Recent'})`
                : 'Analysis returned without NDVI'
              : backendStatus.state === 'connected'
                ? 'Not yet run in this session'
                : 'Backend required'}
          </p>
          <Link
            to="/dashboard/field-health"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#14532D] dark:text-[#10B981] hover:underline"
          >
            Open Field Health
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>

      {/* Map + Environmental Info */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Saved Field Location
            </h3>
            <Link
              to={`/dashboard/farms/${activeFarm.id}/edit`}
              className="text-xs font-medium text-[#16A34A] hover:underline"
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
        <div className="lg:col-span-5 rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-4">
          <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            Latest Environmental & Soil Summary
          </h3>

          {fieldObs ? (
            <div className="p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26] space-y-1.5 text-xs">
              <p className="font-semibold text-[#14532D] dark:text-[#10B981]">
                Copernicus Sentinel-2 & Weather Snapshot
              </p>
              <p className="tabular-nums">
                NDVI: {fieldObs.ndvi !== null && fieldObs.ndvi !== undefined ? fieldObs.ndvi.toFixed(3) : 'Unavailable'} · NDMI:{' '}
                {fieldObs.ndmi !== null && fieldObs.ndmi !== undefined ? fieldObs.ndmi.toFixed(3) : 'Unavailable'}
              </p>
              {fieldObs.weather?.temperature_c !== null &&
                fieldObs.weather?.temperature_c !== undefined && (
                  <p className="tabular-nums">
                    Observed weather: {formatTemperature(fieldObs.weather.temperature_c, settings.temperatureUnit)}
                  </p>
                )}
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26] text-xs text-[#64748B] dark:text-[#94A3B8]">
              No live satellite or weather measurements loaded for this farm yet. Run Field Health or Climate Intelligence when your FastAPI backend is connected.
            </div>
          )}

          <div className="space-y-2 text-xs border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-3">
            <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Recorded Soil Information
            </p>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Texture</span>
              <span className="capitalize">
                {activeFarm.soil.texture.replace(/_/g, ' ')} ({activeFarm.soil.textureProvenance.replace(/_/g, ' ')})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Soil pH</span>
              <span className="tabular-nums">
                {activeFarm.soil.ph !== null
                  ? `${activeFarm.soil.ph} (${activeFarm.soil.phProvenance.replace(/_/g, ' ')})`
                  : 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748B]">Drainage</span>
              <span className="capitalize">
                {activeFarm.soil.drainage.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Saved Plans & Recent Activity */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Saved Rotation Plans ({farmPlans.length})
            </h3>
            <Link
              to="/dashboard/planner"
              className="text-xs font-medium text-[#16A34A] hover:underline"
            >
              Create draft plan
            </Link>
          </div>
          {farmPlans.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
              No rotation planning drafts saved for {activeFarm.details.name} yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0] dark:divide-[#1E2E26]">
              {farmPlans.slice(0, 4).map((plan) => (
                <li key={plan.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{plan.title}</p>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {plan.horizonSeasons} seasons · {plan.localSeasonLabel || 'Custom calendar'}
                    </p>
                  </div>
                  <Link
                    to="/dashboard/planner"
                    className="text-xs font-medium text-[#14532D] dark:text-[#10B981] shrink-0"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 space-y-4">
          <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
            Recent Farm Activity
          </h3>
          {farmActivity.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
              Activity for this farm will appear here as you update profiles or save planning drafts.
            </p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0] dark:divide-[#1E2E26]">
              {farmActivity.map((item) => (
                <li key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <span className="text-[#172B22] dark:text-[#E8F1EC]">{item.action}</span>
                  <span className="font-mono tabular-nums text-[#64748B] shrink-0">
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

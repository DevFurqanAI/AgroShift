import { Link } from 'react-router-dom';
import { Download, FileText, PlusCircle, Printer } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { useAgroShift } from '../context/AgroShiftContext';
import { formatAreaDual, formatCoordinate } from '../utils/units';

export function ReportsPage() {
  const {
    activeFarm,
    plans,
    latestClimateByFarm,
    latestFieldHealthByFarm,
    latestRotationByFarm,
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
      farm: activeFarm,
      savedRotationPlans: farmPlans,
      sessionObservations: {
        nasaPowerClimate: climateObs,
        fieldAnalysis: fieldObs,
        rotationScreening: rotationObs,
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
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
            Transparent record of farmer-provided inputs, saved rotation plans, and any live Earth observations fetched in this session.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
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

      <article className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] p-6 space-y-6">
        <header className="border-b border-[#D9E2EC] dark:border-[#23362D] pb-4 flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-xs font-semibold as-text-accent">AgroShift Farm Record</p>
            <h3 className="text-xl font-bold mt-1">{activeFarm.details.name}</h3>
            <p className="text-xs text-[#64748B] mt-0.5">{locationDisplay}</p>
          </div>
          <div className="text-right text-xs font-mono tabular-nums text-[#64748B]">
            <p>{formatCoordinate(activeFarm.location.latitude, 'lat')}</p>
            <p>{formatCoordinate(activeFarm.location.longitude, 'lon')}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#64748B]">Area &amp; Operation</p>
            <p className="tabular-nums font-medium">
              {formatAreaDual(activeFarm.details.areaHectares)}
            </p>
            <p className="text-xs text-[#64748B] capitalize">
              Area source: {(activeFarm.details.areaSource ?? 'manual').replace(/_/g, ' ')} ·{' '}
              {activeFarm.details.farmType.replace(/_/g, ' ')} · Irrigation:{' '}
              {activeFarm.details.irrigationMethod.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#64748B]">Ordered Crop History</p>
            {orderedSeasons.length > 0 ? (
              <ol className="text-xs text-[#172B22] dark:text-[#E8F1EC] space-y-0.5 list-decimal pl-4">
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

        <section className="border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-4 space-y-2 text-xs">
          <h4 className="text-sm font-semibold">Soil Provenance</h4>
          <p className="text-[#64748B] dark:text-[#94A3B8]">
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
        </section>

        <section className="border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-4 space-y-2 text-xs">
          <h4 className="text-sm font-semibold">Earth Observation Data in Session</h4>
          <p className="text-[#64748B] dark:text-[#94A3B8]">
            NASA POWER Climate:{' '}
            {climateObs?.data_available
              ? `${climateObs.monthly?.length ?? 0} historical monthly records (${climateObs.start_year}–${climateObs.end_year})`
              : 'Not fetched in this session'}
          </p>
          <p className="text-[#64748B] dark:text-[#94A3B8]">
            Sentinel-2 Field Health:{' '}
            {fieldObs
              ? fieldObs.satellite_available
                ? `NDVI ${fieldObs.ndvi ?? 'N/A'} / NDMI ${fieldObs.ndmi ?? 'N/A'} (${fieldObs.satellite_observation_date ?? 'Date N/A'})`
                : `Satellite unavailable (${fieldObs.satellite_message || 'No recent clear scene'}); Weather: ${
                    fieldObs.weather_available && fieldObs.temperature_c !== null
                      ? `${fieldObs.temperature_c}°C`
                      : 'Unavailable'
                  }`
              : 'Not fetched in this session'}
          </p>
          <p className="text-[#64748B] dark:text-[#94A3B8]">
            Rotation Screening:{' '}
            {rotationObs && rotationObs.status === 'ok' && rotationObs.plans.length > 0
              ? `Top option: ${rotationObs.plans[0].seasons.map((s) => s.name).join(' → ')} (Score ${rotationObs.plans[0].score.toFixed(1)}/100)`
              : `${farmPlans.length} locally saved rotation plan(s)`}
          </p>
        </section>
      </article>
    </div>
  );
}

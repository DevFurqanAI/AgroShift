import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  BookmarkPlus,
  Loader2,
  PlusCircle,
  RefreshCw,
  Repeat,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { RotationComparisonCard } from '../components/rotation/RotationComparisonCard';
import { ScreeningLimitationsDisclosure } from '../components/rotation/ScreeningLimitationsDisclosure';
import { useAgroShift } from '../context/AgroShiftContext';
import {
  buildCropCatalog,
  isEngineSupportedCropId,
  normalizeCropIdForBackend,
} from '../data/crops';
import { useRotationCrops, useRotationPlanMutation } from '../hooks/useRotationPlanner';
import { FARMER_ERROR_MESSAGES } from '../services/api/agroshiftApi';
import type { RotationPlanOption } from '../types/api';
import type { WaterAvailability } from '../types/farm';
import {
  mapPrioritiesToBackendGoal,
  mapWaterAvailabilityToBackend,
  type PlanningHorizonSeasons,
  type RotationPlanDraft,
} from '../types/planner';

const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const BACKEND_GOAL_LABELS: Record<'water' | 'soil' | 'climate' | 'diversity', string> = {
  water: 'Reduce water demand',
  soil: 'Soil & pH compatibility',
  climate: 'Climate resilience',
  diversity: 'Crop family diversity',
};

export function PlannerPage() {
  const {
    activeFarm,
    plans,
    settings,
    latestRotationByFarm,
    saveRotationPlan,
    deleteRotationPlan,
  } = useAgroShift();

  const cropsQuery = useRotationCrops();
  const rotationMutation = useRotationPlanMutation(activeFarm?.id);

  const engineCatalog = useMemo(
    () => buildCropCatalog(cropsQuery.data?.crops, false),
    [cropsQuery.data]
  );

  const [title, setTitle] = useState('');
  const [horizonSeasons, setHorizonSeasons] = useState<PlanningHorizonSeasons>(3);
  const [plantingMonth, setPlantingMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [localSeasonLabel, setLocalSeasonLabel] = useState('');
  const [waterConstraint, setWaterConstraint] = useState<WaterAvailability>(
    activeFarm?.details.waterAvailability ?? 'seasonal_adequate'
  );
  const [referencePrevCropId, setReferencePrevCropId] = useState<string>('');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  // Sync defaults when active farm changes
  useEffect(() => {
    if (!activeFarm) return;
    setWaterConstraint(activeFarm.details.waterAvailability);
    const normalized = normalizeCropIdForBackend(activeFarm.history.previousCropId);
    if (isEngineSupportedCropId(normalized)) {
      setReferencePrevCropId(normalized);
    } else {
      setReferencePrevCropId('');
    }
    setSelectedCandidateIds([]);
    setFormValidationError(null);
    setSavedFeedback(null);
  }, [activeFarm]);

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<Repeat className="w-6 h-6" />}
        title="Add a Farm Before Planning Rotations"
        description="The Crop Rotation Planner uses your farm's coordinates, previous crop, water availability, soil context, and priorities."
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

  const savedPrevCropSupported = isEngineSupportedCropId(activeFarm.history.previousCropId);
  const effectivePreviousCropId = savedPrevCropSupported
    ? normalizeCropIdForBackend(activeFarm.history.previousCropId)
    : referencePrevCropId;

  const priorityMapping = mapPrioritiesToBackendGoal(activeFarm.priorities);
  const backendWaterLevel = mapWaterAvailabilityToBackend(waterConstraint);
  const farmPlans = plans.filter((p) => p.farmId === activeFarm.id);
  const liveResult = rotationMutation.data ?? latestRotationByFarm[activeFarm.id] ?? null;

  const currentYear = new Date().getFullYear();
  const endYear = Math.max(1985, currentYear - 1);
  const startYear = Math.max(1981, endYear - 9);

  const validSoilPh =
    activeFarm.soil.ph !== null &&
    Number.isFinite(activeFarm.soil.ph) &&
    activeFarm.soil.ph >= 3 &&
    activeFarm.soil.ph <= 10
      ? activeFarm.soil.ph
      : null;

  const handleToggleCandidate = (cropId: string) => {
    setFormValidationError(null);
    setSelectedCandidateIds((prev) =>
      prev.includes(cropId) ? prev.filter((id) => id !== cropId) : [...prev, cropId]
    );
  };

  const handleRunScreening = () => {
    setFormValidationError(null);
    setSavedFeedback(null);

    if (!effectivePreviousCropId) {
      setFormValidationError(
        `Your saved previous crop ("${activeFarm.history.previousCropName}") is not yet in the rotation screening catalog. Choose a reference crop below to screen rotations.`
      );
      return;
    }

    if (selectedCandidateIds.length === 1) {
      setFormValidationError(
        'Please select at least 2 candidate crops, or leave all unchecked to screen the full crop catalog.'
      );
      return;
    }

    rotationMutation.mutate({
      latitude: activeFarm.location.latitude,
      longitude: activeFarm.location.longitude,
      previous_crop: effectivePreviousCropId,
      candidate_crop_ids:
        selectedCandidateIds.length >= 2 ? selectedCandidateIds : undefined,
      soil_ph: validSoilPh,
      water_availability: backendWaterLevel,
      goal: priorityMapping.activeGoal,
      planting_month: plantingMonth,
      seasons: horizonSeasons,
      start_year: startYear,
      end_year: endYear,
      max_results: 4,
    });
  };

  const handleSavePlan = (snapshot?: RotationPlanOption | null) => {
    const now = new Date().toISOString();
    const chosenTitle =
      title.trim() ||
      (snapshot
        ? `${activeFarm.details.name}: ${snapshot.seasons.map((s) => s.name).join(' → ')}`
        : `${activeFarm.details.name} — ${horizonSeasons}-Season Plan`);

    const draft: RotationPlanDraft = {
      id: `plan-${Date.now()}`,
      farmId: activeFarm.id,
      farmName: activeFarm.details.name,
      title: chosenTitle,
      horizonSeasons,
      plantingMonth,
      localSeasonLabel:
        localSeasonLabel.trim() ||
        `Starting ${MONTH_OPTIONS.find((m) => m.value === plantingMonth)?.label ?? 'Month ' + plantingMonth}`,
      waterConstraint,
      previousCropId: effectivePreviousCropId || activeFarm.history.previousCropId,
      previousCropName: activeFarm.history.previousCropName,
      goals: activeFarm.priorities,
      activeBackendGoal: priorityMapping.activeGoal,
      notes: notes.trim(),
      topPlanSnapshot: snapshot ?? liveResult?.plans?.[0] ?? null,
      createdAt: now,
      updatedAt: now,
    };

    saveRotationPlan(draft);
    setTitle('');
    setNotes('');
    setSavedFeedback('Rotation plan saved to your local farm records.');
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    handleSavePlan(null);
  };

  const locationSummary =
    [activeFarm.location.locality, activeFarm.location.region, activeFarm.location.country]
      .filter(Boolean)
      .join(', ') || 'Coordinates saved';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">
            Crop Rotation Planner — {activeFarm.details.name}
          </h2>
          <p className="text-sm text-[var(--as-text-muted)]">
            Screen multi-season crop sequences against 10-year NASA POWER historical temperatures, water supply, crop family diversity, and optional soil pH.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunScreening}
          disabled={rotationMutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary transition-colors disabled:opacity-60 whitespace-nowrap self-start"
        >
          {rotationMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Screening Crops...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Find Rotation Options
            </>
          )}
        </button>
      </div>

      {/* Unsupported #1 Priority Notice */}
      {priorityMapping.unsupportedTopNotice && (
        <StatusBanner
          tone="info"
          title="Priority Alignment Notice"
          description={priorityMapping.unsupportedTopNotice}
        />
      )}

      {/* Unsupported Previous Crop Notice */}
      {!savedPrevCropSupported && (
        <StatusBanner
          tone="warning"
          title={`"${activeFarm.history.previousCropName}" Is Saved in Your History, Outside the 14-Crop Screening Catalog`}
          description="AgroShift never invents suitability scores for crops outside its catalog. Select a comparable reference crop below to screen next-season options, or update your farm's crop history."
        />
      )}

      {/* Catalog Offline Fallback Notice (non-blocking) */}
      {cropsQuery.isError && (
        <StatusBanner
          tone="warning"
          title="Live Crop Catalog Temporarily Unavailable"
          description={FARMER_ERROR_MESSAGES.catalog}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Planner Input Form */}
        <form
          onSubmit={handleSubmitForm}
          className="lg:col-span-7 rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 space-y-5"
        >
          <h3 className="text-base font-semibold">Planning Parameters</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs p-3.5 rounded-lg bg-[var(--as-bg-subtle)] border border-[var(--as-border)]">
            <div>
              <span className="text-[var(--as-text-muted)]">Saved Previous Crop</span>
              <p className="font-semibold text-sm mt-0.5">
                {activeFarm.history.previousCropName}
              </p>
            </div>
            <div>
              <span className="text-[var(--as-text-muted)]">Active Screening Goal</span>
              <p className="font-semibold text-sm mt-0.5">
                {BACKEND_GOAL_LABELS[priorityMapping.activeGoal]}
              </p>
            </div>
            <div>
              <span className="text-[var(--as-text-muted)]">Soil Context</span>
              <p className="font-semibold text-sm mt-0.5 capitalize">
                {activeFarm.soil.texture.replace(/_/g, ' ')} ·{' '}
                {validSoilPh !== null
                  ? `pH ${validSoilPh}`
                  : 'pH not recorded (not scored)'}
              </p>
            </div>
            <div>
              <span className="text-[var(--as-text-muted)]">Location</span>
              <p className="font-semibold text-sm mt-0.5">{locationSummary}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!savedPrevCropSupported && (
              <div className="sm:col-span-2">
                <label
                  htmlFor="ref-prev-crop"
                  className="block text-xs font-semibold mb-1.5"
                >
                  Reference Previous Crop for Screening *
                </label>
                <select
                  id="ref-prev-crop"
                  value={referencePrevCropId}
                  onChange={(e) => {
                    setReferencePrevCropId(e.target.value);
                    setFormValidationError(null);
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
                >
                  <option value="">Choose a comparable catalog crop...</option>
                  {engineCatalog.map((crop) => (
                    <option key={crop.id} value={crop.id}>
                      {crop.name} ({crop.botanicalFamily})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                htmlFor="plan-horizon"
                className="block text-xs font-semibold mb-1.5"
              >
                Planning Horizon
              </label>
              <select
                id="plan-horizon"
                value={horizonSeasons}
                onChange={(e) =>
                  setHorizonSeasons(Number(e.target.value) as PlanningHorizonSeasons)
                }
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              >
                <option value={2}>2 Seasons</option>
                <option value={3}>3 Seasons</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="planting-month"
                className="block text-xs font-semibold mb-1.5"
              >
                Next Planting Month
              </label>
              <select
                id="planting-month"
                value={plantingMonth}
                onChange={(e) => setPlantingMonth(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="plan-water"
                className="block text-xs font-semibold mb-1.5"
              >
                Water Availability (Engine Level: {backendWaterLevel})
              </label>
              <select
                id="plan-water"
                value={waterConstraint}
                onChange={(e) => setWaterConstraint(e.target.value as WaterAvailability)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              >
                <option value="abundant">Reliable / Abundant (High)</option>
                <option value="seasonal_adequate">Seasonal Adequate (Medium)</option>
                <option value="limited">Limited / Rationed (Low)</option>
                <option value="scarce">Scarce / Drought Risk (Low)</option>
                <option value="unknown">Unsure (Medium default)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="plan-title"
                className="block text-xs font-semibold mb-1.5"
              >
                Plan Label (for saving locally)
              </label>
              <input
                id="plan-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${activeFarm.details.name} Next Cycle`}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="plan-season"
                className="block text-xs font-semibold mb-1.5"
              >
                Local Cropping Season Name (optional)
              </label>
              <input
                id="plan-season"
                type="text"
                value={localSeasonLabel}
                onChange={(e) => setLocalSeasonLabel(e.target.value)}
                placeholder="e.g. Long Rains / Short Rains, Kharif-Rabi, Spring-Fall"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>
          </div>

          {/* Optional Candidate Crop Filter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">
                Filter Candidate Crops (optional — leave unchecked to screen all {engineCatalog.length})
              </span>
              {selectedCandidateIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCandidateIds([])}
                  className="text-xs as-text-accent font-medium hover:underline"
                >
                  Clear filter ({selectedCandidateIds.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {engineCatalog.map((crop) => {
                const selected = selectedCandidateIds.includes(crop.id);
                return (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => handleToggleCandidate(crop.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      selected
                        ? 'as-chip-selected'
                        : 'border-[var(--as-border)] bg-[var(--as-bg-subtle)] text-[var(--as-text-primary)] hover:border-[var(--as-accent-text)]'
                    }`}
                  >
                    {crop.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="plan-notes" className="block text-xs font-semibold mb-1.5">
              Farmer Notes (Market needs, fodder needs, input constraints)
            </label>
            <textarea
              id="plan-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Need household grain supply in Season 1 and market legume in Season 2..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-surface)]"
            />
          </div>

          {formValidationError && (
            <div className="flex items-start gap-2 text-xs as-text-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formValidationError}</span>
            </div>
          )}

          {savedFeedback && (
            <p className="text-xs font-medium as-text-accent">{savedFeedback}</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleRunScreening}
              disabled={rotationMutation.isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg as-btn-primary transition-colors disabled:opacity-60"
            >
              {rotationMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Screening Crops...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Screen Rotation Options
                </>
              )}
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-[var(--as-border)] hover:border-[var(--as-accent-text)] transition-colors"
            >
              <BookmarkPlus className="w-4 h-4 as-text-accent" />
              Save Plan Snapshot
            </button>
          </div>
        </form>

        {/* Saved Plans List */}
        <section className="lg:col-span-5 rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)] p-5 sm:p-6 space-y-4">
          <h3 className="text-base font-semibold">
            Saved Farm Plans ({farmPlans.length})
          </h3>
          {farmPlans.length === 0 ? (
            <p className="text-sm text-[var(--as-text-muted)]">
              No rotation plans saved yet for {activeFarm.details.name}. Run screening and save any option you want to compare or export in your Farm Dossier.
            </p>
          ) : (
            <div className="space-y-3">
              {farmPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-3.5 rounded-lg border border-[var(--as-border)] bg-[var(--as-bg-subtle)] space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{plan.title}</p>
                    <button
                      type="button"
                      onClick={() => deleteRotationPlan(plan.id)}
                      aria-label={`Delete plan ${plan.title}`}
                      className="p-1 text-[var(--as-text-muted)] hover:as-text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--as-text-muted)]">
                    {plan.horizonSeasons} seasons · {plan.localSeasonLabel} · Prev:{' '}
                    {plan.previousCropName}
                    {plan.topPlanSnapshot
                      ? ` · Score: ${plan.topPlanSnapshot.score.toFixed(1)}/100`
                      : ''}
                  </p>
                  {plan.notes && (
                    <p className="text-xs text-[var(--as-text-muted)] italic">
                      &ldquo;{plan.notes}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Rotation Screening Error */}
      {rotationMutation.isError && (
        <StatusBanner
          tone="error"
          title="Could Not Retrieve Rotation Options"
          description={FARMER_ERROR_MESSAGES.rotation}
          action={
            <button
              type="button"
              onClick={handleRunScreening}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#B91C1C] text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          }
        />
      )}

      {/* Non-OK Status (insufficient_data / invalid_crops) */}
      {liveResult && liveResult.status !== 'ok' && (
        <StatusBanner
          tone="warning"
          title={
            liveResult.status === 'invalid_crops'
              ? 'Selected Crops Not Supported for Screening'
              : 'Insufficient Historical Observations for These Planting Windows'
          }
          description={
            liveResult.message ||
            'No rotation scores were generated because required historical observations or catalog crops were unavailable.'
          }
          action={
            <button
              type="button"
              onClick={handleRunScreening}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[var(--as-warning-border)] as-text-warning"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          }
        />
      )}

      {/* Ranked Rotation Screening Results */}
      {liveResult && liveResult.status === 'ok' && liveResult.plans.length > 0 && (
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold">
                Ranked Rotation Options ({liveResult.plans.length})
              </h3>
              <p className="text-xs text-[var(--as-text-muted)]">
                Climate basis: {liveResult.climate_source || 'NASA POWER historical observations'} ({startYear}–{endYear}) · Goal: {BACKEND_GOAL_LABELS[priorityMapping.activeGoal]}
              </p>
            </div>
          </div>

          <ScreeningLimitationsDisclosure
            method={liveResult.method}
            catalogWarning={liveResult.catalog_warning}
            limitations={liveResult.limitations}
            extraNotes={
              liveResult.plans[0]?.diagnostics?.missing_data_notes ?? []
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {liveResult.plans.map((opt, idx) => (
              <RotationComparisonCard
                key={opt.crop_ids.join('-') + '-' + idx}
                plan={opt}
                rank={idx + 1}
                temperatureUnit={settings.temperatureUnit}
                onSavePlan={(chosen) => handleSavePlan(chosen)}
              />
            ))}
          </div>

          {/* Side-by-Side Summary Table */}
          <div className="overflow-x-auto rounded-xl border border-[var(--as-border)] bg-[var(--as-bg-surface)]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--as-border)] bg-[var(--as-bg-subtle)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Option</th>
                  <th className="px-4 py-3 font-semibold">Sequence</th>
                  <th className="px-4 py-3 font-semibold">Screening Match</th>
                  <th className="px-4 py-3 font-semibold">Overall Score</th>
                  <th className="px-4 py-3 font-semibold">Soil pH Scored</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--as-border)]">
                {liveResult.plans.map((opt, idx) => (
                  <tr key={opt.crop_ids.join('-') + '-row-' + idx}>
                    <td className="px-4 py-3 font-semibold">Option #{idx + 1}</td>
                    <td className="px-4 py-3">
                      {opt.seasons.map((s) => s.name).join(' → ')}
                    </td>
                    <td className="px-4 py-3 text-[var(--as-text-muted)]">
                      {opt.compatibility_band || 'Screening match'}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums font-semibold as-text-accent">
                      {opt.score.toFixed(1)} / 100
                    </td>
                    <td className="px-4 py-3 text-[var(--as-text-muted)]">
                      {opt.seasons[0]?.soil_ph_compatibility_score !== null
                        ? `Yes (pH ${validSoilPh})`
                        : 'No (pH not provided)'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookmarkPlus,
  Eye,
  EyeOff,
  PlusCircle,
  Repeat,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { RotationComparisonCard } from '../components/rotation/RotationComparisonCard';
import { useAgroShift } from '../context/AgroShiftContext';
import { ILLUSTRATIVE_ROTATION_EXAMPLES } from '../data/illustrativeRotationDemo';
import type { WaterAvailability } from '../types/farm';
import type { PlanningHorizonSeasons, RotationPlanDraft } from '../types/planner';

export function PlannerPage() {
  const { activeFarm, plans, saveRotationPlan, deleteRotationPlan } = useAgroShift();

  const [title, setTitle] = useState('');
  const [horizonSeasons, setHorizonSeasons] = useState<PlanningHorizonSeasons>(3);
  const [localSeasonLabel, setLocalSeasonLabel] = useState('');
  const [waterConstraint, setWaterConstraint] = useState<WaterAvailability>(
    activeFarm?.details.waterAvailability ?? 'seasonal_adequate'
  );
  const [notes, setNotes] = useState('');
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);
  const [showIllustrativeDemo, setShowIllustrativeDemo] = useState(false);

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<Repeat className="w-6 h-6" />}
        title="Add a Farm Before Planning Rotations"
        description="The Crop Rotation Planner uses your farm's previous crop, water availability, soil context, and priorities."
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

  const farmPlans = plans.filter((p) => p.farmId === activeFarm.id);

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const draft: RotationPlanDraft = {
      id: `plan-${Date.now()}`,
      farmId: activeFarm.id,
      farmName: activeFarm.details.name,
      title:
        title.trim() ||
        `${activeFarm.details.name} — ${horizonSeasons}-Season Draft`,
      horizonSeasons,
      localSeasonLabel: localSeasonLabel.trim() || 'Local main & secondary seasons',
      waterConstraint,
      previousCropName: activeFarm.history.previousCropName,
      goals: activeFarm.priorities,
      notes: notes.trim(),
      status: 'draft_awaiting_engine',
      createdAt: now,
      updatedAt: now,
    };

    saveRotationPlan(draft);
    setTitle('');
    setNotes('');
    setSavedFeedback('Rotation planning draft saved to your local farm records.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">
            Crop Rotation Planner — {activeFarm.details.name}
          </h2>
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
            Configure your planning horizon and constraints, save planning drafts, and preview comparison layouts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowIllustrativeDemo((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] hover:border-[#D97706] transition-colors whitespace-nowrap self-start"
        >
          {showIllustrativeDemo ? (
            <>
              <EyeOff className="w-3.5 h-3.5" />
              Hide Illustrative UI Preview
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              Preview Comparison Card Layout
            </>
          )}
        </button>
      </div>

      {/* Decision Engine Configuration Notice */}
      <StatusBanner
        tone="info"
        title="Scientific Rotation Decision Engine Being Configured"
        description="AgroShift does not invent fake crop scores or LLM-generated suitability ratings. Live agronomic rotation ranking will appear here once the scientific crop-climate-soil engine is connected in the next phase. You can configure and save your planning parameters now."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Planner Input Form */}
        <form
          onSubmit={handleSaveDraft}
          className="lg:col-span-7 rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5"
        >
          <h3 className="text-base font-semibold">Planning Parameters</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs p-3.5 rounded-lg bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26]">
            <div>
              <span className="text-[#64748B]">Previous Crop</span>
              <p className="font-semibold text-sm mt-0.5">
                {activeFarm.history.previousCropName}
              </p>
            </div>
            <div>
              <span className="text-[#64748B]">Top Farmer Priority</span>
              <p className="font-semibold text-sm mt-0.5 capitalize">
                {activeFarm.priorities[0]?.replace(/_/g, ' ') || 'Balanced'}
              </p>
            </div>
            <div>
              <span className="text-[#64748B]">Soil Texture / pH</span>
              <p className="font-semibold text-sm mt-0.5 capitalize">
                {activeFarm.soil.texture.replace(/_/g, ' ')} ·{' '}
                {activeFarm.soil.ph ? `pH ${activeFarm.soil.ph}` : 'pH unknown'}
              </p>
            </div>
            <div>
              <span className="text-[#64748B]">Location</span>
              <p className="font-semibold text-sm mt-0.5">{activeFarm.location.country}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="plan-title"
                className="block text-xs font-semibold mb-1.5"
              >
                Plan Draft Title
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
                <option value={4}>4 Seasons</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="plan-season"
                className="block text-xs font-semibold mb-1.5"
              >
                Local Cropping Season(s)
              </label>
              <input
                id="plan-season"
                type="text"
                value={localSeasonLabel}
                onChange={(e) => setLocalSeasonLabel(e.target.value)}
                placeholder="e.g. Long Rains / Short Rains, Spring-Fall"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>

            <div>
              <label
                htmlFor="plan-water"
                className="block text-xs font-semibold mb-1.5"
              >
                Water Limitation for Upcoming Cycle
              </label>
              <select
                id="plan-water"
                value={waterConstraint}
                onChange={(e) => setWaterConstraint(e.target.value as WaterAvailability)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              >
                <option value="abundant">Reliable / Abundant</option>
                <option value="seasonal_adequate">Seasonal Adequate</option>
                <option value="limited">Limited / Rationed</option>
                <option value="scarce">Scarce / Drought Risk</option>
                <option value="unknown">Unsure</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="plan-notes" className="block text-xs font-semibold mb-1.5">
              Farmer Notes (Market needs, fodder needs, input constraints)
            </label>
            <textarea
              id="plan-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Need household grain supply in Season 1 and market legume in Season 2..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
            />
          </div>

          {savedFeedback && (
            <p className="text-xs font-medium text-[#16A34A]">{savedFeedback}</p>
          )}

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white transition-colors"
          >
            <BookmarkPlus className="w-4 h-4" />
            Save Planning Draft
          </button>
        </form>

        {/* Saved Plans List */}
        <section className="lg:col-span-5 rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-4">
          <h3 className="text-base font-semibold">
            Saved Draft Plans ({farmPlans.length})
          </h3>
          {farmPlans.length === 0 ? (
            <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
              No planning drafts saved yet for {activeFarm.details.name}. Save your parameters on the left to queue them for the rotation engine.
            </p>
          ) : (
            <div className="space-y-3">
              {farmPlans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-3.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{plan.title}</p>
                    <button
                      type="button"
                      onClick={() => deleteRotationPlan(plan.id)}
                      aria-label={`Delete plan ${plan.title}`}
                      className="p-1 text-[#64748B] hover:text-[#DC2626]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                    {plan.horizonSeasons} seasons · {plan.localSeasonLabel} · Prev:{' '}
                    {plan.previousCropName}
                  </p>
                  {plan.notes && (
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] italic">
                      &ldquo;{plan.notes}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Isolated Illustrative UI Preview Module */}
      {showIllustrativeDemo && (
        <section className="rounded-2xl border border-[#D97706]/40 bg-[#D97706]/5 p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                Illustrative Comparison Layout — Not Agricultural Advice
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                These cards demonstrate how the scientific engine&apos;s crop sequence comparisons will be presented once calibrated. They do not represent live advice for {activeFarm.details.name}.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {ILLUSTRATIVE_ROTATION_EXAMPLES.map((opt) => (
              <RotationComparisonCard key={opt.id} option={opt} />
            ))}
          </div>

          {/* Side-by-side comparison table */}
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Comparison Dimension</th>
                  {ILLUSTRATIVE_ROTATION_EXAMPLES.map((opt) => (
                    <th key={opt.id} className="px-4 py-3 font-semibold">
                      {opt.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E2E26]">
                <tr>
                  <td className="px-4 py-3 font-medium">3-Season Sequence</td>
                  {ILLUSTRATIVE_ROTATION_EXAMPLES.map((opt) => (
                    <td key={opt.id} className="px-4 py-3 text-[#64748B] dark:text-[#94A3B8]">
                      {opt.sequence.map((s) => s.cropName).join(' → ')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Water Considerations</td>
                  {ILLUSTRATIVE_ROTATION_EXAMPLES.map((opt) => (
                    <td key={opt.id} className="px-4 py-3 text-[#64748B] dark:text-[#94A3B8]">
                      {opt.waterDemandConsiderations}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium">Soil Considerations</td>
                  {ILLUSTRATIVE_ROTATION_EXAMPLES.map((opt) => (
                    <td key={opt.id} className="px-4 py-3 text-[#64748B] dark:text-[#94A3B8]">
                      {opt.soilHealthConsiderations}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

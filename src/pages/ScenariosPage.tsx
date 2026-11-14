import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CloudRain, Flame, History, PlusCircle, SlidersHorizontal, Sun } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBanner } from '../components/common/StatusBanner';
import { useAgroShift } from '../context/AgroShiftContext';
import type { ClimateScenarioAssumption, ClimateScenarioId } from '../types/planner';

const SCENARIO_PRESETS: ClimateScenarioAssumption[] = [
  {
    id: 'baseline',
    label: 'Baseline Historical Conditions',
    description: 'Reference period grounded in historical NASA POWER observations without forward adjustments.',
    temperatureDeltaC: 0,
    precipitationShiftPercent: 0,
  },
  {
    id: 'warmer',
    label: 'Warmer Conditions',
    description: 'Stress-test rotation timing under higher seasonal daytime and nighttime temperatures.',
    temperatureDeltaC: 1.5,
    precipitationShiftPercent: 0,
  },
  {
    id: 'drier',
    label: 'Drier Conditions',
    description: 'Explore drought-resilient crop choices under reduced seasonal rainfall.',
    temperatureDeltaC: 1.0,
    precipitationShiftPercent: -20,
  },
  {
    id: 'wetter',
    label: 'Wetter Conditions',
    description: 'Assess drainage, fungal disease risk, and excess-moisture resilience.',
    temperatureDeltaC: 0.5,
    precipitationShiftPercent: 20,
  },
];

export function ScenariosPage() {
  const { activeFarm } = useAgroShift();
  const [selectedId, setSelectedId] = useState<ClimateScenarioId>('baseline');
  const [customTempDelta, setCustomTempDelta] = useState(0);
  const [customPrecipShift, setCustomPrecipShift] = useState(0);

  if (!activeFarm) {
    return (
      <EmptyState
        icon={<SlidersHorizontal className="w-6 h-6" />}
        title="Select or Add a Farm to Explore Climate Scenarios"
        description="Scenario controls pair with your farm's historical climate baseline and water profile."
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

  const handleSelectScenario = (preset: ClimateScenarioAssumption) => {
    setSelectedId(preset.id);
    setCustomTempDelta(preset.temperatureDeltaC);
    setCustomPrecipShift(preset.precipitationShiftPercent);
  };

  const getScenarioIcon = (id: ClimateScenarioId) => {
    if (id === 'baseline') return History;
    if (id === 'warmer') return Flame;
    if (id === 'drier') return Sun;
    return CloudRain;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold">
          Compare Climate Scenarios — {activeFarm.details.name}
        </h2>
        <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mt-1">
          Configure scenario assumptions to prepare for climate-stress rotation comparisons.
        </p>
      </div>

      <StatusBanner
        tone="info"
        title="Scenario Simulation Engine Not Yet Connected"
        description="These controls prepare the scenario assumptions for upcoming crop-sensitivity modeling. Adjusted temperatures and rainfall percentages shown here are user-selected sensitivity assumptions—never actual NASA forecasts."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SCENARIO_PRESETS.map((preset) => {
          const active = preset.id === selectedId;
          const Icon = getScenarioIcon(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectScenario(preset)}
              className={`text-left rounded-xl border p-5 space-y-2.5 transition-colors ${
                active
                  ? 'border-[#14532D] bg-[#14532D]/5 dark:border-[#10B981] dark:bg-[#10B981]/10'
                  : 'border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] hover:border-[#16A34A]'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-[#16A34A]/10 text-[#14532D] dark:text-[#10B981] flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                {preset.label}
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                {preset.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Interactive Scenario Assumption Controls */}
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-base font-semibold">Selected Assumption Parameters</h3>
          <span className="text-xs text-[#D97706] font-medium">
            Sensitivity controls only — projection calculations unavailable
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="temp-delta" className="font-semibold">
                Seasonal Temperature Shift Assumption
              </label>
              <span className="font-mono tabular-nums font-semibold text-[#14532D] dark:text-[#10B981]">
                {customTempDelta >= 0 ? `+${customTempDelta.toFixed(1)}` : customTempDelta.toFixed(1)} °C
              </span>
            </div>
            <input
              id="temp-delta"
              type="range"
              min={-1}
              max={4}
              step={0.5}
              value={customTempDelta}
              onChange={(e) => setCustomTempDelta(Number(e.target.value))}
              className="w-full accent-[#14532D]"
            />
            <div className="flex justify-between text-[11px] text-[#64748B]">
              <span>-1.0 °C</span>
              <span>Baseline (0 °C)</span>
              <span>+4.0 °C</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="precip-shift" className="font-semibold">
                Seasonal Precipitation Shift Assumption
              </label>
              <span className="font-mono tabular-nums font-semibold text-[#14532D] dark:text-[#10B981]">
                {customPrecipShift > 0 ? `+${customPrecipShift}` : customPrecipShift}%
              </span>
            </div>
            <input
              id="precip-shift"
              type="range"
              min={-40}
              max={40}
              step={5}
              value={customPrecipShift}
              onChange={(e) => setCustomPrecipShift(Number(e.target.value))}
              className="w-full accent-[#14532D]"
            />
            <div className="flex justify-between text-[11px] text-[#64748B]">
              <span>-40% (Drier)</span>
              <span>Baseline (0%)</span>
              <span>+40% (Wetter)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

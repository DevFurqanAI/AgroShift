import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Search,
  AlertCircle,
  MapPin,
  Pentagon,
} from 'lucide-react';
import { COUNTRIES } from '../../data/countries';
import { GLOBAL_CROPS } from '../../data/crops';
import { useAgroShift } from '../../context/AgroShiftContext';
import type {
  AreaUnit,
  DataProvenance,
  DrainageQuality,
  FarmerPriorityId,
  FarmProfile,
  FarmType,
  GeoJSONPolygon,
  IrrigationMethod,
  SoilTexture,
  WaterAvailability,
} from '../../types/farm';
import {
  acresToHectares,
  fromHectares,
  hectaresToAcres,
  toHectares,
} from '../../utils/units';
import { validateCoordinates } from '../../utils/validation';
import { GlobalFarmMap } from '../maps/GlobalFarmMap';

const STEPS = [
  { id: 1, title: 'Farm Location' },
  { id: 2, title: 'Farm Information' },
  { id: 3, title: 'Soil Information' },
  { id: 4, title: 'Farm History' },
  { id: 5, title: 'Farmer Priorities' },
  { id: 6, title: 'Review & Save' },
];

const PRIORITY_LABELS: Record<
  FarmerPriorityId,
  { title: string; description: string }
> = {
  reduce_water_demand: {
    title: 'Reduce water demand',
    description: 'Prefer lower-water crops and moisture-conserving crop sequences.',
  },
  support_soil_health: {
    title: 'Support soil health',
    description: 'Improve organic residue, soil cover, and biological nitrogen cycling.',
  },
  maintain_productivity: {
    title: 'Maintain productivity',
    description: 'Protect stable staple and cash crop yields across seasons.',
  },
  climate_resilience: {
    title: 'Improve resilience to climate variability',
    description: 'Buffer against heat stress, delayed rains, or extreme rainfall.',
  },
  diversify_crops: {
    title: 'Diversify crops',
    description: 'Spread market and pest risk by rotating across botanical families.',
  },
};

interface FarmWizardProps {
  existingFarm?: FarmProfile;
}

export function FarmWizard({ existingFarm }: FarmWizardProps) {
  const navigate = useNavigate();
  const { saveFarm, settings } = useAgroShift();
  const isEdit = Boolean(existingFarm);

  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Step 1: Location
  const [countryCode, setCountryCode] = useState(
    existingFarm?.location.countryCode ?? ''
  );
  const [countryName, setCountryName] = useState(
    existingFarm?.location.country ?? ''
  );
  const [region, setRegion] = useState(existingFarm?.location.region ?? '');
  const [locality, setLocality] = useState(existingFarm?.location.locality ?? '');
  const [latInput, setLatInput] = useState(
    existingFarm ? String(existingFarm.location.latitude) : ''
  );
  const [lonInput, setLonInput] = useState(
    existingFarm ? String(existingFarm.location.longitude) : ''
  );
  const [geometryType, setGeometryType] = useState<'point' | 'polygon'>(
    existingFarm?.location.geometryType ?? 'point'
  );
  const [polygonGeoJSON, setPolygonGeoJSON] = useState<GeoJSONPolygon | null>(
    existingFarm?.location.polygonGeoJSON ?? null
  );
  const [polygonEstimatedHectares, setPolygonEstimatedHectares] = useState<
    number | null
  >(existingFarm?.location.polygonEstimatedHectares ?? null);
  const [mapFocus, setMapFocus] = useState<{
    lat: number;
    lon: number;
    zoom: number;
  } | null>(
    existingFarm
      ? {
          lat: existingFarm.location.latitude,
          lon: existingFarm.location.longitude,
          zoom: 13,
        }
      : null
  );

  // Step 2: Farm Info
  const [farmName, setFarmName] = useState(existingFarm?.details.name ?? '');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(
    existingFarm?.details.preferredAreaUnit ?? settings.areaUnit
  );
  const [areaInput, setAreaInput] = useState(() => {
    if (!existingFarm) return '';
    return String(
      fromHectares(
        existingFarm.details.areaHectares,
        existingFarm.details.preferredAreaUnit
      )
    );
  });
  const [farmType, setFarmType] = useState<FarmType>(
    existingFarm?.details.farmType ?? 'smallholder'
  );
  const [irrigationMethod, setIrrigationMethod] = useState<IrrigationMethod>(
    existingFarm?.details.irrigationMethod ?? 'rainfed_only'
  );
  const [waterAvailability, setWaterAvailability] = useState<WaterAvailability>(
    existingFarm?.details.waterAvailability ?? 'seasonal_adequate'
  );
  const [managedFieldsCount, setManagedFieldsCount] = useState(
    existingFarm?.details.managedFieldsCount
      ? String(existingFarm.details.managedFieldsCount)
      : ''
  );

  // Step 3: Soil Info
  const [soilTexture, setSoilTexture] = useState<SoilTexture>(
    existingFarm?.soil.texture ?? 'unknown'
  );
  const [soilTextureProv, setSoilTextureProv] = useState<DataProvenance>(
    existingFarm?.soil.textureProvenance ?? 'unknown'
  );
  const [soilPh, setSoilPh] = useState(
    existingFarm?.soil.ph !== null && existingFarm?.soil.ph !== undefined
      ? String(existingFarm.soil.ph)
      : ''
  );
  const [soilPhProv, setSoilPhProv] = useState<DataProvenance>(
    existingFarm?.soil.phProvenance ?? 'unknown'
  );
  const [drainage, setDrainage] = useState<DrainageQuality>(
    existingFarm?.soil.drainage ?? 'unknown'
  );
  const [drainageProv, setDrainageProv] = useState<DataProvenance>(
    existingFarm?.soil.drainageProvenance ?? 'unknown'
  );
  const [organicMatter, setOrganicMatter] = useState(
    existingFarm?.soil.organicMatterPercent !== null &&
      existingFarm?.soil.organicMatterPercent !== undefined
      ? String(existingFarm.soil.organicMatterPercent)
      : ''
  );
  const [organicMatterProv, setOrganicMatterProv] = useState<DataProvenance>(
    existingFarm?.soil.organicMatterProvenance ?? 'unknown'
  );
  const [hasLabSoilTest, setHasLabSoilTest] = useState(
    existingFarm?.soil.hasLabSoilTest ?? false
  );
  const [soilObservations, setSoilObservations] = useState(
    existingFarm?.soil.observations ?? ''
  );

  // Step 4: Farm History
  const [cropSearch, setCropSearch] = useState('');
  const [previousCropId, setPreviousCropId] = useState(
    existingFarm?.history.previousCropId ?? ''
  );
  const [previousCropName, setPreviousCropName] = useState(
    existingFarm?.history.previousCropName ?? ''
  );
  const [earlierCrops, setEarlierCrops] = useState<string[]>(
    existingFarm?.history.earlierCrops ?? []
  );
  const [plantingWindow, setPlantingWindow] = useState(
    existingFarm?.history.typicalPlantingWindow ?? ''
  );
  const [harvestWindow, setHarvestWindow] = useState(
    existingFarm?.history.typicalHarvestWindow ?? ''
  );
  const [rotationChallenges, setRotationChallenges] = useState(
    existingFarm?.history.rotationChallenges ?? ''
  );

  // Step 5: Priorities (ordered list)
  const [priorities, setPriorities] = useState<FarmerPriorityId[]>(
    existingFarm?.priorities?.length
      ? existingFarm.priorities
      : [
          'support_soil_health',
          'climate_resilience',
          'reduce_water_demand',
          'maintain_productivity',
          'diversify_crops',
        ]
  );

  const parsedLat = latInput.trim() === '' ? null : Number(latInput);
  const parsedLon = lonInput.trim() === '' ? null : Number(lonInput);

  const coordStatus = useMemo(() => {
    if (parsedLat === null || parsedLon === null) {
      return { valid: false, error: 'Select a location on the map or enter latitude and longitude.' };
    }
    return validateCoordinates(parsedLat, parsedLon);
  }, [parsedLat, parsedLon]);

  const filteredCrops = useMemo(() => {
    const q = cropSearch.trim().toLowerCase();
    if (!q) return GLOBAL_CROPS;
    return GLOBAL_CROPS.filter(
      (crop) =>
        crop.name.toLowerCase().includes(q) ||
        crop.category.toLowerCase().includes(q) ||
        crop.commonAliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [cropSearch]);

  const handleCountrySelect = (code: string) => {
    setCountryCode(code);
    const match = COUNTRIES.find((c) => c.code === code);
    if (match) {
      setCountryName(match.code === 'OTHER' ? '' : match.name);
      setMapFocus({
        lat: match.mapFocusLat,
        lon: match.mapFocusLon,
        zoom: match.code === 'OTHER' ? 2 : 5,
      });
    }
  };

  const handleUseBoundaryArea = () => {
    if (polygonEstimatedHectares === null) return;
    const val =
      areaUnit === 'acres'
        ? hectaresToAcres(polygonEstimatedHectares)
        : polygonEstimatedHectares;
    setAreaInput(val.toFixed(2));
  };

  const handleAreaUnitSwitch = (nextUnit: AreaUnit) => {
    if (nextUnit === areaUnit) return;
    const num = Number(areaInput);
    if (Number.isFinite(num) && num > 0) {
      const converted =
        nextUnit === 'acres' ? hectaresToAcres(num) : acresToHectares(num);
      setAreaInput(converted.toFixed(2));
    }
    setAreaUnit(nextUnit);
  };

  const movePriority = (index: number, direction: -1 | 1) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= priorities.length) return;
    setPriorities((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const togglePriorityActive = (id: FarmerPriorityId) => {
    setPriorities((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least 1 priority
        return prev.filter((p) => p !== id);
      }
      return [...prev, id];
    });
  };

  const toggleEarlierCrop = (name: string) => {
    setEarlierCrops((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  };

  const validateCurrentStep = (targetStep: number): boolean => {
    setStepError(null);

    if (step === 1 && targetStep > 1) {
      if (!countryName.trim()) {
        setStepError('Please select or enter your country.');
        return false;
      }
      if (!coordStatus.valid) {
        setStepError(
          coordStatus.error || 'Please enter valid latitude (-90 to 90) and longitude (-180 to 180).'
        );
        return false;
      }
      if (geometryType === 'polygon' && !polygonGeoJSON) {
        setStepError(
          'You selected boundary drawing mode. Draw at least 3 corners on the map or switch to Farm Point mode.'
        );
        return false;
      }
    }

    if (step === 2 && targetStep > 2) {
      if (!farmName.trim()) {
        setStepError('Please give your farm a clear name.');
        return false;
      }
      const areaVal = Number(areaInput);
      if (!Number.isFinite(areaVal) || areaVal <= 0) {
        setStepError('Please enter a positive farm area.');
        return false;
      }
    }

    if (step === 3 && targetStep > 3) {
      if (soilPh.trim() !== '') {
        const phNum = Number(soilPh);
        if (!Number.isFinite(phNum) || phNum < 2.5 || phNum > 10.5) {
          setStepError('Soil pH should be between 2.5 and 10.5 (or leave blank if unknown).');
          return false;
        }
      }
      if (organicMatter.trim() !== '') {
        const omNum = Number(organicMatter);
        if (!Number.isFinite(omNum) || omNum < 0 || omNum > 100) {
          setStepError('Organic matter percentage must be between 0 and 100.');
          return false;
        }
      }
    }

    if (step === 4 && targetStep > 4) {
      if (!previousCropName.trim()) {
        setStepError('Please select your previous crop (or select Fallow / Unplanted).');
        return false;
      }
    }

    return true;
  };

  const goToStep = (nextStep: number) => {
    if (nextStep < 1 || nextStep > STEPS.length) return;
    if (!validateCurrentStep(nextStep)) return;
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveFarm = () => {
    if (!validateCurrentStep(6)) return;
    if (!coordStatus.valid || parsedLat === null || parsedLon === null) {
      setStep(1);
      setStepError('Valid coordinates are required.');
      return;
    }

    const areaVal = Number(areaInput);
    if (!Number.isFinite(areaVal) || areaVal <= 0) {
      setStep(2);
      setStepError('Valid farm area is required.');
      return;
    }

    const now = new Date().toISOString();
    const farm: FarmProfile = {
      id: existingFarm?.id ?? `farm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      location: {
        country: countryName.trim(),
        countryCode: countryCode || 'OTHER',
        region: region.trim(),
        locality: locality.trim(),
        latitude: Number(parsedLat.toFixed(6)),
        longitude: Number(parsedLon.toFixed(6)),
        geometryType: polygonGeoJSON ? geometryType : 'point',
        polygonGeoJSON: geometryType === 'polygon' ? polygonGeoJSON : null,
        polygonEstimatedHectares:
          geometryType === 'polygon' ? polygonEstimatedHectares : null,
      },
      details: {
        name: farmName.trim(),
        areaHectares: toHectares(areaVal, areaUnit),
        preferredAreaUnit: areaUnit,
        farmType,
        irrigationMethod,
        waterAvailability,
        managedFieldsCount:
          managedFieldsCount.trim() && Number(managedFieldsCount) > 0
            ? Math.round(Number(managedFieldsCount))
            : null,
      },
      soil: {
        texture: soilTexture,
        textureProvenance: soilTexture === 'unknown' ? 'unknown' : soilTextureProv,
        ph: soilPh.trim() ? Number(soilPh) : null,
        phProvenance: soilPh.trim() ? soilPhProv : 'unknown',
        drainage,
        drainageProvenance: drainage === 'unknown' ? 'unknown' : drainageProv,
        organicMatterPercent: organicMatter.trim() ? Number(organicMatter) : null,
        organicMatterProvenance: organicMatter.trim() ? organicMatterProv : 'unknown',
        hasLabSoilTest,
        observations: soilObservations.trim(),
      },
      history: {
        previousCropId: previousCropId || 'custom',
        previousCropName: previousCropName.trim(),
        earlierCrops,
        typicalPlantingWindow: plantingWindow.trim(),
        typicalHarvestWindow: harvestWindow.trim(),
        rotationChallenges: rotationChallenges.trim(),
      },
      priorities,
      createdAt: existingFarm?.createdAt ?? now,
      updatedAt: now,
    };

    saveFarm(farm, isEdit);
    navigate('/dashboard');
  };

  const areaHectaresPreview = useMemo(() => {
    const num = Number(areaInput);
    if (!Number.isFinite(num) || num <= 0) return null;
    return toHectares(num, areaUnit);
  }, [areaInput, areaUnit]);

  return (
    <div className="space-y-6">
      {/* Stepper Header */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              {isEdit ? `Edit Farm: ${existingFarm?.details.name}` : 'Set Up Your Farm Profile'}
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Step {step} of {STEPS.length} — {STEPS[step - 1].title}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
            Saved locally on this device
          </span>
        </div>

        <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {STEPS.map((s) => {
            const isCurrent = s.id === step;
            const isDone = s.id < step;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (s.id <= step) setStep(s.id);
                    else goToStep(s.id);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    isCurrent
                      ? 'border-[#14532D] bg-[#14532D]/5 text-[#14532D] dark:border-[#10B981] dark:bg-[#10B981]/10 dark:text-[#10B981] font-semibold'
                      : isDone
                        ? 'border-[#16A34A]/30 bg-white dark:bg-[#0B1310] text-[#172B22] dark:text-[#E8F1EC]'
                        : 'border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  <span className="font-mono tabular-nums mr-1.5">0{s.id}</span>
                  <span>{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {stepError && (
        <div
          role="alert"
          className="rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/5 px-4 py-3 flex items-start gap-2.5 text-sm text-[#DC2626]"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{stepError}</span>
        </div>
      )}

      {/* STEP 1: LOCATION */}
      {step === 1 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="farm-country"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Country *
              </label>
              <select
                id="farm-country"
                value={countryCode}
                onChange={(e) => handleCountrySelect(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="">Select a country...</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
              {countryCode === 'OTHER' && (
                <input
                  type="text"
                  value={countryName}
                  onChange={(e) => setCountryName(e.target.value)}
                  placeholder="Enter country name"
                  className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              )}
            </div>

            <div>
              <label
                htmlFor="farm-region"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                State / Province / Region
              </label>
              <input
                id="farm-region"
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. Iowa, Nakuru, Andalusia"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              />
            </div>

            <div>
              <label
                htmlFor="farm-locality"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                City / Village / Locality
              </label>
              <input
                id="farm-locality"
                type="text"
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="Nearest town or district"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              />
            </div>
          </div>

          <GlobalFarmMap
            latitude={coordStatus.valid ? parsedLat : null}
            longitude={coordStatus.valid ? parsedLon : null}
            polygonGeoJSON={polygonGeoJSON}
            geometryType={geometryType}
            focusTarget={mapFocus}
            onModeChange={(mode) => setGeometryType(mode)}
            onPointChange={(lat, lon) => {
              setLatInput(String(lat));
              setLonInput(String(lon));
              setGeometryType('point');
            }}
            onPolygonChange={(poly, estHa, centroid) => {
              setPolygonGeoJSON(poly);
              setPolygonEstimatedHectares(estHa);
              if (centroid) {
                setLatInput(String(centroid.lat));
                setLonInput(String(centroid.lon));
              }
            }}
          />

          {/* Manual Coordinates */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                Exact Coordinates (Manual Entry or Map Selection)
              </h3>
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8] inline-flex items-center gap-1.5">
                {geometryType === 'polygon' ? (
                  <>
                    <Pentagon className="w-3.5 h-3.5 text-[#16A34A]" />
                    Field boundary polygon mode
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
                    Single farm point mode
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="farm-lat"
                  className="block text-xs text-[#64748B] dark:text-[#94A3B8] mb-1"
                >
                  Latitude (-90 to 90) *
                </label>
                <input
                  id="farm-lat"
                  type="number"
                  step="any"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="e.g. 41.8780"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
              <div>
                <label
                  htmlFor="farm-lon"
                  className="block text-xs text-[#64748B] dark:text-[#94A3B8] mb-1"
                >
                  Longitude (-180 to 180) *
                </label>
                <input
                  id="farm-lon"
                  type="number"
                  step="any"
                  value={lonInput}
                  onChange={(e) => setLonInput(e.target.value)}
                  placeholder="e.g. -93.0977"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
            </div>

            {!coordStatus.valid && (latInput !== '' || lonInput !== '') && (
              <p className="text-xs text-[#DC2626]">{coordStatus.error}</p>
            )}
          </div>
        </section>
      )}

      {/* STEP 2: FARM INFORMATION */}
      {step === 2 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="farm-name"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Farm Name *
              </label>
              <input
                id="farm-name"
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g. North Ridge Plot, Green Valley Farm"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              />
            </div>

            <div>
              <label
                htmlFor="farm-area"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Cultivated Area *
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="farm-area"
                  type="number"
                  step="any"
                  min="0.01"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  placeholder="Enter area"
                  className="flex-1 px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
                <div className="inline-flex rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] p-0.5 bg-[#F8FAF7] dark:bg-[#0B1310]">
                  <button
                    type="button"
                    onClick={() => handleAreaUnitSwitch('hectares')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      areaUnit === 'hectares'
                        ? 'bg-[#14532D] text-white'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    Hectares
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAreaUnitSwitch('acres')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      areaUnit === 'acres'
                        ? 'bg-[#14532D] text-white'
                        : 'text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    Acres
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                {areaHectaresPreview !== null ? (
                  <span className="tabular-nums">
                    Equivalent: {areaHectaresPreview.toFixed(2)} ha ·{' '}
                    {hectaresToAcres(areaHectaresPreview).toFixed(2)} ac
                  </span>
                ) : (
                  <span>Enter total farm or field size</span>
                )}
                {polygonEstimatedHectares !== null && (
                  <button
                    type="button"
                    onClick={handleUseBoundaryArea}
                    className="text-[#16A34A] hover:underline font-medium"
                  >
                    Use estimated map boundary (~{polygonEstimatedHectares.toFixed(2)} ha)
                  </button>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="farm-type"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Farm Operation Type
              </label>
              <select
                id="farm-type"
                value={farmType}
                onChange={(e) => setFarmType(e.target.value as FarmType)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="smallholder">Smallholder / Family Farm</option>
                <option value="rainfed">Rain-fed Arable Farm</option>
                <option value="irrigated">Irrigated Farm</option>
                <option value="mixed">Mixed Crop & Livestock</option>
                <option value="commercial">Commercial Agricultural Operation</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="irrigation-method"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Primary Irrigation Method
              </label>
              <select
                id="irrigation-method"
                value={irrigationMethod}
                onChange={(e) => setIrrigationMethod(e.target.value as IrrigationMethod)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="rainfed_only">Rain-fed Only (No Irrigation)</option>
                <option value="drip">Drip / Micro-irrigation</option>
                <option value="sprinkler">Sprinkler</option>
                <option value="furrow_surface">Furrow / Surface Irrigation</option>
                <option value="canal_flood">Canal / Basin Flood</option>
                <option value="center_pivot">Center Pivot</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="water-availability"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Typical Water Availability
              </label>
              <select
                id="water-availability"
                value={waterAvailability}
                onChange={(e) => setWaterAvailability(e.target.value as WaterAvailability)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="abundant">Reliable / Abundant Year-round</option>
                <option value="seasonal_adequate">Adequate During Main Growing Season</option>
                <option value="limited">Limited / Rationed</option>
                <option value="scarce">Scarce / Drought-sensitive</option>
                <option value="unknown">Unsure / Varies Widely</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="fields-count"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Number of Managed Plots / Fields (Optional)
              </label>
              <input
                id="fields-count"
                type="number"
                min="1"
                value={managedFieldsCount}
                onChange={(e) => setManagedFieldsCount(e.target.value)}
                placeholder="e.g. 3"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              />
            </div>
          </div>
        </section>
      )}

      {/* STEP 3: SOIL INFORMATION */}
      {step === 3 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Optional Soil Context
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Laboratory values are not required. Indicate whether each detail comes from a farmer test/observation, a field estimate, or is unknown.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              id="has-lab-test"
              type="checkbox"
              checked={hasLabSoilTest}
              onChange={(e) => setHasLabSoilTest(e.target.checked)}
              className="w-4 h-4 rounded accent-[#14532D]"
            />
            <label
              htmlFor="has-lab-test"
              className="text-sm text-[#172B22] dark:text-[#E8F1EC]"
            >
              I have laboratory soil test results available
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2 p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
              <label
                htmlFor="soil-texture"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
              >
                Soil Texture
              </label>
              <select
                id="soil-texture"
                value={soilTexture}
                onChange={(e) => {
                  const val = e.target.value as SoilTexture;
                  setSoilTexture(val);
                  if (val === 'unknown') setSoilTextureProv('unknown');
                  else if (soilTextureProv === 'unknown') setSoilTextureProv('farmer_provided');
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
              >
                <option value="unknown">Unknown</option>
                <option value="sandy">Sandy</option>
                <option value="sandy_loam">Sandy Loam</option>
                <option value="loam">Loam</option>
                <option value="silt_loam">Silt Loam</option>
                <option value="clay_loam">Clay Loam</option>
                <option value="clay">Clay</option>
              </select>
              {soilTexture !== 'unknown' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#64748B]">Source:</span>
                  <select
                    aria-label="Soil texture source"
                    value={soilTextureProv}
                    onChange={(e) => setSoilTextureProv(e.target.value as DataProvenance)}
                    className="px-2 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                  >
                    <option value="farmer_provided">Farmer-provided / Lab</option>
                    <option value="estimated">Field estimate</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2 p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
              <label
                htmlFor="soil-drainage"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
              >
                Drainage Characteristics
              </label>
              <select
                id="soil-drainage"
                value={drainage}
                onChange={(e) => {
                  const val = e.target.value as DrainageQuality;
                  setDrainage(val);
                  if (val === 'unknown') setDrainageProv('unknown');
                  else if (drainageProv === 'unknown') setDrainageProv('farmer_provided');
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
              >
                <option value="unknown">Unknown</option>
                <option value="well_drained">Well drained</option>
                <option value="moderately_drained">Moderately drained</option>
                <option value="poorly_drained">Slow / Poorly drained</option>
                <option value="waterlogging_prone">Prone to waterlogging</option>
              </select>
              {drainage !== 'unknown' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#64748B]">Source:</span>
                  <select
                    aria-label="Drainage source"
                    value={drainageProv}
                    onChange={(e) => setDrainageProv(e.target.value as DataProvenance)}
                    className="px-2 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                  >
                    <option value="farmer_provided">Farmer observation</option>
                    <option value="estimated">Estimated</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2 p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
              <label
                htmlFor="soil-ph"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
              >
                Soil pH (Optional, leave blank if unknown)
              </label>
              <input
                id="soil-ph"
                type="number"
                step="0.1"
                min="2.5"
                max="10.5"
                value={soilPh}
                onChange={(e) => {
                  setSoilPh(e.target.value);
                  if (e.target.value && soilPhProv === 'unknown') {
                    setSoilPhProv('farmer_provided');
                  }
                }}
                placeholder="e.g. 6.5"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
              />
              {soilPh.trim() !== '' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#64748B]">Source:</span>
                  <select
                    aria-label="Soil pH source"
                    value={soilPhProv}
                    onChange={(e) => setSoilPhProv(e.target.value as DataProvenance)}
                    className="px-2 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                  >
                    <option value="farmer_provided">Measured / Lab test</option>
                    <option value="estimated">Estimated</option>
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2 p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
              <label
                htmlFor="soil-om"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
              >
                Organic Matter % (Optional)
              </label>
              <input
                id="soil-om"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={organicMatter}
                onChange={(e) => {
                  setOrganicMatter(e.target.value);
                  if (e.target.value && organicMatterProv === 'unknown') {
                    setOrganicMatterProv('farmer_provided');
                  }
                }}
                placeholder="e.g. 2.4"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
              />
              {organicMatter.trim() !== '' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#64748B]">Source:</span>
                  <select
                    aria-label="Organic matter source"
                    value={organicMatterProv}
                    onChange={(e) => setOrganicMatterProv(e.target.value as DataProvenance)}
                    className="px-2 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                  >
                    <option value="farmer_provided">Measured / Lab test</option>
                    <option value="estimated">Estimated</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="soil-notes"
              className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
            >
              Field Soil Observations (Optional)
            </label>
            <textarea
              id="soil-notes"
              rows={3}
              value={soilObservations}
              onChange={(e) => setSoilObservations(e.target.value)}
              placeholder="e.g. Crusting after heavy rains, salinity patches near lower canal, rocky upper slope..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
            />
          </div>
        </section>
      )}

      {/* STEP 4: FARM HISTORY */}
      {step === 4 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div className="space-y-3">
            <label
              htmlFor="crop-search"
              className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
            >
              Previous Crop Grown * (Search international crops)
            </label>
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="crop-search"
                type="text"
                value={cropSearch}
                onChange={(e) => setCropSearch(e.target.value)}
                placeholder="Search maize, wheat, chickpea, cassava, rice..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto p-1">
              {filteredCrops.map((crop) => {
                const selected = previousCropId === crop.id;
                return (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => {
                      setPreviousCropId(crop.id);
                      setPreviousCropName(crop.name);
                    }}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                      selected
                        ? 'border-[#14532D] bg-[#14532D] text-white dark:border-[#16A34A] dark:bg-[#16A34A]'
                        : 'border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] hover:border-[#16A34A]'
                    }`}
                  >
                    <p className="font-semibold truncate">{crop.name}</p>
                    <p
                      className={`text-[11px] truncate ${
                        selected ? 'text-white/80' : 'text-[#64748B] dark:text-[#94A3B8]'
                      }`}
                    >
                      {crop.category}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-4 space-y-2">
            <p className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Earlier Crops Grown in Past 2–3 Seasons (Optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {GLOBAL_CROPS.slice(0, 14).map((crop) => {
                const active = earlierCrops.includes(crop.name);
                return (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() => toggleEarlierCrop(crop.name)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      active
                        ? 'border-[#14532D] bg-[#14532D]/10 text-[#14532D] dark:border-[#10B981] dark:text-[#10B981] font-medium'
                        : 'border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B] dark:text-[#94A3B8]'
                    }`}
                  >
                    {crop.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="planting-window"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Typical Planting Period (Optional)
              </label>
              <input
                id="planting-window"
                type="text"
                value={plantingWindow}
                onChange={(e) => setPlantingWindow(e.target.value)}
                placeholder="e.g. April–May or October–November"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>
            <div>
              <label
                htmlFor="harvest-window"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Typical Harvest Period (Optional)
              </label>
              <input
                id="harvest-window"
                type="text"
                value={harvestWindow}
                onChange={(e) => setHarvestWindow(e.target.value)}
                placeholder="e.g. August–September or March–April"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="rotation-challenges"
              className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
            >
              Known Rotation or Field Problems (Optional)
            </label>
            <textarea
              id="rotation-challenges"
              rows={2}
              value={rotationChallenges}
              onChange={(e) => setRotationChallenges(e.target.value)}
              placeholder="e.g. Striga weed buildup, root rot after consecutive cereal crops, mid-season dry spells..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
            />
          </div>
        </section>
      )}

      {/* STEP 5: PRIORITIES */}
      {step === 5 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Rank Your Farming Priorities
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Order what matters most for this farm. Every farm has different water, market, and soil needs.
            </p>
          </div>

          <div className="space-y-2.5">
            {priorities.map((id, idx) => {
              const info = PRIORITY_LABELS[id];
              return (
                <div
                  key={id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#14532D] dark:text-[#10B981] mt-0.5">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                        {info.title}
                      </p>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                        {info.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => movePriority(idx, -1)}
                      disabled={idx === 0}
                      aria-label={`Move ${info.title} up`}
                      className="p-1.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] disabled:opacity-40"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePriority(idx, 1)}
                      disabled={idx === priorities.length - 1}
                      aria-label={`Move ${info.title} down`}
                      className="p-1.5 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] disabled:opacity-40"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePriorityActive(id)}
                      disabled={priorities.length === 1}
                      className="ml-1 px-2.5 py-1 text-xs rounded border border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B] hover:text-[#DC2626] disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {(Object.keys(PRIORITY_LABELS) as FarmerPriorityId[])
            .filter((id) => !priorities.includes(id))
            .map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => togglePriorityActive(id)}
                className="px-3 py-1.5 text-xs rounded-lg border border-dashed border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B] hover:border-[#16A34A] hover:text-[#16A34A] mr-2"
              >
                + Add {PRIORITY_LABELS[id].title}
              </button>
            ))}
        </section>
      )}

      {/* STEP 6: REVIEW & SAVE */}
      {step === 6 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Review Farm Summary
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              This profile is saved in your browser&apos;s local storage so your farm stays accessible on this device without requiring an account.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Location & Geometry</h4>
              <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                {[locality, region, countryName].filter(Boolean).join(', ')}
              </p>
              <p className="text-xs font-mono tabular-nums text-[#64748B]">
                Lat {parsedLat?.toFixed(5)} · Lon {parsedLon?.toFixed(5)}
              </p>
              <p className="text-xs text-[#64748B]">
                Geometry: {geometryType === 'polygon' && polygonGeoJSON ? 'Field boundary polygon' : 'Single farm point'}
                {polygonEstimatedHectares ? ` (~${polygonEstimatedHectares.toFixed(2)} ha est.)` : ''}
              </p>
            </div>

            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Farm Profile</h4>
              <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">{farmName}</p>
              <p className="text-xs tabular-nums text-[#64748B]">
                Size:{' '}
                {areaHectaresPreview !== null
                  ? `${areaHectaresPreview.toFixed(2)} ha (${hectaresToAcres(areaHectaresPreview).toFixed(2)} ac)`
                  : 'Not specified'}
              </p>
              <p className="text-xs text-[#64748B]">
                Water: {waterAvailability.replace('_', ' ')} · Irrigation: {irrigationMethod.replace('_', ' ')}
              </p>
            </div>

            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Soil & Provenance</h4>
              <p className="text-xs text-[#172B22] dark:text-[#E8F1EC]">
                Texture: {soilTexture.replace('_', ' ')} ({soilTextureProv.replace('_', ' ')})
              </p>
              <p className="text-xs text-[#172B22] dark:text-[#E8F1EC]">
                pH: {soilPh.trim() ? `${soilPh} (${soilPhProv.replace('_', ' ')})` : 'Unknown'} · Drainage:{' '}
                {drainage.replace('_', ' ')}
              </p>
            </div>

            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Crop History & Top Priority</h4>
              <p className="text-xs text-[#172B22] dark:text-[#E8F1EC]">
                Previous crop: <span className="font-semibold">{previousCropName}</span>
              </p>
              <p className="text-xs text-[#64748B]">
                #1 Priority: {PRIORITY_LABELS[priorities[0]]?.title}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Navigation Footer */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={() => (step === 1 ? navigate('/dashboard/farms') : goToStep(step - 1))}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#172B22] dark:text-[#E8F1EC] hover:bg-[#F8FAF7] dark:hover:bg-[#182821] transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 1 ? 'Cancel' : 'Previous'}
        </button>

        {step < 6 ? (
          <button
            type="button"
            onClick={() => goToStep(step + 1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white transition-colors whitespace-nowrap"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSaveFarm}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#16A34A] hover:bg-[#15803D] text-white transition-colors whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            {isEdit ? 'Save Farm Changes' : 'Save Farm & Open Dashboard'}
          </button>
        )}
      </div>
    </div>
  );
}

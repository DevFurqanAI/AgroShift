import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Search,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Pentagon,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react';
import { COUNTRIES } from '../../data/countries';
import {
  buildCropCatalog,
  isEngineSupportedCropId,
  normalizeCropIdForBackend,
} from '../../data/crops';
import { useAgroShift } from '../../context/AgroShiftContext';
import { useRotationCrops } from '../../hooks/useRotationPlanner';
import {
  reverseGeocode,
  type PlaceSearchCandidate,
} from '../../services/geocoding/nominatimService';
import type {
  AreaSource,
  AreaUnit,
  DataProvenance,
  DrainageQuality,
  FarmerPriorityId,
  FarmProfile,
  FarmType,
  GeoJSONPolygon,
  IrrigationMethod,
  LocationResolutionStatus,
  LocationSource,
  RainfallReliability,
  SalinityConcern,
  SeasonCropEntry,
  SoilKnowledgeLevel,
  SoilTexture,
  WaterAvailability,
} from '../../types/farm';
import { mapPrioritiesToBackendGoal } from '../../types/planner';
import {
  acresToHectares,
  formatAreaInputValue,
  fromHectares,
  hectaresToAcres,
  toHectares,
} from '../../utils/units';
import { validateCoordinates } from '../../utils/validation';
import { GlobalFarmMap } from '../maps/GlobalFarmMap';

const STEPS = [
  { id: 1, title: 'Find your farm' },
  { id: 2, title: 'About your farm' },
  { id: 3, title: 'Crop history' },
  { id: 4, title: 'Soil information' },
  { id: 5, title: 'Farming priorities' },
  { id: 6, title: 'Review and save' },
];

const PRIORITY_LABELS: Record<
  FarmerPriorityId,
  { title: string; description: string; engineNote?: string }
> = {
  support_soil_health: {
    title: 'Support soil health',
    description: 'Improve organic residue, soil cover, and biological nitrogen cycling.',
  },
  climate_resilience: {
    title: 'Improve climate resilience',
    description: 'Buffer against heat stress, delayed rains, or extreme rainfall.',
  },
  reduce_water_demand: {
    title: 'Reduce water demand',
    description: 'Prefer lower-water crops and moisture-conserving crop sequences.',
  },
  maintain_productivity: {
    title: 'Maintain productivity',
    description: 'Protect stable staple and cash crop output across seasons.',
    engineNote: 'Saved in farm profile — not yet modeled by screening engine',
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
  const cropsQuery = useRotationCrops();
  const isEdit = Boolean(existingFarm);

  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);

  // Step 1: Authoritative Location
  const [countryCode, setCountryCode] = useState(existingFarm?.location.countryCode ?? '');
  const [countryName, setCountryName] = useState(existingFarm?.location.country ?? '');
  const [region, setRegion] = useState(existingFarm?.location.region ?? '');
  const [locality, setLocality] = useState(existingFarm?.location.locality ?? '');
  const [displayName, setDisplayName] = useState(existingFarm?.location.displayName ?? '');
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
  const [polygonEstimatedHectares, setPolygonEstimatedHectares] = useState<number | null>(
    existingFarm?.location.polygonEstimatedHectares ?? null
  );
  const [polygonValidationError, setPolygonValidationError] = useState<string | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>(
    existingFarm?.location.locationSource ?? 'map_click'
  );
  const [resolutionStatus, setResolutionStatus] = useState<LocationResolutionStatus>(
    existingFarm?.location.resolutionStatus ??
      (existingFarm?.location.country ? 'resolved' : 'unresolved')
  );
  const [userConfirmedCorrections, setUserConfirmedCorrections] = useState<boolean>(
    existingFarm?.location.userConfirmedCorrections ?? false
  );
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [addressLookupMessage, setAddressLookupMessage] = useState<string | null>(null);
  const [countryMismatchNote, setCountryMismatchNote] = useState<string | null>(null);

  const reverseAbortRef = useRef<AbortController | null>(null);

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

  // Step 2: About Your Farm
  const [farmName, setFarmName] = useState(existingFarm?.details.name ?? '');
  const [areaUnit, setAreaUnit] = useState<AreaUnit>(
    existingFarm?.details.preferredAreaUnit ?? settings.areaUnit
  );
  const [areaInput, setAreaInput] = useState(() => {
    if (!existingFarm) return '';
    return formatAreaInputValue(
      fromHectares(existingFarm.details.areaHectares, existingFarm.details.preferredAreaUnit)
    );
  });
  const [areaSource, setAreaSource] = useState<AreaSource>(
    existingFarm?.details.areaSource ?? 'manual'
  );
  const [farmType, setFarmType] = useState<FarmType>(
    existingFarm?.details.farmType ?? 'smallholder'
  );
  const [irrigationMethod, setIrrigationMethod] = useState<IrrigationMethod>(
    existingFarm?.details.irrigationMethod ?? 'rainfed_only'
  );
  const [waterAvailability, setWaterAvailability] = useState<WaterAvailability>(
    existingFarm?.details.waterAvailability ?? 'seasonal_adequate'
  );
  const [rainfallReliability, setRainfallReliability] = useState<RainfallReliability>(
    existingFarm?.details.rainfallReliability ?? 'unknown'
  );
  const [managedFieldsCount, setManagedFieldsCount] = useState(
    existingFarm?.details.managedFieldsCount
      ? String(existingFarm.details.managedFieldsCount)
      : ''
  );

  // Step 3: Crop History (ordered seasons, index 0 = most recent)
  const cropCatalog = useMemo(
    () => buildCropCatalog(cropsQuery.data?.crops, true),
    [cropsQuery.data?.crops]
  );

  const [seasons, setSeasons] = useState<SeasonCropEntry[]>(() => {
    if (existingFarm?.history.seasons && existingFarm.history.seasons.length > 0) {
      return existingFarm.history.seasons;
    }
    if (existingFarm?.history.previousCropName) {
      return [
        {
          id: 'season-1',
          cropId: normalizeCropIdForBackend(existingFarm.history.previousCropId || 'custom'),
          cropName: existingFarm.history.previousCropName,
          isCustomOther:
            !existingFarm.history.previousCropId ||
            existingFarm.history.previousCropId === 'custom',
          plantingDate: existingFarm.history.typicalPlantingWindow || '',
          harvestDate: existingFarm.history.typicalHarvestWindow || '',
        },
      ];
    }
    return [
      {
        id: 'season-1',
        cropId: '',
        cropName: '',
        isCustomOther: false,
        plantingDate: '',
        harvestDate: '',
      },
    ];
  });
  const [activeSeasonIndex, setActiveSeasonIndex] = useState(0);
  const [cropSearch, setCropSearch] = useState('');
  const [rotationChallenges, setRotationChallenges] = useState(
    existingFarm?.history.rotationChallenges ?? ''
  );

  // Step 4: Progressive Soil Information
  const [soilKnowledge, setSoilKnowledge] = useState<SoilKnowledgeLevel>(
    existingFarm?.soil.knowledgeLevel ??
      (existingFarm?.soil.hasLabSoilTest
        ? 'lab_test'
        : existingFarm &&
            (existingFarm.soil.texture !== 'unknown' ||
              existingFarm.soil.drainage !== 'unknown' ||
              existingFarm.soil.ph !== null ||
              Boolean(existingFarm.soil.observations))
          ? 'some_details'
          : 'unsure')
  );
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
  const [salinityConcern, setSalinityConcern] = useState<SalinityConcern>(
    existingFarm?.soil.salinityConcern ?? 'unknown'
  );
  const [soilObservations, setSoilObservations] = useState(
    existingFarm?.soil.observations ?? ''
  );

  // Step 5: Farming Priorities (ordered)
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
      return {
        valid: false,
        error: 'Select a location on the map, search a place, or enter latitude and longitude.',
      };
    }
    return validateCoordinates(parsedLat, parsedLon);
  }, [parsedLat, parsedLon]);

  const filteredCrops = useMemo(() => {
    const q = cropSearch.trim().toLowerCase();
    if (!q) return cropCatalog;
    return cropCatalog.filter(
      (crop) =>
        crop.name.toLowerCase().includes(q) ||
        crop.botanicalFamily.toLowerCase().includes(q) ||
        crop.category.toLowerCase().includes(q) ||
        crop.commonAliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [cropCatalog, cropSearch]);

  const triggerReverseLookup = async (
    lat: number,
    lon: number,
    source: LocationSource
  ) => {
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;

    setLocationSource(source);
    setUserConfirmedCorrections(false);
    setCountryMismatchNote(null);
    setAddressLookupMessage(null);
    setIsResolvingAddress(true);

    try {
      const resolved = await reverseGeocode(lat, lon, controller.signal);
      if (controller.signal.aborted) return;

      if (resolved.status === 'resolved') {
        setCountryName(resolved.country);
        setCountryCode(resolved.countryCode || 'OTHER');
        setRegion(resolved.region);
        setLocality(resolved.locality);
        setDisplayName(resolved.displayName);
        setResolutionStatus('resolved');
        setAddressLookupMessage(null);
      } else {
        // Clear previous stale place labels instead of keeping contradictory old country/region
        setCountryName('');
        setCountryCode('');
        setRegion('');
        setLocality('');
        setDisplayName('Address could not be determined.');
        setResolutionStatus('unresolved');
        setAddressLookupMessage(
          'Address could not be determined for these coordinates. You can enter country or locality details manually if needed.'
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) {
        setIsResolvingAddress(false);
      }
    }
  };

  const handleCountrySelect = (code: string) => {
    const match = COUNTRIES.find((c) => c.code === code);
    const countryChanged = code !== countryCode;
    setCountryCode(code);

    if (match) {
      const nextName = match.code === 'OTHER' ? '' : match.name;
      setCountryName(nextName);
      setMapFocus({
        lat: match.mapFocusLat,
        lon: match.mapFocusLon,
        zoom: match.code === 'OTHER' ? 2 : 5,
      });

      if (countryChanged) {
        const hadExistingLocation =
          Boolean(latInput || lonInput || polygonGeoJSON || region || locality);
        setLatInput('');
        setLonInput('');
        setRegion('');
        setLocality('');
        setDisplayName('');
        setGeometryType('point');
        setPolygonGeoJSON(null);
        setPolygonEstimatedHectares(null);
        setPolygonValidationError(null);
        setAddressLookupMessage(null);
        setUserConfirmedCorrections(false);
        setResolutionStatus('unresolved');

        if (hadExistingLocation) {
          setCountryMismatchNote(
            `Country changed to ${nextName || 'Global / Other'}. Previous coordinates and boundary were cleared—click on the map or search a place in ${
              nextName || 'your chosen country'
            } to set your farm location.`
          );
        } else {
          setCountryMismatchNote(null);
        }
      }
    }
  };

  const handleSearchCandidateSelect = (candidate: PlaceSearchCandidate) => {
    setLatInput(String(candidate.latitude));
    setLonInput(String(candidate.longitude));
    setGeometryType('point');
    setPolygonGeoJSON(null);
    setPolygonEstimatedHectares(null);
    setPolygonValidationError(null);
    setLocationSource('search');
    setUserConfirmedCorrections(false);
    setCountryMismatchNote(null);

    if (candidate.country) {
      setCountryName(candidate.country);
      setCountryCode(candidate.countryCode || 'OTHER');
      setRegion(candidate.region);
      setLocality(candidate.locality);
      setDisplayName(candidate.displayName);
      setResolutionStatus('resolved');
      setAddressLookupMessage(null);
    } else {
      triggerReverseLookup(candidate.latitude, candidate.longitude, 'search');
    }
  };

  const handleManualAddressEdit = (
    field: 'country' | 'region' | 'locality',
    value: string
  ) => {
    if (field === 'country') setCountryName(value);
    if (field === 'region') setRegion(value);
    if (field === 'locality') setLocality(value);
    setUserConfirmedCorrections(true);
    setResolutionStatus('manual_confirmed');
    setCountryMismatchNote(null);
  };

  const handleManualCoordResolve = () => {
    if (coordStatus.valid && parsedLat !== null && parsedLon !== null) {
      setMapFocus({ lat: parsedLat, lon: parsedLon, zoom: 13 });
      triggerReverseLookup(parsedLat, parsedLon, 'manual_coordinates');
    }
  };

  const handleUseBoundaryArea = () => {
    if (polygonEstimatedHectares === null) return;
    const val =
      areaUnit === 'acres'
        ? hectaresToAcres(polygonEstimatedHectares)
        : polygonEstimatedHectares;
    setAreaInput(formatAreaInputValue(val));
    setAreaSource('calculated_from_boundary');
  };

  const handleAreaUnitSwitch = (nextUnit: AreaUnit) => {
    if (nextUnit === areaUnit) return;
    const num = Number(areaInput);
    if (Number.isFinite(num) && num > 0) {
      const converted =
        nextUnit === 'acres' ? hectaresToAcres(num) : acresToHectares(num);
      setAreaInput(formatAreaInputValue(converted));
    }
    setAreaUnit(nextUnit);
  };

  const areaHectaresPreview = useMemo(() => {
    const num = Number(areaInput);
    if (!Number.isFinite(num) || num <= 0) return null;
    return toHectares(num, areaUnit);
  }, [areaInput, areaUnit]);

  const boundaryMismatchWarning = useMemo(() => {
    if (
      polygonEstimatedHectares === null ||
      areaHectaresPreview === null ||
      polygonEstimatedHectares <= 0
    ) {
      return null;
    }
    const diffRatio =
      Math.abs(areaHectaresPreview - polygonEstimatedHectares) /
      polygonEstimatedHectares;
    if (diffRatio > 0.25) {
      return `Entered cultivated area (${areaHectaresPreview.toFixed(
        2
      )} ha) differs noticeably from the drawn boundary (~${polygonEstimatedHectares.toFixed(
        2
      )} ha). This is fine if only part of the mapped parcel is cultivated.`;
    }
    return null;
  }, [areaHectaresPreview, polygonEstimatedHectares]);

  const smallholderAreaWarning = useMemo(() => {
    if (farmType === 'smallholder' && areaHectaresPreview !== null && areaHectaresPreview > 50) {
      return `You entered ${areaHectaresPreview.toFixed(
        1
      )} ha under Smallholder. Double-check whether your unit is hectares vs. acres, or select Commercial / Mixed if applicable.`;
    }
    return null;
  }, [farmType, areaHectaresPreview]);

  const handleSoilKnowledgeSelect = (level: SoilKnowledgeLevel) => {
    setSoilKnowledge(level);
    if (level === 'unsure') {
      setSoilTexture('unknown');
      setSoilTextureProv('unknown');
      setDrainage('unknown');
      setDrainageProv('unknown');
      setSoilPh('');
      setSoilPhProv('unknown');
      setOrganicMatter('');
      setOrganicMatterProv('unknown');
      setSalinityConcern('unknown');
    } else if (level === 'some_details') {
      if (soilTexture !== 'unknown' && soilTextureProv === 'unknown') {
        setSoilTextureProv('farmer_observation');
      }
      if (drainage !== 'unknown' && drainageProv === 'unknown') {
        setDrainageProv('farmer_observation');
      }
    } else if (level === 'lab_test') {
      if (soilPh && soilPhProv === 'unknown') setSoilPhProv('lab_test');
      if (organicMatter && organicMatterProv === 'unknown') setOrganicMatterProv('lab_test');
    }
  };

  const handleSelectCropForActiveSeason = (
    cropId: string,
    cropName: string,
    isCustomOther = false
  ) => {
    setSeasons((prev) =>
      prev.map((s, idx) =>
        idx === activeSeasonIndex
          ? {
              ...s,
              cropId,
              cropName: isCustomOther ? (s.isCustomOther ? s.cropName : '') : cropName,
              isCustomOther,
            }
          : s
      )
    );
  };

  const handleUpdateSeasonField = (
    index: number,
    patch: Partial<SeasonCropEntry>
  ) => {
    setSeasons((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, ...patch } : s))
    );
  };

  const handleAddSeason = () => {
    const newIndex = seasons.length;
    setSeasons((prev) => [
      ...prev,
      {
        id: `season-${Date.now()}-${prev.length + 1}`,
        cropId: '',
        cropName: '',
        isCustomOther: false,
        plantingDate: '',
        harvestDate: '',
      },
    ]);
    setActiveSeasonIndex(newIndex);
  };

  const handleRemoveSeason = (index: number) => {
    if (seasons.length <= 1) return;
    setSeasons((prev) => prev.filter((_, idx) => idx !== index));
    setActiveSeasonIndex((cur) => (cur >= index ? Math.max(0, cur - 1) : cur));
  };

  const moveSeason = (index: number, direction: -1 | 1) => {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= seasons.length) return;
    setSeasons((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
    setActiveSeasonIndex(nextIdx);
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
        if (prev.length === 1) return prev;
        return prev.filter((p) => p !== id);
      }
      return [...prev, id];
    });
  };

  const validateCurrentStep = (targetStep: number): boolean => {
    setStepError(null);

    if (step === 1 && targetStep > 1) {
      if (!coordStatus.valid) {
        setStepError(
          coordStatus.error ||
            'Please choose a farm location on the map or enter valid latitude and longitude.'
        );
        return false;
      }
      if (geometryType === 'polygon') {
        if (polygonValidationError) {
          setStepError(polygonValidationError);
          return false;
        }
        if (!polygonGeoJSON) {
          setStepError(
            'You selected boundary drawing mode. Draw at least 3 non-crossing corners or switch to Farm Point mode.'
          );
          return false;
        }
      }
      if (!countryName.trim() && resolutionStatus !== 'unresolved') {
        setStepError(
          'Please confirm a country/locality or click on the map so your farm location can be identified.'
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
        setStepError('Please enter a positive cultivated area.');
        return false;
      }
    }

    if (step === 3 && targetStep > 3) {
      const primarySeason = seasons[0];
      if (!primarySeason || !primarySeason.cropName.trim()) {
        setStepError('Please select or enter the most recent crop grown on this farm.');
        return false;
      }
    }

    if (step === 4 && targetStep > 4 && soilKnowledge !== 'unsure') {
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
      setStepError('Valid cultivated area is required.');
      return;
    }

    const cleanedSeasons = seasons.filter((s) => s.cropName.trim() !== '');
    const mostRecent = cleanedSeasons[0] ?? {
      id: 'season-1',
      cropId: 'custom',
      cropName: 'Unknown',
      isCustomOther: true,
    };

    const now = new Date().toISOString();
    const farm: FarmProfile = {
      id: existingFarm?.id ?? `farm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      location: {
        country: countryName.trim() || 'Unspecified',
        countryCode: countryCode || 'OTHER',
        region: region.trim(),
        locality: locality.trim(),
        displayName: displayName.trim() || undefined,
        latitude: Number(parsedLat.toFixed(6)),
        longitude: Number(parsedLon.toFixed(6)),
        geometryType: polygonGeoJSON && geometryType === 'polygon' ? 'polygon' : 'point',
        polygonGeoJSON: geometryType === 'polygon' ? polygonGeoJSON : null,
        polygonEstimatedHectares:
          geometryType === 'polygon' ? polygonEstimatedHectares : null,
        locationSource,
        resolutionStatus: countryName.trim()
          ? userConfirmedCorrections
            ? 'manual_confirmed'
            : resolutionStatus
          : 'unresolved',
        userConfirmedCorrections,
      },
      details: {
        name: farmName.trim(),
        areaHectares: toHectares(areaVal, areaUnit),
        areaSource,
        preferredAreaUnit: areaUnit,
        farmType,
        irrigationMethod,
        waterAvailability,
        rainfallReliability:
          irrigationMethod === 'rainfed_only' ? rainfallReliability : 'unknown',
        managedFieldsCount:
          managedFieldsCount.trim() && Number(managedFieldsCount) > 0
            ? Math.round(Number(managedFieldsCount))
            : null,
      },
      soil: {
        knowledgeLevel: soilKnowledge,
        texture: soilKnowledge === 'unsure' ? 'unknown' : soilTexture,
        textureProvenance:
          soilKnowledge === 'unsure' || soilTexture === 'unknown'
            ? 'unknown'
            : soilTextureProv,
        ph: soilKnowledge !== 'unsure' && soilPh.trim() ? Number(soilPh) : null,
        phProvenance:
          soilKnowledge !== 'unsure' && soilPh.trim() ? soilPhProv : 'unknown',
        drainage: soilKnowledge === 'unsure' ? 'unknown' : drainage,
        drainageProvenance:
          soilKnowledge === 'unsure' || drainage === 'unknown'
            ? 'unknown'
            : drainageProv,
        organicMatterPercent:
          soilKnowledge === 'lab_test' && organicMatter.trim()
            ? Number(organicMatter)
            : null,
        organicMatterProvenance:
          soilKnowledge === 'lab_test' && organicMatter.trim()
            ? organicMatterProv
            : 'unknown',
        salinityConcern: soilKnowledge === 'unsure' ? 'unknown' : salinityConcern,
        hasLabSoilTest: soilKnowledge === 'lab_test',
        observations: soilKnowledge === 'unsure' ? '' : soilObservations.trim(),
      },
      history: {
        seasons: cleanedSeasons.map((s) => ({
          ...s,
          cropId: normalizeCropIdForBackend(s.cropId || 'custom'),
          cropName: s.cropName.trim(),
          plantingDate: s.plantingDate?.trim() || undefined,
          harvestDate: s.harvestDate?.trim() || undefined,
        })),
        previousCropId: normalizeCropIdForBackend(mostRecent.cropId || 'custom'),
        previousCropName: mostRecent.cropName.trim(),
        earlierCrops: cleanedSeasons.slice(1).map((s) => s.cropName.trim()),
        typicalPlantingWindow: mostRecent.plantingDate?.trim() || '',
        typicalHarvestWindow: mostRecent.harvestDate?.trim() || '',
        rotationChallenges: rotationChallenges.trim(),
      },
      priorities,
      createdAt: existingFarm?.createdAt ?? now,
      updatedAt: now,
    };

    saveFarm(farm, isEdit);
    navigate('/dashboard');
  };

  const priorityMapping = useMemo(
    () => mapPrioritiesToBackendGoal(priorities),
    [priorities]
  );

  const activeSeason = seasons[activeSeasonIndex] ?? seasons[0];

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

      {/* STEP 1: FIND YOUR FARM */}
      {step === 1 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Locate Your Farm Anywhere in the World
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Search for your town, use your current device location, click directly on the map, or draw your field boundary. Country, region, and locality automatically stay synced to your selected coordinates.
            </p>
          </div>

          <GlobalFarmMap
            latitude={coordStatus.valid ? parsedLat : null}
            longitude={coordStatus.valid ? parsedLon : null}
            polygonGeoJSON={polygonGeoJSON}
            geometryType={geometryType}
            searchCountryCode={countryCode}
            focusTarget={mapFocus}
            onModeChange={(mode) => {
              setGeometryType(mode);
              if (mode === 'point') {
                setPolygonValidationError(null);
              }
            }}
            onPointChange={(lat, lon, source) => {
              setLatInput(String(lat));
              setLonInput(String(lon));
              setGeometryType('point');
              setPolygonGeoJSON(null);
              setPolygonEstimatedHectares(null);
              setPolygonValidationError(null);
              triggerReverseLookup(lat, lon, source);
            }}
            onSearchSelect={handleSearchCandidateSelect}
            onPolygonChange={(poly, estHa, repPoint, validationErr) => {
              setPolygonGeoJSON(poly);
              setPolygonEstimatedHectares(estHa);
              setPolygonValidationError(validationErr);
              if (poly && repPoint) {
                setLatInput(String(repPoint.lat));
                setLonInput(String(repPoint.lon));
                triggerReverseLookup(repPoint.lat, repPoint.lon, 'polygon');
              }
            }}
          />

          {/* Synchronized Resolved Address + Optional Country Filter / Correction */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                  Place Details (Synced with Selected Coordinates)
                </h4>
                {isResolvingAddress && (
                  <span className="inline-flex items-center gap-1 text-xs text-[#16A34A]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Looking up place details...
                  </span>
                )}
              </div>
              {userConfirmedCorrections && (
                <span className="text-[11px] font-medium text-[#16A34A]">
                  Address edited manually
                </span>
              )}
            </div>

            {addressLookupMessage && (
              <p className="text-xs text-[#D97706]">{addressLookupMessage}</p>
            )}

            {countryMismatchNote && (
              <p className="text-xs text-[#D97706]">{countryMismatchNote}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="farm-country"
                  className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
                >
                  Country (Filter map or confirm)
                </label>
                <select
                  id="farm-country"
                  value={COUNTRIES.some((c) => c.code === countryCode) ? countryCode : countryCode ? 'OTHER' : ''}
                  onChange={(e) => handleCountrySelect(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                >
                  <option value="">Auto-detected from map / filter...</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {(countryCode === 'OTHER' ||
                  (countryName && !COUNTRIES.some((c) => c.code === countryCode))) && (
                  <input
                    type="text"
                    value={countryName}
                    onChange={(e) => handleManualAddressEdit('country', e.target.value)}
                    placeholder="Country name"
                    className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
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
                  onChange={(e) => handleManualAddressEdit('region', e.target.value)}
                  placeholder="Detected from map or edit"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
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
                  onChange={(e) => handleManualAddressEdit('locality', e.target.value)}
                  placeholder="Detected from map or edit"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
            </div>
          </div>

          {/* Exact Coordinates */}
          <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                Authoritative Coordinates
              </h4>
              <span className="text-xs text-[#64748B] dark:text-[#94A3B8] inline-flex items-center gap-1.5">
                {geometryType === 'polygon' && polygonGeoJSON ? (
                  <>
                    <Pentagon className="w-3.5 h-3.5 text-[#16A34A]" />
                    Representative point inside field boundary
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
                    Single farm point
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
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
              <div className="sm:col-span-5">
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
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleManualCoordResolve}
                  disabled={!coordStatus.valid || isResolvingAddress}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] hover:border-[#16A34A] disabled:opacity-50 whitespace-nowrap"
                >
                  Sync Place
                </button>
              </div>
            </div>

            {!coordStatus.valid && (latInput !== '' || lonInput !== '') && (
              <p className="text-xs text-[#DC2626]">{coordStatus.error}</p>
            )}
          </div>
        </section>
      )}

      {/* STEP 2: ABOUT YOUR FARM */}
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
                  onChange={(e) => {
                    setAreaInput(e.target.value);
                    setAreaSource('manual');
                  }}
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
                  <span>Enter cultivated field area</span>
                )}
                {polygonEstimatedHectares !== null && (
                  <button
                    type="button"
                    onClick={handleUseBoundaryArea}
                    className="text-[#16A34A] hover:underline font-medium"
                  >
                    Use this estimated area (~{polygonEstimatedHectares.toFixed(2)} ha)
                  </button>
                )}
              </div>
              {boundaryMismatchWarning && (
                <p className="mt-1.5 text-xs text-[#D97706] flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{boundaryMismatchWarning}</span>
                </p>
              )}
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
              {smallholderAreaWarning && (
                <p className="mt-1.5 text-xs text-[#D97706] flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{smallholderAreaWarning}</span>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="irrigation-method"
                className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
              >
                Irrigation Method
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
                {irrigationMethod === 'rainfed_only'
                  ? 'Typical Moisture Availability During Season'
                  : 'Irrigation Water Supply Reliability'}
              </label>
              <select
                id="water-availability"
                value={waterAvailability}
                onChange={(e) => setWaterAvailability(e.target.value as WaterAvailability)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
              >
                <option value="abundant">Reliable / Abundant</option>
                <option value="seasonal_adequate">Adequate During Main Growing Season</option>
                <option value="limited">Limited / Rationed</option>
                <option value="scarce">Scarce / Drought-prone</option>
                <option value="unknown">Unsure / Varies Widely</option>
              </select>
            </div>

            {irrigationMethod === 'rainfed_only' ? (
              <div>
                <label
                  htmlFor="rainfall-reliability"
                  className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
                >
                  Seasonal Rainfall Pattern
                </label>
                <select
                  id="rainfall-reliability"
                  value={rainfallReliability}
                  onChange={(e) =>
                    setRainfallReliability(e.target.value as RainfallReliability)
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                >
                  <option value="unknown">Unsure / Not specified</option>
                  <option value="reliable">Usually sufficient and timely</option>
                  <option value="variable">Variable timing or mid-season gaps</option>
                  <option value="unreliable">Unreliable / frequent dry spells</option>
                </select>
              </div>
            ) : (
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
            )}
          </div>
        </section>
      )}

      {/* STEP 3: CROP HISTORY */}
      {step === 3 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                Ordered Crop History
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Start with the most recent crop grown (#1), then optionally add earlier seasons in reverse chronological order.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddSeason}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] hover:border-[#16A34A] whitespace-nowrap self-start"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Earlier Season
            </button>
          </div>

          {/* Season Sequence List */}
          <div className="space-y-3">
            {seasons.map((entry, idx) => {
              const isSelectedForEdit = idx === activeSeasonIndex;
              const unsupported =
                entry.cropName &&
                (entry.isCustomOther || !isEngineSupportedCropId(entry.cropId));

              return (
                <div
                  key={entry.id}
                  onClick={() => setActiveSeasonIndex(idx)}
                  className={`p-4 rounded-xl border transition-colors cursor-pointer space-y-3 ${
                    isSelectedForEdit
                      ? 'border-[#16A34A] bg-[#16A34A]/5'
                      : 'border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#14532D] dark:text-[#10B981]">
                        {idx === 0 ? 'Most Recent Season *' : `Earlier Season #${idx + 1}`}
                      </span>
                      <span className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                        {entry.cropName || 'Select crop below'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSeason(idx, -1);
                        }}
                        disabled={idx === 0}
                        aria-label="Move season earlier"
                        className="p-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] disabled:opacity-40"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSeason(idx, 1);
                        }}
                        disabled={idx === seasons.length - 1}
                        aria-label="Move season later"
                        className="p-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] disabled:opacity-40"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {seasons.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSeason(idx);
                          }}
                          aria-label="Remove season"
                          className="p-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#64748B] hover:text-[#DC2626]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {entry.isCustomOther && (
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Custom Crop Name *
                      </label>
                      <input
                        type="text"
                        value={entry.cropName}
                        onChange={(e) =>
                          handleUpdateSeasonField(idx, { cropName: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Enter crop name (e.g. Sesame, Mustard, Oats)"
                        className="w-full max-w-sm px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                      />
                    </div>
                  )}

                  {unsupported && (
                    <p className="text-[11px] text-[#D97706]">
                      Saved in your farm profile. Note: the automatic rotation screening engine currently supports 14 core crops, so you can select a supported reference crop in the planner when scoring rotations.
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#64748B] mb-1">
                        Approximate Planting Date / Month (Optional)
                      </label>
                      <input
                        type="text"
                        value={entry.plantingDate ?? ''}
                        onChange={(e) =>
                          handleUpdateSeasonField(idx, { plantingDate: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="e.g. Nov 2024 or April"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B] mb-1">
                        Approximate Harvest Date / Month (Optional)
                      </label>
                      <input
                        type="text"
                        value={entry.harvestDate ?? ''}
                        onChange={(e) =>
                          handleUpdateSeasonField(idx, { harvestDate: e.target.value })
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="e.g. Apr 2025 or August"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Crop Catalog Picker for Active Season */}
          <div className="border-t border-[#E2E8F0] dark:border-[#1E2E26] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="crop-search"
                className="text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
              >
                Choose Crop for{' '}
                {activeSeasonIndex === 0
                  ? 'Most Recent Season'
                  : `Earlier Season #${activeSeasonIndex + 1}`}
              </label>
              {cropsQuery.isError && (
                <span className="text-[11px] text-[#64748B]">
                  Showing standard offline crop list
                </span>
              )}
            </div>

            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="crop-search"
                type="text"
                value={cropSearch}
                onChange={(e) => setCropSearch(e.target.value)}
                placeholder="Search by crop, family, or alternate name (e.g. bajra, corn)..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310]"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-1">
              {filteredCrops.map((crop) => {
                const selected =
                  !activeSeason?.isCustomOther && activeSeason?.cropId === crop.id;
                return (
                  <button
                    key={crop.id}
                    type="button"
                    onClick={() =>
                      handleSelectCropForActiveSeason(crop.id, crop.name, false)
                    }
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
                      {crop.botanicalFamily}
                      {crop.commonAliases.length > 0
                        ? ` · ${crop.commonAliases.slice(0, 2).join(', ')}`
                        : ''}
                    </p>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => handleSelectCropForActiveSeason('custom', '', true)}
                className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                  activeSeason?.isCustomOther
                    ? 'border-[#14532D] bg-[#14532D] text-white dark:border-[#16A34A] dark:bg-[#16A34A]'
                    : 'border-dashed border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] hover:border-[#16A34A]'
                }`}
              >
                <p className="font-semibold">Other crop</p>
                <p
                  className={`text-[11px] ${
                    activeSeason?.isCustomOther
                      ? 'text-white/80'
                      : 'text-[#64748B] dark:text-[#94A3B8]'
                  }`}
                >
                  Enter custom crop name
                </p>
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="rotation-challenges"
              className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
            >
              Known Field or Rotation Challenges (Optional)
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

      {/* STEP 4: PROGRESSIVE SOIL INFORMATION */}
      {step === 4 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Do you know anything about your soil?
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Soil tests are optional. Share only what you actually know—AgroShift never guesses or invents soil pH or nutrient numbers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'lab_test' as SoilKnowledgeLevel,
                title: 'I have a soil test',
                desc: 'Enter measured soil pH, organic matter, texture, and drainage.',
              },
              {
                id: 'some_details' as SoilKnowledgeLevel,
                title: 'I know some details',
                desc: 'Share farmer observations like soil feel, drainage, or salinity.',
              },
              {
                id: 'unsure' as SoilKnowledgeLevel,
                title: "I'm not sure",
                desc: 'Skip soil measurements safely and rely on climate and crop history.',
              },
            ].map((option) => {
              const selected = soilKnowledge === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSoilKnowledgeSelect(option.id)}
                  className={`text-left p-4 rounded-xl border transition-colors space-y-1 ${
                    selected
                      ? 'border-[#14532D] bg-[#14532D]/5 dark:border-[#10B981] dark:bg-[#10B981]/10'
                      : 'border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] hover:border-[#16A34A]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                    {option.title}
                  </p>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">{option.desc}</p>
                </button>
              );
            })}
          </div>

          {soilKnowledge === 'unsure' && (
            <div className="rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] p-4 text-xs text-[#64748B] dark:text-[#94A3B8]">
              No problem—soil pH and texture will be recorded as unknown. Crop rotation screening will still work using your farm coordinates, climate history, and water availability without inventing soil values.
            </div>
          )}

          {soilKnowledge !== 'unsure' && (
            <div className="space-y-5">
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
                      else if (soilTextureProv === 'unknown') {
                        setSoilTextureProv(
                          soilKnowledge === 'lab_test' ? 'lab_test' : 'farmer_observation'
                        );
                      }
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
                        <option value="lab_test">Lab test</option>
                        <option value="farmer_observation">Farmer observation</option>
                        <option value="external_estimate">External estimate</option>
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
                      else if (drainageProv === 'unknown') {
                        setDrainageProv('farmer_observation');
                      }
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
                        <option value="farmer_observation">Farmer observation</option>
                        <option value="lab_test">Lab / survey report</option>
                        <option value="external_estimate">External estimate</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                  <label
                    htmlFor="soil-ph"
                    className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
                  >
                    Soil pH (Optional)
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
                        setSoilPhProv(
                          soilKnowledge === 'lab_test' ? 'lab_test' : 'farmer_observation'
                        );
                      }
                    }}
                    placeholder="e.g. 6.5 (leave blank if unknown)"
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
                        <option value="lab_test">Lab soil test</option>
                        <option value="farmer_observation">Field kit / observation</option>
                        <option value="external_estimate">External estimate</option>
                      </select>
                    </div>
                  )}
                </div>

                {soilKnowledge === 'lab_test' ? (
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
                          setOrganicMatterProv('lab_test');
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
                          onChange={(e) =>
                            setOrganicMatterProv(e.target.value as DataProvenance)
                          }
                          className="px-2 py-1 rounded border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                        >
                          <option value="lab_test">Lab soil test</option>
                          <option value="farmer_observation">Field observation</option>
                          <option value="external_estimate">External estimate</option>
                        </select>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]">
                    <label
                      htmlFor="soil-salinity"
                      className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC]"
                    >
                      Salinity / Salt Crusting Concern
                    </label>
                    <select
                      id="soil-salinity"
                      value={salinityConcern}
                      onChange={(e) => setSalinityConcern(e.target.value as SalinityConcern)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18]"
                    >
                      <option value="unknown">Unsure</option>
                      <option value="none">No salinity signs observed</option>
                      <option value="suspected">Suspected / white patches in spots</option>
                      <option value="confirmed">Confirmed salinity issue</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="soil-notes"
                  className="block text-xs font-semibold text-[#172B22] dark:text-[#E8F1EC] mb-1.5"
                >
                  Additional Soil Observations (Optional)
                </label>
                <textarea
                  id="soil-notes"
                  rows={2}
                  value={soilObservations}
                  onChange={(e) => setSoilObservations(e.target.value)}
                  placeholder="e.g. Crusting after heavy rains, compaction below plow layer, rocky upper slope..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* STEP 5: FARMING PRIORITIES */}
      {step === 5 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Rank Your Farming Priorities
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Put your highest priority at #1. Your top supported goal drives automatic rotation screening.
            </p>
          </div>

          {priorityMapping.unsupportedTopNotice && (
            <div className="rounded-lg border border-[#D97706]/40 bg-[#D97706]/5 p-3 text-xs text-[#172B22] dark:text-[#E8F1EC]">
              {priorityMapping.unsupportedTopNotice}
            </div>
          )}

          <div className="space-y-2.5">
            {priorities.map((id, idx) => {
              const info = PRIORITY_LABELS[id];
              const isEngineGoal = priorityMapping.activePriority === id;
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                          {info.title}
                        </p>
                        {isEngineGoal && (
                          <span className="text-[11px] font-medium text-[#16A34A]">
                            Active screening goal
                          </span>
                        )}
                        {info.engineNote && (
                          <span className="text-[11px] text-[#D97706]">
                            {info.engineNote}
                          </span>
                        )}
                      </div>
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

          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRIORITY_LABELS) as FarmerPriorityId[])
              .filter((id) => !priorities.includes(id))
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => togglePriorityActive(id)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-dashed border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B] hover:border-[#16A34A] hover:text-[#16A34A]"
                >
                  + Add {PRIORITY_LABELS[id].title}
                </button>
              ))}
          </div>
        </section>
      )}

      {/* STEP 6: REVIEW & SAVE */}
      {step === 6 && (
        <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
              Review and Save Farm
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              This profile is saved in your browser&apos;s local storage so your farm stays accessible on this device without requiring an account.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Location & Boundary</h4>
              <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                {[locality, region, countryName].filter(Boolean).join(', ') ||
                  'Coordinates saved (place name unresolved)'}
              </p>
              <p className="text-xs font-mono tabular-nums text-[#64748B]">
                Lat {parsedLat?.toFixed(5)} · Lon {parsedLon?.toFixed(5)}
              </p>
              <p className="text-xs text-[#64748B]">
                Geometry:{' '}
                {geometryType === 'polygon' && polygonGeoJSON
                  ? 'Field boundary polygon'
                  : 'Single farm point'}
                {polygonEstimatedHectares
                  ? ` (~${polygonEstimatedHectares.toFixed(2)} ha est.)`
                  : ''}
              </p>
            </div>

            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Farm Profile</h4>
              <p className="font-semibold text-[#172B22] dark:text-[#E8F1EC]">{farmName}</p>
              <p className="text-xs tabular-nums text-[#64748B]">
                Cultivated area:{' '}
                {areaHectaresPreview !== null
                  ? `${areaHectaresPreview.toFixed(2)} ha (${hectaresToAcres(
                      areaHectaresPreview
                    ).toFixed(2)} ac)`
                  : 'Not specified'}
                {areaSource === 'calculated_from_boundary' ? ' (from boundary)' : ''}
              </p>
              <p className="text-xs text-[#64748B] capitalize">
                Water: {waterAvailability.replace(/_/g, ' ')} · Method:{' '}
                {irrigationMethod.replace(/_/g, ' ')}
              </p>
            </div>

            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Ordered Crop History</h4>
              <ol className="space-y-1 text-xs text-[#172B22] dark:text-[#E8F1EC]">
                {seasons
                  .filter((s) => s.cropName.trim())
                  .map((s, i) => (
                    <li key={s.id}>
                      {i + 1}. <span className="font-semibold">{s.cropName}</span>
                      {s.plantingDate || s.harvestDate
                        ? ` (${[s.plantingDate, s.harvestDate].filter(Boolean).join(' → ')})`
                        : ''}
                    </li>
                  ))}
              </ol>
              <p className="text-xs text-[#64748B]">
                #1 Priority: {PRIORITY_LABELS[priorities[0]]?.title}
              </p>
            </div>

            <div className="p-4 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] space-y-2">
              <h4 className="text-xs font-semibold text-[#64748B]">Soil & Provenance</h4>
              {soilKnowledge === 'unsure' ? (
                <p className="text-xs text-[#64748B]">
                  Soil measurements not recorded (unknown). No values invented.
                </p>
              ) : (
                <>
                  <p className="text-xs text-[#172B22] dark:text-[#E8F1EC] capitalize">
                    Texture: {soilTexture.replace(/_/g, ' ')} (
                    {soilTextureProv.replace(/_/g, ' ')})
                  </p>
                  <p className="text-xs text-[#172B22] dark:text-[#E8F1EC]">
                    pH:{' '}
                    {soilPh.trim()
                      ? `${soilPh} (${soilPhProv.replace(/_/g, ' ')})`
                      : 'Not recorded'}{' '}
                    · Drainage: {drainage.replace(/_/g, ' ')}
                  </p>
                </>
              )}
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

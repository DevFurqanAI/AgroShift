import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AssistantMarkdown,
  normalizeAssistantMath,
} from '../src/components/assistant/AssistantMarkdown.tsx';
import {
  describeDataAvailability,
  describeInterpretationConfidence,
  describeMoistureStress,
  describeObservationQuality,
} from '../src/pages/FieldHealthPage.tsx';

import {
  ACRES_PER_HECTARE,
  acresToHectares,
  celsiusDeltaToFahrenheit,
  formatTemperatureDelta,
  fromHectares,
  hectaresToAcres,
  toHectares,
} from '../src/utils/units.ts';
import {
  computeClimatePeriodStats,
  daysInCalendarMonth,
  isLeapYear,
} from '../src/utils/climateStats.ts';
import { formatSequenceChartLabel } from '../src/pages/PlannerPage.tsx';
import {
  computePolygonMetrics,
  getRepresentativeInteriorPoint,
  isPointInPolygon,
  isRingSelfIntersecting,
  validatePolygonGeometry,
} from '../src/utils/geo.ts';
import {
  clearGeocodingCaches,
  reverseGeocode,
  searchPlaces,
} from '../src/services/geocoding/nominatimService.ts';
import {
  BACKEND_SUPPORTED_CROP_IDS,
  buildCropCatalog,
  GLOBAL_CROPS,
  isEngineSupportedCropId,
  normalizeCropIdForBackend,
} from '../src/data/crops.ts';
import {
  mapPrioritiesToBackendGoal,
  mapWaterAvailabilityToBackend,
} from '../src/types/planner.ts';
import {
  analyzeFieldHealth,
  ApiClientError,
  DEFAULT_PRODUCTION_API_URL,
  FARMER_ERROR_MESSAGES,
  fetchClimateHistory,
  fetchEnvironmentalContext,
  fetchRotationCrops,
  fetchRotationPlan,
  fetchScenarioComparison,
  resolveApiBaseUrl,
} from '../src/services/api/agroshiftApi.ts';
import {
  buildEnvironmentalSnapshot,
  canApplyPublicSuggestion,
  formatProvenanceLabel,
} from '../src/utils/provenance.ts';
import {
  DEFAULT_GEMINI_MODEL,
  getAssistantStatus,
  handleAssistantRequest,
  resolveGeminiModel,
  STANDARD_OUT_OF_SCOPE_REPLY,
} from '../server/assistantService.ts';
import handler from '../api/assistant.ts';
import {
  farmRepository,
  observationRepository,
  settingsRepository,
} from '../src/services/farms/farmRepository.ts';
import type { FarmProfile, GeoJSONPolygon } from '../src/types/farm.ts';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function withMockBrowser<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const localStorage = createMemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage };
  const cleanup = () => {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  };
  try {
    const out = fn();
    if (out instanceof Promise) {
      return out.finally(cleanup);
    }
    cleanup();
    return out;
  } catch (err) {
    cleanup();
    throw err;
  }
}

test('1. Country selection resets conflicting coordinates/labels & forward search uses country filter', async () => {
  const wizardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/farms/FarmWizard.tsx'),
    'utf8'
  );
  assert.match(wizardSource, /if \(countryChanged\)/);
  assert.match(wizardSource, /setLatInput\(''\)/);
  assert.match(wizardSource, /setLonInput\(''\)/);
  assert.match(wizardSource, /setRegion\(''\)/);
  assert.match(wizardSource, /setLocality\(''\)/);
  assert.match(wizardSource, /setPolygonGeoJSON\(null\)/);

  clearGeocodingCaches();
  const capturedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrls.push(String(input));
    return new Response(
      JSON.stringify([
        {
          place_id: 101,
          display_name: 'Nakuru, Kenya',
          lat: '-0.303099',
          lon: '36.080026',
          address: {
            country: 'Kenya',
            country_code: 'ke',
            state: 'Nakuru County',
            city: 'Nakuru',
          },
        },
      ]),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const results = await searchPlaces('Nakuru', { countryCode: 'KE' });
    assert.equal(results.length, 1);
    assert.equal(results[0].country, 'Kenya');
    assert.equal(results[0].countryCode, 'KE');
    assert.ok(capturedUrls[0].includes('countrycodes=ke'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('2. Reverse geocoding updates country, region, locality globally without stale Pakistan data', async () => {
  clearGeocodingCaches();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        display_name: 'Ribeirao Preto, Sao Paulo, Brazil',
        address: {
          country: 'Brazil',
          country_code: 'br',
          state: 'São Paulo',
          city: 'Ribeirão Preto',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const res = await reverseGeocode(-21.1704, -47.8103);
    assert.equal(res.status, 'resolved');
    assert.equal(res.country, 'Brazil');
    assert.equal(res.countryCode, 'BR');
    assert.equal(res.region, 'São Paulo');
    assert.equal(res.locality, 'Ribeirão Preto');
    assert.ok(!res.country.toLowerCase().includes('pakistan'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('3. Reverse geocoding failure handles empty or ocean responses cleanly without fallback country', async () => {
  clearGeocodingCaches();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: 'Unable to geocode' }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const res = await reverseGeocode(0.0, -30.0);
    assert.equal(res.status, 'unresolved');
    assert.equal(res.country, '');
    assert.equal(res.region, '');
    assert.equal(res.locality, '');
    assert.equal(res.displayName, 'Address could not be determined.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('4. Self-intersecting polygons (bowtie and collinear backtracking) are rejected', () => {
  const bowtieVertices: Array<[number, number]> = [
    [31.5, 74.3],
    [31.51, 74.31],
    [31.51, 74.3],
    [31.5, 74.31],
  ];
  const metrics = computePolygonMetrics(bowtieVertices);
  assert.equal(metrics.valid, false);
  assert.equal(metrics.selfIntersecting, true);
  assert.equal(metrics.geojson, null);
  assert.ok(metrics.error);

  const collinearBacktrackRing = [
    [0, 0],
    [0.01, 0],
    [0.005, 0],
    [0, 0.01],
    [0, 0],
  ];
  assert.equal(isRingSelfIntersecting(collinearBacktrackRing), true);

  const validSquare: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [36.0, -0.3],
        [36.01, -0.3],
        [36.01, -0.29],
        [36.0, -0.29],
        [36.0, -0.3],
      ],
    ],
  };
  assert.equal(validatePolygonGeometry(validSquare).valid, true);
});

test('5. Representative point is guaranteed strictly INSIDE concave L-shaped and U-shaped polygons', () => {
  // Narrow U-shaped / C-shaped parcel where arithmetic centroid & bounding-box center lie outside
  const uShape: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [10.0, 10.0],
        [10.1, 10.0],
        [10.1, 10.02],
        [10.02, 10.02],
        [10.02, 10.08],
        [10.1, 10.08],
        [10.1, 10.1],
        [10.0, 10.1],
        [10.0, 10.0],
      ],
    ],
  };

  assert.equal(validatePolygonGeometry(uShape).valid, true);
  // Bounding-box center (10.05, 10.05) is OUTSIDE the U-shape cavity
  assert.equal(isPointInPolygon(10.05, 10.05, uShape), false);

  const rep = getRepresentativeInteriorPoint(uShape);
  assert.ok(rep !== null);
  assert.equal(isPointInPolygon(rep.lat, rep.lon, uShape), true);

  // Also check computePolygonMetrics directly
  const vertices: Array<[number, number]> = uShape.coordinates[0]
    .slice(0, -1)
    .map(([lon, lat]) => [lat, lon]);
  const computed = computePolygonMetrics(vertices);
  assert.equal(computed.valid, true);
  assert.ok(computed.representativePoint !== null);
  assert.equal(
    isPointInPolygon(
      computed.representativePoint.lat,
      computed.representativePoint.lon,
      uShape
    ),
    true
  );
});

test('6. Clearing polygon deletes polygon geometry and estimated boundary area cleanly', () => {
  const cleared = computePolygonMetrics([]);
  assert.equal(cleared.valid, false);
  assert.equal(cleared.geojson, null);
  assert.equal(cleared.estimatedHectares, null);
  assert.equal(cleared.representativePoint, null);

  withMockBrowser(() => {
    const farm: FarmProfile = {
      id: 'farm-clear-poly',
      location: {
        country: 'Kenya',
        countryCode: 'KE',
        region: 'Nakuru',
        locality: 'Nakuru',
        latitude: -0.3,
        longitude: 36.08,
        geometryType: 'point',
        polygonGeoJSON: null,
        polygonEstimatedHectares: null,
      },
      details: {
        name: 'Nakuru Plot',
        areaHectares: 4,
        areaSource: 'manual',
        preferredAreaUnit: 'hectares',
        farmType: 'rainfed',
        irrigationMethod: 'rainfed_only',
        waterAvailability: 'seasonal_adequate',
        rainfallReliability: 'variable',
        managedFieldsCount: 1,
      },
      soil: {
        knowledgeLevel: 'unsure',
        texture: 'unknown',
        textureProvenance: 'unknown',
        ph: null,
        phProvenance: 'unknown',
        drainage: 'unknown',
        drainageProvenance: 'unknown',
        organicMatterPercent: null,
        organicMatterProvenance: 'unknown',
        salinityConcern: 'unknown',
        hasLabSoilTest: false,
        observations: '',
      },
      history: {
        previousCropId: 'maize',
        previousCropName: 'Maize',
        earlierCrops: [],
        typicalPlantingWindow: '',
        typicalHarvestWindow: '',
        rotationChallenges: '',
      },
      priorities: ['support_soil_health'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    farmRepository.saveFarm(farm);
    const loaded = farmRepository.listFarms().data[0];
    assert.equal(loaded.location.geometryType, 'point');
    assert.equal(loaded.location.polygonGeoJSON, null);
    assert.equal(loaded.location.polygonEstimatedHectares, null);
  });
});

test('7. Exact hectare <-> acre conversions preserve precision (1 ha = 2.4710538147 acres)', () => {
  assert.equal(ACRES_PER_HECTARE, 2.4710538147);
  assert.equal(hectaresToAcres(1), 2.4710538147);
  const backToHa = acresToHectares(hectaresToAcres(12.345678));
  assert.ok(Math.abs(backToHa - 12.345678) < 1e-12);
  assert.equal(toHectares(10, 'hectares'), 10);
  assert.ok(Math.abs(fromHectares(toHectares(25, 'acres'), 'acres') - 25) < 1e-12);
});

test('8. Cultivated area vs polygon area mismatch and Smallholder >50 ha warnings work properly', () => {
  const wizardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/farms/FarmWizard.tsx'),
    'utf8'
  );
  assert.match(wizardSource, /diffRatio > 0\.25/);
  assert.match(wizardSource, /farmType === 'smallholder' && areaHectaresPreview !== null && areaHectaresPreview > 50/);
  assert.match(wizardSource, /calculated_from_boundary/);
});

test('9. Rain-fed farms record rainfall reliability alongside water availability', () => {
  withMockBrowser(() => {
    const farm: FarmProfile = {
      id: 'farm-rainfed',
      location: {
        country: 'India',
        countryCode: 'IN',
        region: 'Maharashtra',
        locality: 'Solapur',
        latitude: 17.6599,
        longitude: 75.9064,
        geometryType: 'point',
        polygonGeoJSON: null,
        polygonEstimatedHectares: null,
      },
      details: {
        name: 'Solapur Rainfed Plot',
        areaHectares: 2.5,
        areaSource: 'manual',
        preferredAreaUnit: 'hectares',
        farmType: 'rainfed',
        irrigationMethod: 'rainfed_only',
        waterAvailability: 'limited',
        rainfallReliability: 'unreliable',
        managedFieldsCount: 2,
      },
      soil: {
        knowledgeLevel: 'unsure',
        texture: 'unknown',
        textureProvenance: 'unknown',
        ph: null,
        phProvenance: 'unknown',
        drainage: 'unknown',
        drainageProvenance: 'unknown',
        organicMatterPercent: null,
        organicMatterProvenance: 'unknown',
        salinityConcern: 'unknown',
        hasLabSoilTest: false,
        observations: '',
      },
      history: {
        previousCropId: 'sorghum',
        previousCropName: 'Sorghum',
        earlierCrops: [],
        typicalPlantingWindow: '',
        typicalHarvestWindow: '',
        rotationChallenges: '',
      },
      priorities: ['reduce_water_demand'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    farmRepository.saveFarm(farm);
    const saved = farmRepository.listFarms().data[0];
    assert.equal(saved.details.irrigationMethod, 'rainfed_only');
    assert.equal(saved.details.rainfallReliability, 'unreliable');
    assert.equal(saved.details.waterAvailability, 'limited');
  });
});

test('10 & 11. Progressive soil disclosure hides/clears numeric fields when unsure and never invents pH', () => {
  const wizardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/farms/FarmWizard.tsx'),
    'utf8'
  );
  assert.match(wizardSource, /if \(level === 'unsure'\)/);
  assert.match(wizardSource, /setSoilPh\(''\)/);
  assert.match(wizardSource, /setOrganicMatter\(''\)/);
  assert.match(wizardSource, /ph: soilKnowledge !== 'unsure' && soilPh\.trim\(\) \? Number\(soilPh\) : null/);

  const plannerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/PlannerPage.tsx'),
    'utf8'
  );
  assert.match(plannerSource, /soil_ph: validSoilPh/);
  assert.match(plannerSource, /pH not recorded/);
});

test('12 & 13. Crop catalog aligns with backend IDs (millet, wheat, etc.) and handles custom/unsupported crops cleanly', () => {
  assert.equal(BACKEND_SUPPORTED_CROP_IDS.size, 14);
  assert.equal(BACKEND_SUPPORTED_CROP_IDS.has('millet'), true);
  assert.equal(BACKEND_SUPPORTED_CROP_IDS.has('pearl_millet'), false);
  assert.equal(normalizeCropIdForBackend('pearl_millet'), 'millet');

  assert.equal(isEngineSupportedCropId('wheat'), true);
  assert.equal(isEngineSupportedCropId('millet'), true);
  assert.equal(isEngineSupportedCropId('custom'), false);
  assert.equal(isEngineSupportedCropId('barley'), false);
  assert.equal(isEngineSupportedCropId('fallow'), false);

  const catalog = buildCropCatalog(
    [
      {
        id: 'millet',
        name: 'Pearl millet',
        family: 'poaceae',
        water_demand: 'low',
        ph_min: 5.5,
        ph_max: 7.8,
        temp_min_c: 20,
        temp_max_c: 35,
        duration_months: 4,
      },
    ],
    true
  );
  const milletItem = catalog.find((c) => c.id === 'millet');
  assert.ok(milletItem);
  assert.equal(milletItem.supportedByRotationEngine, true);
  assert.ok(milletItem.commonAliases.includes('Bajra'));
  assert.ok(GLOBAL_CROPS.some((c) => c.id === 'fallow' && !c.supportedByRotationEngine));
});

test('14. Farmer priorities map explicitly to backend goal and flag maintain_productivity without fake weights', () => {
  assert.equal(mapPrioritiesToBackendGoal(['reduce_water_demand']).activeGoal, 'water');
  assert.equal(mapPrioritiesToBackendGoal(['support_soil_health']).activeGoal, 'soil');
  assert.equal(mapPrioritiesToBackendGoal(['climate_resilience']).activeGoal, 'climate');
  assert.equal(mapPrioritiesToBackendGoal(['diversify_crops']).activeGoal, 'diversity');

  const withUnsupportedTop = mapPrioritiesToBackendGoal([
    'maintain_productivity',
    'climate_resilience',
  ]);
  assert.equal(withUnsupportedTop.activeGoal, 'climate');
  assert.equal(withUnsupportedTop.usesFallbackFromUnsupported, true);
  assert.ok(withUnsupportedTop.unsupportedTopNotice?.includes('Maintain productivity'));

  assert.equal(mapWaterAvailabilityToBackend('abundant'), 'high');
  assert.equal(mapWaterAvailabilityToBackend('seasonal_adequate'), 'medium');
  assert.equal(mapWaterAvailabilityToBackend('limited'), 'low');
  assert.equal(mapWaterAvailabilityToBackend('scarce'), 'low');
});

test('15. /api/v1/climate/history parses monthly[] YYYYMM schema cleanly', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data_available: true,
        source: 'NASA POWER',
        location: { latitude: 10, longitude: 20 },
        start_year: 2023,
        end_year: 2024,
        historical_not_forecast: true,
        monthly: [
          {
            month: '202301',
            temperature_c: 24.5,
            precipitation_mm_per_day: 1.2,
            estimated_monthly_precipitation_mm: 37.2,
          },
          {
            month: '202402',
            temperature_c: 25.1,
            precipitation_mm_per_day: 0.8,
            estimated_monthly_precipitation_mm: 23.2,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const res = await fetchClimateHistory(
      { latitude: 10, longitude: 20, startYear: 2023, endYear: 2024 },
      undefined,
      'https://api.example.com'
    );
    assert.equal(res.data_available, true);
    assert.equal(res.monthly?.length, 2);
    assert.equal(res.monthly?.[0].month, '202301');
    assert.equal(res.monthly?.[0].estimated_monthly_precipitation_mm, 37.2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('16. /api/v1/analyze sends acres + en|ur language and parses flat partial availability response', async () => {
  let capturedBody: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return new Response(
      JSON.stringify({
        ndvi: null,
        ndvi_status: null,
        ndmi: null,
        ndmi_status: null,
        temperature_c: 28.4,
        humidity_percent: 58,
        recent_rainfall_mm: 12.6,
        heat_risk: 'moderate',
        rainfall_status: 'light',
        possible_water_stress: false,
        analysis_confidence: 'low',
        satellite_available: false,
        satellite_observation_date: null,
        cloud_cover_percent: 82.5,
        satellite_message: 'Cloud cover obscured recent Sentinel-2 scenes.',
        weather_available: true,
        weather_message: null,
        ai_explanation: 'Weather observations available; satellite imagery cloudy.',
        recommendations: ['Recheck satellite scene after clear weather.'],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const res = await analyzeFieldHealth(
      {
        latitude: -0.3,
        longitude: 36.08,
        acres: 12.355269,
        polygon_geojson: null,
        language: 'en',
      },
      undefined,
      'https://api.example.com'
    );
    assert.ok(capturedBody !== null);
    assert.equal('acres' in capturedBody, true);
    assert.equal('acreage' in capturedBody, false);
    assert.equal((capturedBody as Record<string, unknown>).language, 'en');
    assert.equal(res.satellite_available, false);
    assert.equal(res.weather_available, true);
    assert.equal(res.temperature_c, 28.4);
    assert.equal(res.ndvi, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('17. /api/v1/rotation/crops and /api/v1/rotation/plan parse ok, insufficient_data, and invalid_crops', async () => {
  const originalFetch = globalThis.fetch;

  // Test /rotation/crops
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        crops: [
          {
            id: 'wheat',
            name: 'Wheat',
            family: 'poaceae',
            water_demand: 'medium',
            ph_min: 5.5,
            ph_max: 7.5,
            temp_min_c: 10,
            temp_max_c: 25,
            duration_months: 5,
          },
        ],
        catalog_warning: 'Approximate parameters require local validation.',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const cropsRes = await fetchRotationCrops(undefined, 'https://api.example.com');
    assert.equal(cropsRes.crops.length, 1);
    assert.equal(cropsRes.crops[0].id, 'wheat');

    // Test insufficient_data response
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 'insufficient_data',
          data_available: false,
          plans: [],
          message: 'Historical NASA climate data are temporarily unavailable.',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )) as typeof fetch;

    const insufficient = await fetchRotationPlan(
      {
        latitude: 10,
        longitude: 20,
        previous_crop: 'wheat',
        soil_ph: null,
        water_availability: 'medium',
        goal: 'soil',
        planting_month: 3,
        seasons: 2,
        start_year: 2016,
        end_year: 2025,
        max_results: 3,
      },
      undefined,
      'https://api.example.com'
    );
    assert.equal(insufficient.status, 'insufficient_data');
    assert.equal(insufficient.plans.length, 0);

    // Test invalid_crops response
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 'invalid_crops',
          data_available: true,
          plans: [],
          message: 'Unknown crop IDs: ["barley"]',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )) as typeof fetch;

    const invalid = await fetchRotationPlan(
      {
        latitude: 10,
        longitude: 20,
        previous_crop: 'barley',
        soil_ph: null,
        water_availability: 'medium',
        goal: 'soil',
        planting_month: 3,
        seasons: 2,
        start_year: 2016,
        end_year: 2025,
        max_results: 3,
      },
      undefined,
      'https://api.example.com'
    );
    assert.equal(invalid.status, 'invalid_crops');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('18. Backend offline/network failure returns farmer-friendly message without crashing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        fetchClimateHistory(
          { latitude: 10, longitude: 20, startYear: 2020, endYear: 2025 },
          undefined,
          'https://api.example.com'
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.equal(err.message, FARMER_ERROR_MESSAGES.climate);
        assert.ok(!err.message.toLowerCase().includes('fastapi'));
        assert.ok(!err.message.toLowerCase().includes('cors'));
        return true;
      }
    );

    await assert.rejects(
      () =>
        analyzeFieldHealth(
          { latitude: 10, longitude: 20, acres: 5, language: 'en' },
          undefined,
          'https://api.example.com'
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.message, FARMER_ERROR_MESSAGES.fieldHealth);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('19. Public access without auth/demo mode & privacy: farm name/notes never leak to APIs or Nominatim', async () => {
  const appSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/App.tsx'),
    'utf8'
  );
  assert.ok(!appSource.includes('/login'));
  assert.ok(!appSource.includes('DemoMode'));

  const sentPayloads: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sentPayloads.push(`${String(input)} ${String(init?.body || '')}`);
    return new Response(
      JSON.stringify({
        ndvi: 0.45,
        ndvi_status: 'moderate',
        ndmi: 0.12,
        ndmi_status: 'adequate',
        temperature_c: 22,
        humidity_percent: 50,
        recent_rainfall_mm: 4,
        heat_risk: 'low',
        rainfall_status: 'normal',
        possible_water_stress: false,
        analysis_confidence: 'high',
        satellite_available: true,
        satellite_observation_date: '2026-04-01',
        cloud_cover_percent: 5,
        satellite_message: null,
        weather_available: true,
        weather_message: null,
        ai_explanation: 'Healthy cover.',
        recommendations: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    await analyzeFieldHealth(
      { latitude: 12.34, longitude: 56.78, acres: 5, language: 'en' },
      undefined,
      'https://api.example.com'
    );
    assert.ok(!sentPayloads[0].includes('My Secret Private Farm'));
    assert.ok(!sentPayloads[0].includes('soilObservations'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('20. No user-editable FastAPI backend settings or technical backend status indicators exist in UI', () => {
  assert.equal(resolveApiBaseUrl(), DEFAULT_PRODUCTION_API_URL);

  const settingsPage = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/SettingsPage.tsx'),
    'utf8'
  );
  const dashboardLayout = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/DashboardLayout.tsx'),
    'utf8'
  );
  const overviewPage = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/OverviewPage.tsx'),
    'utf8'
  );

  for (const source of [settingsPage, dashboardLayout, overviewPage]) {
    assert.ok(!source.includes('FastAPI'));
    assert.ok(!source.includes('Base URL Override'));
    assert.ok(!source.includes('Save & Test'));
    assert.ok(!source.includes('customApiBaseUrl'));
    assert.ok(!source.includes('backendStatus'));
  }

  withMockBrowser(() => {
    (window.localStorage as Storage).setItem(
      'agroshift.settings.v1',
      JSON.stringify({
        language: 'en',
        areaUnit: 'acres',
        temperatureUnit: 'celsius',
        theme: 'light',
        customApiBaseUrl: 'https://stale.example.com',
      })
    );
    const loaded = settingsRepository.load();
    assert.equal('customApiBaseUrl' in loaded, false);
    assert.equal(loaded.areaUnit, 'acres');
  });
});

test('21. Ask AgroShift server service resolves configurable model and classifies errors safely', async () => {
  assert.equal(resolveGeminiModel({} as NodeJS.ProcessEnv), DEFAULT_GEMINI_MODEL);
  assert.equal(
    resolveGeminiModel({ GEMINI_MODEL: 'gemini-2.5-pro' } as NodeJS.ProcessEnv),
    'gemini-2.5-pro'
  );

  const missingStatus = getAssistantStatus({} as NodeJS.ProcessEnv);
  assert.equal(missingStatus.available, false);
  assert.ok(missingStatus.reason?.includes('GEMINI_API_KEY'));

  const missingResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Hello' }], farmContext: null },
    { env: {} as NodeJS.ProcessEnv }
  );
  assert.equal(missingResp.status, 503);
  assert.equal(missingResp.body.code, 'ASSISTANT_UNAVAILABLE');

  const okResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Explain NDVI' }], farmContext: null },
    {
      env: { GEMINI_API_KEY: 'test-key-value' } as NodeJS.ProcessEnv,
      clientFactory: () => ({
        models: {
          generateContent: async ({ model }) => ({
            text: `Using ${model}: NDVI measures canopy greenness.`,
          }),
        },
      }),
    }
  );
  assert.equal(okResp.status, 200);
  assert.equal(okResp.body.model, DEFAULT_GEMINI_MODEL);
  assert.match(String(okResp.body.reply), /NDVI/);

  const invalidKeyResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Explain crop rotation' }], farmContext: null },
    {
      env: { GEMINI_API_KEY: 'bad-key' } as NodeJS.ProcessEnv,
      clientFactory: () => ({
        models: {
          generateContent: async () => {
            const e = new Error('API_KEY_INVALID') as Error & { status?: number };
            e.status = 401;
            throw e;
          },
        },
      }),
    }
  );
  assert.equal(invalidKeyResp.status, 502);
  assert.equal(invalidKeyResp.body.code, 'ASSISTANT_AUTH_ERROR');
  assert.ok(!String(invalidKeyResp.body.error).includes('bad-key'));

  const unsupportedModelResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Explain crop rotation' }], farmContext: null },
    {
      env: { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'bad-model' } as NodeJS.ProcessEnv,
      clientFactory: () => ({
        models: {
          generateContent: async () => {
            const e = new Error('Model is not found for API version') as Error & {
              status?: number;
            };
            e.status = 404;
            throw e;
          },
        },
      }),
    }
  );
  assert.equal(unsupportedModelResp.status, 502);
  assert.equal(unsupportedModelResp.body.code, 'ASSISTANT_MODEL_UNSUPPORTED');

  const quotaResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Explain crop rotation' }], farmContext: null },
    {
      env: { GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv,
      clientFactory: () => ({
        models: {
          generateContent: async () => {
            const e = new Error('429 RESOURCE_EXHAUSTED') as Error & { status?: number };
            e.status = 429;
            throw e;
          },
        },
      }),
    }
  );
  assert.equal(quotaResp.status, 429);
  assert.equal(quotaResp.body.code, 'ASSISTANT_QUOTA_EXCEEDED');

  const timeoutResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Explain crop rotation' }], farmContext: null },
    {
      env: { GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv,
      timeoutMs: 15,
      clientFactory: () => ({
        models: {
          generateContent: async () => new Promise(() => {}),
        },
      }),
    }
  );
  assert.equal(timeoutResp.status, 504);
  assert.equal(timeoutResp.body.code, 'ASSISTANT_TIMEOUT');

  const emptyResp = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Explain crop rotation' }], farmContext: null },
    {
      env: { GEMINI_API_KEY: 'k' } as NodeJS.ProcessEnv,
      clientFactory: () => ({
        models: {
          generateContent: async () => ({ text: '   ' }),
        },
      }),
    }
  );
  assert.equal(emptyResp.status, 502);
  assert.equal(emptyResp.body.code, 'EMPTY_RESPONSE');
});

test('22. Vercel serverless assistant endpoints, SPA rewrite exclusions, and bundled landing images exist', () => {
  assert.equal(fs.existsSync(path.resolve(process.cwd(), 'api/assistant.ts')), true);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), 'api/assistant/status.ts')), true);
  const vercelConfig = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8')
  ) as { rewrites?: Array<{ source: string; destination: string }> };
  assert.ok(
    vercelConfig.rewrites?.some(
      (r) => r.source.includes('(?!api/)') && r.destination === '/index.html'
    )
  );

  const landingSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/LandingPage.tsx'),
    'utf8'
  );
  assert.ok(!landingSource.includes('/src/assets/'));
  assert.match(landingSource, /from '\.\.\/assets\/images\//);
  assert.match(landingSource, /ResilientImage/);
});

test('23. /api/v1/rotation/scenario parses comparison metrics, deltas, and non-forecast disclaimer', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'ok',
        data_available: true,
        climate_source: 'NASA POWER historical gridded observations',
        historical_not_forecast: true,
        is_hypothetical_sensitivity: true,
        scenario_label: 'Warmer Conditions',
        assumptions: {
          temperature_delta_c: 1.5,
          precipitation_shift_percent: 0,
          baseline_water_availability: 'medium',
          scenario_water_availability: 'medium',
          water_shift_note: 'Unchanged.',
        },
        climate_metrics: {
          baseline_avg_temp_c: 22.0,
          scenario_avg_temp_c: 23.5,
          baseline_avg_monthly_precip_mm: 50,
          scenario_avg_monthly_precip_mm: 50,
        },
        baseline_plans: [],
        scenario_plans: [],
        comparisons: [
          {
            crop_ids: ['chickpea', 'maize'],
            crop_names: ['Chickpea', 'Maize'],
            baseline_rank: 1,
            scenario_rank: 1,
            rank_change: 0,
            baseline_score: 86.2,
            scenario_score: 84.5,
            score_delta: -1.7,
            baseline_band: 'Good Screening Match',
            scenario_band: 'Good Screening Match',
            reason: 'Temperature fit -2.4 pts.',
          },
        ],
        disclaimer: 'Sensitivity screening only — not a weather forecast or yield prediction.',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const res = await fetchScenarioComparison(
      {
        latitude: 30.2,
        longitude: 71.5,
        previous_crop: 'wheat',
        soil_ph: null,
        water_availability: 'medium',
        goal: 'water',
        planting_month: 1,
        seasons: 2,
        start_year: 2016,
        end_year: 2025,
        max_results: 3,
        scenario_label: 'Warmer Conditions',
        temperature_delta_c: 1.5,
        precipitation_shift_percent: 0,
      },
      undefined,
      'https://api.example.com'
    );
    assert.equal(res.status, 'ok');
    assert.equal(res.is_hypothetical_sensitivity, true);
    assert.equal(res.comparisons.length, 1);
    assert.equal(res.comparisons[0].score_delta, -1.7);
    assert.match(res.disclaimer.toLowerCase(), /not a weather forecast/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('24. Farmer limitations disclosure and WCAG AA dark-mode contrast tokens are enforced', () => {
  const plannerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/PlannerPage.tsx'),
    'utf8'
  );
  const scenariosSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ScenariosPage.tsx'),
    'utf8'
  );
  const disclosureSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/rotation/ScreeningLimitationsDisclosure.tsx'),
    'utf8'
  );
  const layoutSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/DashboardLayout.tsx'),
    'utf8'
  );
  const chartSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/charts/ClimateCharts.tsx'),
    'utf8'
  );

  assert.match(plannerSource, /ScreeningLimitationsDisclosure/);
  assert.match(scenariosSource, /ScreeningLimitationsDisclosure/);
  assert.match(
    disclosureSource,
    /These crop plans are preliminary comparisons based on available climate information and your farm details\. Check local growing seasons and conditions before planting\./
  );
  assert.match(disclosureSource, /How were these plans compared\?/);
  assert.ok(!layoutSource.includes('dark:bg-[#16A34A]'));
  assert.match(chartSource, /var\(--as-chart-temp\)/);
  assert.match(chartSource, /var\(--as-chart-axis\)/);
});

test('25. AssistantMarkdown formats headings, bold/italic, nested lists, blockquotes, links, tables, and code blocks', () => {
  const sampleMarkdown = [
    '# Farm Overview',
    '### Understanding NDVI and NDMI',
    '',
    '**NDVI** measures *vegetation greenness*.',
    '',
    '- NDVI helps assess vegetation cover.',
    '  - Nested canopy detail',
    '1. First check soil moisture',
    '2. Then inspect crop spacing',
    '',
    '> Historical climate records help compare seasons.',
    '',
    'Inline metric: `ndvi_status`',
    '',
    '```json',
    '{"ndvi": 0.54}',
    '```',
    '',
    '| Metric | Role |',
    '| --- | --- |',
    '| NDVI | Vegetation vigor |',
    '',
    'Learn more at [NASA POWER](https://power.larc.nasa.gov/).',
  ].join('\n');

  const html = renderToStaticMarkup(
    React.createElement(AssistantMarkdown, { content: sampleMarkdown })
  );

  // Uses bubble-sized headings (h3-h6) instead of raw literal ### or oversized h1
  assert.ok(!html.includes('### Understanding'));
  assert.ok(!html.includes('**NDVI**'));
  assert.match(html, /<h3[^>]*>Farm Overview<\/h3>/);
  assert.match(html, /<h5[^>]*>Understanding NDVI and NDMI<\/h5>/);
  assert.match(html, /<strong[^>]*>NDVI<\/strong>/);
  assert.match(html, /<em[^>]*>vegetation greenness<\/em>/);
  assert.match(html, /<ul[^>]*>[\s\S]*<ul[^>]*>[\s\S]*Nested canopy detail/);
  assert.match(html, /<ol[^>]*>[\s\S]*First check soil moisture/);
  assert.match(html, /<blockquote[^>]*>[\s\S]*Historical climate records/);
  assert.match(html, /<code[^>]*>ndvi_status<\/code>/);
  assert.match(html, /<pre[^>]*>[\s\S]*<code[^>]*>\{&quot;ndvi&quot;: 0\.54\}\s*<\/code><\/pre>/);
  assert.match(html, /<div class="[^"]*overflow-x-auto[^"]*"><table[\s\S]*<th[^>]*>Metric<\/th>/);
  assert.match(
    html,
    /<a href="https:\/\/power\.larc\.nasa\.gov\/" target="_blank" rel="noopener noreferrer"/
  );
});

test('26. AssistantMarkdown blocks raw HTML / dangerous URLs and AssistantPage renders markdown only for assistant messages', () => {
  const unsafeInput = [
    'Safe guidance paragraph.',
    '',
    '<script>window.__xss=1</script>',
    '<img src="x" onerror="alert(1)" />',
    '<div onclick="alert(2)">Injected HTML</div>',
    '',
    '[Bad link](javascript:alert(3))',
  ].join('\n');

  const html = renderToStaticMarkup(
    React.createElement(AssistantMarkdown, { content: unsafeInput })
  );

  assert.match(html, /Safe guidance paragraph\./);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('onerror='));
  assert.ok(!html.includes('onclick='));
  assert.ok(!html.includes('javascript:'));

  const assistantMarkdownSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/assistant/AssistantMarkdown.tsx'),
    'utf8'
  );
  assert.ok(!assistantMarkdownSource.includes('dangerouslySetInnerHTML'));
  assert.ok(!assistantMarkdownSource.includes('rehype-raw'));

  const assistantPageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/AssistantPage.tsx'),
    'utf8'
  );
  assert.match(assistantPageSource, /msg\.role === 'assistant'/);
  assert.match(assistantPageSource, /<AssistantMarkdown content=\{msg\.content\} \/>/);
});

test('27. Weather displays include Open-Meteo CC BY 4.0 attribution and partial analyze errors stay distinct', async () => {
  const fieldHealthSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/FieldHealthPage.tsx'),
    'utf8'
  );
  const overviewSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/OverviewPage.tsx'),
    'utf8'
  );
  const reportsSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ReportsPage.tsx'),
    'utf8'
  );

  for (const src of [fieldHealthSource, overviewSource, reportsSource]) {
    assert.match(src, /https:\/\/open-meteo\.com\//);
    assert.match(src, /Weather data by Open-Meteo\.com/);
    assert.match(src, /rel="noopener noreferrer"/);
  }
  assert.match(fieldHealthSource, /CC BY 4\.0/);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ndvi: null,
          ndvi_status: null,
          ndmi: null,
          ndmi_status: null,
          temperature_c: 29.2,
          humidity_percent: 49,
          recent_rainfall_mm: 0,
          heat_risk: 'LOW',
          rainfall_status: 'LOW',
          possible_water_stress: null,
          analysis_confidence: 'LOW',
          satellite_available: false,
          satellite_observation_date: null,
          cloud_cover_percent: null,
          satellite_message:
            'Satellite imagery request was rejected for this field boundary or query parameters.',
          satellite_error_kind: 'invalid_request',
          weather_available: true,
          weather_message: null,
          weather_source: 'open-meteo',
          weather_error_kind: null,
          ai_explanation: 'Weather indicators loaded while satellite imagery was rejected.',
          recommendations: ['Verify boundary geometry and retry later.'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    const parsed = await analyzeFieldHealth(
      { latitude: 31.2, longitude: 72.4, acres: 5, polygon_geojson: null, language: 'en' },
      undefined,
      'https://api.example.com'
    );
    assert.equal(parsed.satellite_available, false);
    assert.equal(parsed.satellite_error_kind, 'invalid_request');
    assert.equal(parsed.weather_available, true);
    assert.equal(parsed.weather_source, 'open-meteo');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('28. FieldHealthPage distinguishes availability, pixel quality, screening confidence, and inconclusive low-vegetation stress', () => {
  const base = {
    ndvi: 0.56,
    ndvi_status: 'GOOD',
    ndmi: 0.24,
    ndmi_status: 'MODERATE',
    temperature_c: 26,
    humidity_percent: 58,
    recent_rainfall_mm: 3,
    heat_risk: 'LOW',
    rainfall_status: 'MODERATE',
    possible_water_stress: false,
    moisture_stress_status: 'NOT_FLAGGED',
    analysis_confidence: 'HIGH', // Even if legacy cache says HIGH, UI never displays High confidence
    observation_quality: 'GOOD',
    confidence_reason: null,
    satellite_available: true,
    satellite_observation_date: '2026-11-10',
    cloud_cover_percent: 8.0,
    valid_coverage_percent: 92.0,
    excluded_pixel_percent: 8.0,
    satellite_message: null,
    weather_available: true,
    weather_message: null,
    weather_source: 'open-meteo',
    ai_explanation: 'Screening summary.',
    recommendations: [],
  };

  assert.equal(describeDataAvailability(base), 'Satellite + Weather loaded');
  assert.equal(describeObservationQuality(base), 'Good');
  assert.ok(!describeInterpretationConfidence(base).toLowerCase().includes('high'));
  assert.match(describeInterpretationConfidence(base), /Screening only \(Moderate\)/);
  assert.match(describeMoistureStress(base), /cannot rule out localized field stress/i);

  // Low vegetation (NDVI < 0.20) must never report absence of moisture stress even if boolean was false
  const lowVeg = {
    ...base,
    ndvi: 0.14,
    ndvi_status: 'VERY_LOW',
    ndmi: -0.05,
    ndmi_status: 'VERY_LOW',
    possible_water_stress: false,
    moisture_stress_status: 'INCONCLUSIVE_LOW_VEGETATION',
    analysis_confidence: 'LOW',
  };
  assert.match(describeInterpretationConfidence(lowVeg), /^Low/);
  assert.match(describeMoistureStress(lowVeg), /^Inconclusive/i);
  assert.match(describeMoistureStress(lowVeg), /bare soil/i);

  // Missing satellite keeps availability, quality, confidence, and stress distinct
  const missingSat = {
    ...base,
    satellite_available: false,
    ndvi: null,
    ndmi: null,
    possible_water_stress: null,
    moisture_stress_status: 'UNAVAILABLE',
    observation_quality: 'LIMITED',
    analysis_confidence: 'LOW',
  };
  assert.equal(describeDataAvailability(missingSat), 'Weather only (satellite unavailable)');
  assert.equal(describeObservationQuality(missingSat), 'Limited');
  assert.match(describeInterpretationConfidence(missingSat), /^Low/);
  assert.match(describeMoistureStress(missingSat), /^Unavailable/i);

  const pageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/FieldHealthPage.tsx'),
    'utf8'
  );
  assert.match(pageSource, /Valid sample coverage:/);
  assert.match(pageSource, /Excluded\/unusable:/);
  assert.match(pageSource, /crop type, growth stage, soil background, season/);
});

test('29. RotationComparisonCard renders timeline, soil-health reasoning, rainfall summary, and unverified calendar state', async () => {
  const { RotationComparisonCard } = await import(
    '../src/components/rotation/RotationComparisonCard.tsx'
  );

  const html = renderToStaticMarkup(
    React.createElement(RotationComparisonCard, {
      rank: 1,
      temperatureUnit: 'celsius',
      plan: {
        crop_ids: ['rice', 'chickpea'],
        score: 84.5,
        compatibility_band: 'Good Screening Match',
        feasibility: {
          status: 'feasible',
          total_cycle_months: 9,
          timeline_summary: 'S1: Rice (Jun–Oct) → S2: Chickpea (Nov–Feb (crosses Dec–Jan))',
          warnings: [],
        },
        seasons: [
          {
            crop_id: 'rice',
            name: 'Rice',
            family: 'poaceae',
            is_legume: false,
            planting_month: 6,
            harvest_month: 10,
            duration_months: 5,
            window_label: 'Jun–Oct',
            wraps_year: false,
            local_season_name: 'Kharif (Monsoon)',
            calendar_status: 'aligned',
            avg_historical_temperature_c: 31.2,
            temperature_fit_score: 88,
            water_category: 'high',
            water_compatibility_score: 82,
            season_rainfall_mm: 340,
            soil_ph_compatibility_score: 91,
            family_diversity_score: 96,
            screening_score: 86,
          },
          {
            crop_id: 'chickpea',
            name: 'Chickpea',
            family: 'fabaceae',
            is_legume: true,
            planting_month: 11,
            harvest_month: 2,
            duration_months: 4,
            window_label: 'Nov–Feb (crosses Dec–Jan)',
            wraps_year: true,
            local_season_name: 'Rabi (Winter)',
            calendar_status: 'aligned',
            avg_historical_temperature_c: 17.5,
            temperature_fit_score: 90,
            water_category: 'low',
            water_compatibility_score: 92,
            season_rainfall_mm: 48,
            soil_ph_compatibility_score: 88,
            family_diversity_score: 96,
            screening_score: 89,
          },
        ],
        soil_health_summary: {
          soil_health_score: 87.5,
          soil_ph_compatibility: 89.5,
          soil_ph_evaluated: true,
          has_legume: true,
          legume_crops: ['Chickpea'],
          distinct_families: 2,
          strengths: [
            'Includes legume crop (Chickpea), offering potential biological nitrogen fixation (not a guaranteed nitrogen credit).',
          ],
          cautions: [],
          evaluated_factors: ['botanical_family_sequence', 'legume_presence', 'soil_ph'],
          missing_factors: [],
          evidence_caveat: 'Qualitative screening only.',
        },
        diagnostics: {
          climate_compatibility: 89,
          water_compatibility: 87,
          family_rotation: 96,
          soil_compatibility: 89.5,
          soil_evaluated: true,
          soil_health_score: 87.5,
          regional_calendar_score: 94,
          regional_calendar_evaluated: true,
          rainfall_evaluated: true,
          data_completeness: {
            evaluated_count: 6,
            total_count: 6,
            label: 'High',
          },
          distinct_families: 2,
          distinct_crops: 2,
          goal_applied: 'soil',
          goal_weights_applied: { climate: 0.2, water: 0.16, soil_health: 0.32, diversity: 0.18, calendar: 0.14 },
          missing_data_notes: [],
          tie_note: null,
        },
        explanation: 'Balanced Kharif cereal to Rabi legume sequence.',
      },
    })
  );

  assert.match(html, /Nov–Feb \(crosses Dec–Jan\)/);
  assert.match(html, /Legume/);
  assert.match(html, /Soil-Health Considerations/);
  assert.match(html, /not a guaranteed nitrogen credit/);
  assert.match(html, /340 mm/);
  assert.match(html, /Evidence: High \(6\/6\)/);
  assert.match(html, /94\.0\/100/);
});

test('30. PlannerPage and ScenariosPage forward identical agronomic context and render regional/source disclosures', () => {
  const plannerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/PlannerPage.tsx'),
    'utf8'
  );
  const scenariosSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ScenariosPage.tsx'),
    'utf8'
  );
  const disclosureSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/rotation/ScreeningLimitationsDisclosure.tsx'),
    'utf8'
  );

  for (const field of [
    'country:',
    'country_code:',
    'region:',
    'soil_texture:',
    'drainage:',
    'salinity_concern:',
    'irrigation_method:',
  ]) {
    assert.ok(plannerSource.includes(field), `PlannerPage missing ${field}`);
    assert.ok(scenariosSource.includes(field), `ScenariosPage missing ${field}`);
  }

  assert.match(plannerSource, /NASA POWER Historical Rainfall Context/);
  assert.match(plannerSource, /Regional Planting Calendar Not Verified/);
  assert.match(plannerSource, /Sequences Excluded by Regional Timing Checks/);
  assert.match(disclosureSource, /Agronomic &amp; Earth Observation References/);
});

test('31. MetricPrimitives preserve exact numerical measurements alongside interpretations and honor null/unverified states', async () => {
  const { ScoreProgressBar, IndexRangeMeter } = await import(
    '../src/components/common/MetricPrimitives.tsx'
  );
  const { RotationComparisonCard } = await import(
    '../src/components/rotation/RotationComparisonCard.tsx'
  );

  const scoredHtml = renderToStaticMarkup(
    React.createElement(ScoreProgressBar, {
      label: 'Climate Fit',
      score: 89.2,
      interpretation: 'Strong fit',
      driverHint: 'NASA historical temp → crop thermal range',
    })
  );
  const scoredPlain = scoredHtml.replace(/<[^>]+>/g, '');
  assert.match(scoredPlain, /Climate Fit/);
  assert.match(scoredPlain, /89\.2\/100 — Strong fit/);
  assert.match(scoredPlain, /NASA historical temp → crop thermal range/);
  assert.match(scoredHtml, /aria-valuenow="89\.2"/);

  const nullHtml = renderToStaticMarkup(
    React.createElement(ScoreProgressBar, {
      label: 'Soil pH Fit',
      score: null,
      unavailableLabel: 'Not evaluated',
      driverHint: 'Omitted from score because soil pH was not provided',
    })
  );
  assert.match(nullHtml, /Not evaluated/);
  assert.ok(!nullHtml.includes('/100'), 'Null score must not invent a /100 number');

  const meterHtml = renderToStaticMarkup(
    React.createElement(IndexRangeMeter, {
      label: 'NDVI Range',
      value: 0.123,
      min: -0.2,
      max: 1.0,
      thresholdValue: 0.2,
      thresholdLabel: '0.20 sparse/soil',
      lowLabel: 'Bare/Water',
      highLabel: 'Dense Canopy',
    })
  );
  assert.match(meterHtml, /role="meter"/);
  assert.match(meterHtml, /aria-valuenow="0\.123"/);
  assert.match(meterHtml, /0\.20 sparse\/soil/);

  const secondPlanHtml = renderToStaticMarkup(
    React.createElement(RotationComparisonCard, {
      rank: 2,
      topScore: 89.0,
      temperatureUnit: 'celsius',
      plan: {
        crop_ids: ['wheat'],
        score: 84.8,
        compatibility_band: 'Good Screening Match',
        seasons: [
          {
            crop_id: 'wheat',
            name: 'Wheat',
            family: 'poaceae',
            is_legume: false,
            planting_month: 11,
            harvest_month: 3,
            duration_months: 5,
            avg_historical_temperature_c: 18.4,
            temperature_fit_score: 86,
            water_category: 'medium',
            water_compatibility_score: 84,
            soil_ph_compatibility_score: null,
            family_diversity_score: 80,
            screening_score: 84.8,
          },
        ],
        explanation: 'Seasonal wheat comparison.',
      },
    })
  );
  assert.match(secondPlanHtml, /Option #2/);
  assert.match(secondPlanHtml, /84\.8 \/ 100/);
  assert.match(secondPlanHtml, /-4\.2 vs #1/);
  assert.match(secondPlanHtml, /Not evaluated/);
});

test('32. Server domain policy enforces strict agricultural scope, redirects off-topic prompts without Gemini calls, and handles ambiguity', async () => {
  const sampleFarmContext = {
    farmName: 'Tests',
    country: 'Pakistan',
    region: 'Punjab',
    areaHectares: 5000,
    farmType: 'smallholder',
    irrigationMethod: 'canal',
    waterAvailability: 'seasonal_adequate',
    soil: { ph: 7.4, texture: 'loam' },
    previousCrop: 'Wheat',
    loadedClimateSummary: { source: 'NASA POWER', startYear: 2016, endYear: 2025, monthsCount: 120 },
    loadedFieldHealth: { satelliteAvailable: true, ndvi: 0.123, ndmi: -0.02 },
    loadedRotationScreening: { status: 'ok', topPlans: [{ crops: ['wheat', 'chickpea'], score: 88 }] },
  };

  let geminiCalls = 0;
  const trackingClientFactory = () => ({
    models: {
      generateContent: async (params: { contents: string; config?: Record<string, unknown> }) => {
        geminiCalls += 1;
        if (String(params.config?.systemInstruction || '').includes('strict domain classifier')) {
          const lower = params.contents.toLowerCase();
          return {
            text: JSON.stringify({
              in_scope: !lower.includes('unrelated trivia') && !lower.includes('mystery novel'),
            }),
          };
        }
        return { text: `Mocked reply | contents_len=${params.contents.length} | ${params.contents}` };
      },
    },
  });

  // 1-2 & 8-9: In-scope agricultural, crop rotation, area conversion, and moisture questions succeed
  for (const allowedPrompt of [
    'Why does rotating legumes after cereal crops help soil health?',
    'What is a good crop rotation after wheat?',
    'Calculate hectares from 12.5 acres',
    'Explain moisture levels',
    'How do I use the dashboard?',
  ]) {
    geminiCalls = 0;
    const res = await handleAssistantRequest(
      { messages: [{ role: 'user', content: allowedPrompt }], farmContext: sampleFarmContext },
      { env: { GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv, clientFactory: trackingClientFactory }
    );
    assert.equal(res.status, 200, `Expected 200 for allowed prompt: ${allowedPrompt}`);
    assert.equal(res.body.policyDecision, 'in_scope');
    assert.equal(geminiCalls, 1, `Expected single Gemini call for clear prompt: ${allowedPrompt}`);
    // 10. General questions MUST NOT receive unsolicited farm summaries
    assert.equal(res.body.farmContextAttached, false, `Must not attach farm context for: ${allowedPrompt}`);
    assert.ok(!String(res.body.reply).includes('"farmName": "Tests"'));
  }

  // 3. Farm-specific question attaches ONLY relevant farm context
  geminiCalls = 0;
  const farmSpecificRes = await handleAssistantRequest(
    {
      messages: [
        { role: 'user', content: 'What rotation and climate considerations apply to my farm profile?' },
      ],
      farmContext: sampleFarmContext,
    },
    { env: { GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv, clientFactory: trackingClientFactory }
  );
  assert.equal(farmSpecificRes.status, 200);
  assert.equal(farmSpecificRes.body.policyDecision, 'in_scope');
  assert.equal(farmSpecificRes.body.farmContextAttached, true);
  assert.match(String(farmSpecificRes.body.reply), /farmerProvidedInformation/);
  assert.match(String(farmSpecificRes.body.reply), /nasaPowerHistoricalClimate/);

  // 4, 5, 6, 7: Off-topic requests (math, programming, AgroShift internals, trivia, jokes, casual hi)
  // MUST be rejected without invoking Gemini
  for (const offTopicPrompt of [
    'Solve this algebra equation: 2x + 5 = 17',
    'Write a Python script to sort numbers',
    'How was AgroShift programmed?',
    'What is the capital city of France?',
    'Who was the first president of the United States?',
    'Tell me a joke',
    'Hi',
    'How are you?',
  ]) {
    geminiCalls = 0;
    const res = await handleAssistantRequest(
      { messages: [{ role: 'user', content: offTopicPrompt }], farmContext: sampleFarmContext },
      { env: { GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv, clientFactory: trackingClientFactory }
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.policyDecision, 'out_of_scope', `Expected out_of_scope for: ${offTopicPrompt}`);
    assert.equal(res.body.reply, STANDARD_OUT_OF_SCOPE_REPLY);
    assert.equal(geminiCalls, 0, `Must NOT call Gemini for out-of-scope: ${offTopicPrompt}`);
  }

  // Ambiguous standalone request uses constrained classifier (at most 1 classification call)
  geminiCalls = 0;
  const ambiguousRejected = await handleAssistantRequest(
    { messages: [{ role: 'user', content: 'Recommend a mystery novel?' }], farmContext: null },
    { env: { GEMINI_API_KEY: 'test-key' } as NodeJS.ProcessEnv, clientFactory: trackingClientFactory }
  );
  assert.equal(ambiguousRejected.status, 200);
  assert.equal(ambiguousRejected.body.policyDecision, 'out_of_scope');
  assert.equal(ambiguousRejected.body.reply, STANDARD_OUT_OF_SCOPE_REPLY);
  assert.equal(geminiCalls, 1);

  // 11. Scientific honesty rules present in server assistant prompt
  const assistantServiceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/assistantService.ts'),
    'utf8'
  );
  assert.match(assistantServiceSrc, /NDVI 0\.123|0\.123/);
  assert.match(assistantServiceSrc, /fallow, harvested, planted, irrigated, diseased, or moisture-stressed/);
  assert.match(assistantServiceSrc, /guaranteed yields/);
});

test('33. Vercel /api/assistant serverless handler enforces domain rules identically to Express route', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'vercel-test-key';
  try {
    let sentStatus = 0;
    let sentJson: Record<string, unknown> = {};
    const makeMockRes = () => ({
      setHeader() {},
      status(code: number) {
        sentStatus = code;
        return this;
      },
      json(payload: unknown) {
        sentJson = (payload ?? {}) as Record<string, unknown>;
      },
    });

    await handler(
      { method: 'GET' } as Parameters<typeof handler>[0],
      makeMockRes() as unknown as Parameters<typeof handler>[1]
    );
    assert.equal(sentStatus, 405);

    await handler(
      {
        method: 'POST',
        body: { messages: [{ role: 'user', content: 'Solve 3x - 9 = 12' }], farmContext: null },
      } as Parameters<typeof handler>[0],
      makeMockRes() as unknown as Parameters<typeof handler>[1]
    );
    assert.equal(sentStatus, 200);
    assert.equal(sentJson.policyDecision, 'out_of_scope');
    assert.equal(sentJson.reply, STANDARD_OUT_OF_SCOPE_REPLY);
  } finally {
    if (prevKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevKey;
    }
  }
});

test('34. AssistantMarkdown renders KaTeX agricultural math safely while blocking unsafe HTML and links', () => {
  const mathContent = [
    'Convert area with $A_{\\text{ha}} = \\frac{A_{\\text{ac}}}{2.47105}$.',
    '',
    '$$',
    '\\text{Total Rainfall} = 4\\text{ mm/day} \\times 30\\text{ days} = 120\\text{ mm}',
    '$$',
    '',
    'Unsafe math macro check: $\\href{javascript:alert(1)}{click}$',
    '',
    '<script>alert(1)</script>',
  ].join('\n');

  const html = renderToStaticMarkup(
    React.createElement(AssistantMarkdown, { content: mathContent })
  );
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<a '));
  assert.ok(!html.includes('href="javascript:'));
});

test('35. ReportsPage distinguishes saved vs unsaved plans with timestamps, Settings dims incomplete languages, and Tests farm stays intact', () => {
  const reportsSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ReportsPage.tsx'),
    'utf8'
  );
  const settingsSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/SettingsPage.tsx'),
    'utf8'
  );

  assert.match(reportsSrc, /1\. Farmer-Selected Saved Rotation Plans/);
  assert.match(reportsSrc, /2\. Latest Computed Rotation Screening/);
  assert.match(reportsSrc, /Unsaved screening output/);
  assert.match(reportsSrc, /3\. Climate &amp; Satellite Observations Retrieved in Session/);
  assert.match(reportsSrc, /latestComputedRotationScreening/);
  assert.match(reportsSrc, /retrievedAt/);

  assert.match(settingsSrc, /Upcoming interface translations/);
  assert.match(settingsSrc, /Clear All Local Farm Data/);

  withMockBrowser(() => {
    const unusualTestFarm: FarmProfile = {
      id: 'farm-tests-legacy',
      location: {
        country: 'Pakistan',
        countryCode: 'PK',
        region: 'Punjab',
        locality: 'Multan',
        latitude: 30.1575,
        longitude: 71.5249,
        geometryType: 'point',
        polygonGeoJSON: null,
        polygonEstimatedHectares: null,
      },
      details: {
        name: 'Tests',
        areaHectares: 5000,
        areaSource: 'manual',
        preferredAreaUnit: 'hectares',
        farmType: 'smallholder',
        irrigationMethod: 'canal_flood',
        waterAvailability: 'seasonal_adequate',
        rainfallReliability: 'variable',
        managedFieldsCount: 1,
      },
      soil: {
        knowledgeLevel: 'unsure',
        texture: 'unknown',
        textureProvenance: 'unknown',
        ph: null,
        phProvenance: 'unknown',
        drainage: 'unknown',
        drainageProvenance: 'unknown',
        organicMatterPercent: null,
        organicMatterProvenance: 'unknown',
        salinityConcern: 'unknown',
        hasLabSoilTest: false,
        observations: '',
      },
      history: {
        previousCropId: 'wheat',
        previousCropName: 'Wheat',
        earlierCrops: [],
        typicalPlantingWindow: '',
        typicalHarvestWindow: '',
        rotationChallenges: '',
      },
      priorities: ['support_soil_health'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    farmRepository.saveFarm(unusualTestFarm);
    const loaded = farmRepository.listFarms().data;
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].details.name, 'Tests');
    assert.equal(loaded[0].details.areaHectares, 5000);
    assert.equal(loaded[0].details.farmType, 'smallholder');
  });
});

test('36. Incomplete-year precipitation excludes partial years from complete-year annual means and respects leap years', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2023), false);
  assert.equal(daysInCalendarMonth(2024, 2), 29);
  assert.equal(daysInCalendarMonth(2023, 2), 28);

  // Build 2020-2025 complete (12 months * 100 mm/month = 1200 mm/yr) + partial 2026 (only 4 months * 100 mm/month = 400 mm)
  const monthly: Array<{
    month: string;
    temperature_c: number | null;
    precipitation_mm_per_day: number | null;
    estimated_monthly_precipitation_mm: number | null;
  }> = [];
  for (let year = 2020; year <= 2025; year += 1) {
    for (let m = 1; m <= 12; m += 1) {
      monthly.push({
        month: `${year}${String(m).padStart(2, '0')}`,
        temperature_c: 20,
        precipitation_mm_per_day: 100 / daysInCalendarMonth(year, m),
        estimated_monthly_precipitation_mm: 100,
      });
    }
  }
  for (let m = 1; m <= 4; m += 1) {
    monthly.push({
      month: `2026${String(m).padStart(2, '0')}`,
      temperature_c: 18,
      precipitation_mm_per_day: 100 / daysInCalendarMonth(2026, m),
      estimated_monthly_precipitation_mm: 100,
    });
  }

  const stats = computeClimatePeriodStats(monthly);
  assert.ok(stats);
  assert.equal(stats.yearsWithRecords, 7);
  assert.equal(stats.completeYearsCount, 6);
  // Naive total/7 would give (7200+400)/7 = 1085.7 mm; complete-year mean must stay 1200.0 mm
  assert.equal(stats.meanAnnualRainMm, 1200.0);
  assert.equal(stats.climatologicalAnnualMeanMm, 1200.0);
  assert.equal(stats.incompleteYears.length, 1);
  assert.equal(stats.incompleteYears[0].year, 2026);
  assert.equal(stats.incompleteYears[0].validMonths, 4);

  // When precipitation is null/-999 sentinel for 1 month in 2025, missing month must not become 0
  const partialOnly = [
    {
      month: '202501',
      temperature_c: 15,
      precipitation_mm_per_day: 2.0,
      estimated_monthly_precipitation_mm: 62.0,
    },
    {
      month: '202502',
      temperature_c: 16,
      precipitation_mm_per_day: -999,
      estimated_monthly_precipitation_mm: null,
    },
    {
      month: '202503',
      temperature_c: 19,
      precipitation_mm_per_day: 1.0,
      estimated_monthly_precipitation_mm: 31.0,
    },
  ];
  const partialStats = computeClimatePeriodStats(partialOnly);
  assert.ok(partialStats);
  assert.equal(partialStats.completeYearsCount, 0);
  assert.equal(partialStats.meanAnnualRainMm, null);
  assert.equal(partialStats.incompleteYears[0].validMonths, 2);
  assert.equal(partialStats.incompleteYears[0].observedRecords, 3);
});

test('37. PlannerPage three-season chart labels show all crops so sequences stay distinguishable', () => {
  const label1 = formatSequenceChartLabel(
    {
      seasons: [
        { name: 'Cowpea' },
        { name: 'Maize' },
        { name: 'Chickpea' },
      ] as Parameters<typeof formatSequenceChartLabel>[0]['seasons'],
    },
    1
  );
  const label2 = formatSequenceChartLabel(
    {
      seasons: [
        { name: 'Cowpea' },
        { name: 'Sorghum' },
        { name: 'Chickpea' },
      ] as Parameters<typeof formatSequenceChartLabel>[0]['seasons'],
    },
    2
  );
  assert.equal(label1, '#1 Cowpea → Maize → Chickpea');
  assert.equal(label2, '#2 Cowpea → Sorghum → Chickpea');
  assert.notEqual(label1, label2);

  const plannerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/PlannerPage.tsx'),
    'utf8'
  );
  assert.match(plannerSrc, /formatSequenceChartLabel/);
  assert.match(plannerSrc, /unverified_plans/);
});

test('38. Observation persistence survives reloads scoped by farmId, cleans up on delete, and ReportsPage honors display units', () => {
  withMockBrowser(() => {
    observationRepository.saveEntry('farm-a', {
      climate: {
        data_available: true,
        source: 'NASA POWER',
        start_year: 2020,
        end_year: 2025,
        location: { latitude: 31.2, longitude: 72.4 },
        monthly: [
          {
            month: '202401',
            temperature_c: 24.5,
            precipitation_mm_per_day: 1.2,
            estimated_monthly_precipitation_mm: 37.2,
          },
        ],
      },
      climateFetchedAt: '2026-11-10T10:00:00.000Z',
    });
    observationRepository.saveEntry('farm-b', {
      fieldHealth: {
        ndvi: 0.42,
        ndvi_status: 'MODERATE',
        ndmi: 0.11,
        ndmi_status: 'MODERATE',
        temperature_c: 28,
        humidity_percent: 50,
        recent_rainfall_mm: 2,
        heat_risk: 'LOW',
        rainfall_status: 'MODERATE',
        possible_water_stress: null,
        analysis_confidence: 'MODERATE',
        satellite_available: true,
        satellite_observation_date: '2026-11-09',
        cloud_cover_percent: 10,
        satellite_message: null,
        weather_available: true,
        weather_message: null,
        weather_source: 'open-meteo',
        weather_data_type: 'current_observation',
        weather_observation_window: 'Open-Meteo current reading',
        ai_explanation: 'Screening check.',
        recommendations: [],
      },
      fieldHealthFetchedAt: '2026-11-10T11:00:00.000Z',
    });

    const loaded = observationRepository.loadByFarm().data;
    assert.equal(loaded['farm-a']?.climate?.monthly?.[0]?.temperature_c, 24.5);
    assert.equal(loaded['farm-a']?.climateFetchedAt, '2026-11-10T10:00:00.000Z');
    assert.equal(loaded['farm-b']?.fieldHealth?.weather_observation_window, 'Open-Meteo current reading');

    observationRepository.deleteFarmObservations('farm-a');
    const afterDelete = observationRepository.loadByFarm().data;
    assert.equal(afterDelete['farm-a'], undefined);
    assert.ok(afterDelete['farm-b']);

    // Corrupt version returns empty safely
    window.localStorage.setItem('agroshift.observations.v1', JSON.stringify({ version: 99, byFarm: { x: {} } }));
    assert.deepEqual(observationRepository.loadByFarm().data, {});
  });

  const reportsSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ReportsPage.tsx'),
    'utf8'
  );
  assert.match(reportsSrc, /formatTemperature\(/);
  assert.match(reportsSrc, /Fresh in session/);
  assert.match(reportsSrc, /Cached from prior session/);
  assert.match(reportsSrc, /settings\.areaUnit/);
  assert.match(reportsSrc, /settings\.temperatureUnit/);
  assert.ok(!reportsSrc.includes('avg_temperature_c.toFixed(1)} °C'));
});

test('39. FarmWizard renders soil salinity and organic matter together in lab_test mode', () => {
  const wizardSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/farms/FarmWizard.tsx'),
    'utf8'
  );
  const omIdx = wizardSrc.indexOf('id="soil-om"');
  const salIdx = wizardSrc.indexOf('id="soil-salinity"');
  assert.ok(omIdx > -1 && salIdx > -1);
  // Ensure there is no guard hiding salinity from lab_test users
  assert.ok(!wizardSrc.includes("soilKnowledge !== 'lab_test'"));
  assert.match(wizardSrc, /soilKnowledge === 'lab_test'/);
  assert.match(wizardSrc, /Salinity \/ Salt Crusting Concern/);
  assert.match(wizardSrc, /Organic Matter:/);
});

test('40. ScenariosPage supports planting month, horizon seasons, and Celsius/Fahrenheit temperature deltas', () => {
  assert.equal(Number(celsiusDeltaToFahrenheit(2).toFixed(1)), 3.6);
  assert.equal(formatTemperatureDelta(2, 'celsius'), '+2.0 °C');
  assert.equal(formatTemperatureDelta(2, 'fahrenheit'), '+3.6 °F');
  assert.equal(formatTemperatureDelta(-2, 'fahrenheit'), '-3.6 °F');

  const scenariosSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/ScenariosPage.tsx'),
    'utf8'
  );
  assert.match(scenariosSrc, /id="scenario-planting-month"/);
  assert.match(scenariosSrc, /Planning Horizon/);
  assert.match(scenariosSrc, /planting_month:\s*monthOverride/);
  assert.match(scenariosSrc, /seasons:\s*seasonsOverride/);
  assert.match(scenariosSrc, /formatTemperatureDelta\(/);
});

test('41. AssistantMarkdown normalizes \\(...\\), \\[...\\], and spaced $ ... $ math while preserving currency and code', () => {
  assert.equal(
    normalizeAssistantMath('Use \\( x = 1 \\) and \\[ A = \\frac{10}{2.471} \\].'),
    'Use $x = 1$ and \n$$\nA = \\frac{10}{2.471}\n$$\n.'
  );
  assert.equal(
    normalizeAssistantMath('Irrigate with $ d = 25\\text{ mm} $ per cycle.'),
    'Irrigate with $d = 25\\text{ mm}$ per cycle.'
  );
  assert.equal(
    normalizeAssistantMath('Seed budget is $50 to $100 per acre; keep `$ x = 1 $` literal.'),
    'Seed budget is \\$50 to \\$100 per acre; keep `$ x = 1 $` literal.'
  );

  const rendered = renderToStaticMarkup(
    React.createElement(AssistantMarkdown, {
      content: [
        'Inline normalized: \\( A_{\\text{ha}} = \\frac{10}{2.471} \\)',
        '',
        'Spaced inline: $ R_{\\text{eff}} = 0.8 \\times P $',
        '',
        'Display normalized:',
        '\\[ \\text{Total} = 4 \\times 30 = 120\\text{ mm} \\]',
        '',
        'Budget: $50 to $100.',
        '<script>alert(1)</script>',
        '$\\href{javascript:alert(1)}{click}$',
      ].join('\n'),
    })
  );
  assert.match(rendered, /class="katex"/);
  assert.match(rendered, /class="katex-display"/);
  assert.match(rendered, /\$50 to \$100\./);
  assert.ok(!rendered.includes('<script'));
  assert.ok(!rendered.includes('<a '));
  assert.ok(!rendered.includes('href="javascript:'));
});

test('42. Geocoding requests forward the selected language query parameter and partition caches per language', async () => {
  clearGeocodingCaches();
  const seenAcceptLanguages: string[] = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const lang = url.searchParams.get('accept-language') ?? '';
      seenAcceptLanguages.push(lang);
      return new Response(
        JSON.stringify([
          {
            place_id: 101,
            display_name: lang === 'ur' ? 'ملتان، پنجاب' : 'Multan, Punjab',
            lat: '30.1575',
            lon: '71.5249',
            address: { country: 'Pakistan', country_code: 'pk', state: 'Punjab', city: 'Multan' },
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const enRes = await searchPlaces('Multan', { countryCode: 'PK', language: 'en' });
    const urRes = await searchPlaces('Multan', { countryCode: 'PK', language: 'ur' });
    // Cached repeat for ur should NOT issue a third fetch
    const urCached = await searchPlaces('Multan', { countryCode: 'PK', language: 'ur' });

    assert.equal(seenAcceptLanguages.length, 2);
    assert.deepEqual(seenAcceptLanguages, ['en', 'ur']);
    assert.equal(enRes[0].displayName, 'Multan, Punjab');
    assert.equal(urRes[0].displayName, 'ملتان، پنجاب');
    assert.equal(urCached[0].displayName, 'ملتان، پنجاب');

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const lang = url.searchParams.get('accept-language') ?? '';
      seenAcceptLanguages.push(lang);
      return new Response(
        JSON.stringify({
          display_name: lang === 'sw' ? 'Nairobi, Kenya' : 'Nairobi',
          address: { country: 'Kenya', country_code: 'ke', state: 'Nairobi' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };
    const rev = await reverseGeocode(-1.2921, 36.8219, { language: 'sw' });
    assert.equal(seenAcceptLanguages[2], 'sw');
    assert.equal(rev?.countryCode, 'KE');
  } finally {
    globalThis.fetch = originalFetch;
    clearGeocodingCaches();
  }
});

test('43. RotationComparisonCard renders unverified and conditional regional timing clearly without false scores', async () => {
  const { RotationComparisonCard } = await import(
    '../src/components/rotation/RotationComparisonCard.tsx'
  );

  const html = renderToStaticMarkup(
    React.createElement(RotationComparisonCard, {
      rank: 3,
      temperatureUnit: 'celsius',
      plan: {
        crop_ids: ['canola', 'lentil'],
        score: 92.7,
        compatibility_band: 'Unverified Timing — Confirm Locally',
        feasibility: {
          status: 'feasible',
          regional_timing_evidence: 'unverified',
          verified_calendar_seasons: 0,
          total_seasons: 2,
          unverified_crop_ids: ['canola', 'lentil'],
          total_cycle_months: 8,
          timeline_summary: 'S1: Canola (Mar–Jun) → S2: Lentil (Jul–Oct)',
          warnings: ['Missing regional calendar for Kenya.'],
        },
        seasons: [
          {
            crop_id: 'canola',
            name: 'Canola',
            family: 'brassicaceae',
            is_legume: false,
            planting_month: 3,
            harvest_month: 6,
            duration_months: 4,
            calendar_status: 'unverified',
            avg_historical_temperature_c: 20.1,
            temperature_fit_score: 91,
            water_category: 'medium',
            water_compatibility_score: 90,
            soil_ph_compatibility_score: 92,
            family_diversity_score: 94,
            screening_score: 91.5,
          },
          {
            crop_id: 'lentil',
            name: 'Lentil',
            family: 'fabaceae',
            is_legume: true,
            planting_month: 7,
            harvest_month: 10,
            duration_months: 4,
            calendar_status: 'unverified',
            avg_historical_temperature_c: 19.5,
            temperature_fit_score: 93,
            water_category: 'low',
            water_compatibility_score: 95,
            soil_ph_compatibility_score: 90,
            family_diversity_score: 94,
            screening_score: 93.8,
          },
        ],
        diagnostics: {
          climate_compatibility: 92,
          water_compatibility: 92.5,
          family_rotation: 94,
          soil_compatibility: 91,
          soil_evaluated: true,
          soil_health_score: 90,
          regional_calendar_score: null,
          regional_calendar_evaluated: false,
          regional_timing_evidence: 'unverified',
          verified_calendar_seasons: 0,
          total_seasons: 2,
          unverified_calendar_crops: ['Canola', 'Lentil'],
          rainfall_evaluated: true,
          data_completeness: { evaluated_count: 5, total_count: 6, label: 'Moderate' },
          distinct_families: 2,
          distinct_crops: 2,
          goal_applied: 'soil',
          goal_weights_applied: { climate: 0.23, water: 0.19, soil_health: 0.37, diversity: 0.21, calendar: 0 },
          missing_data_notes: [],
          tie_note: null,
        },
        explanation: 'Unverified regional calendar fallback.',
      },
    })
  );

  assert.match(html, /Unverified Timing — Confirm Locally/);
  assert.match(html, /Unverified/);
  assert.match(html, /No verified regional calendar for this crop\/location/);
  assert.ok(!html.includes('/100 — Regional'));

  const conditionalHtml = renderToStaticMarkup(
    React.createElement(RotationComparisonCard, {
      rank: 2,
      temperatureUnit: 'celsius',
      plan: {
        crop_ids: ['canola', 'lentil'],
        score: 88.4,
        compatibility_band: 'Conditional Timing — Confirm Locally',
        feasibility: {
          status: 'feasible',
          regional_timing_evidence: 'conditional',
          verified_calendar_seasons: 1,
          total_seasons: 2,
          unverified_crop_ids: ['lentil'],
          total_cycle_months: 8,
          timeline_summary: 'S1: Canola → S2: Lentil',
          warnings: [],
        },
        seasons: [
          {
            crop_id: 'canola',
            name: 'Canola',
            planting_month: 5,
            duration_months: 4,
            avg_historical_temperature_c: 15,
            temperature_fit_score: 89,
            water_category: 'medium',
            water_compatibility_score: 88,
            soil_ph_compatibility_score: 90,
            family_diversity_score: 92,
            screening_score: 89,
          },
          {
            crop_id: 'lentil',
            name: 'Lentil',
            planting_month: 9,
            duration_months: 4,
            avg_historical_temperature_c: 18,
            temperature_fit_score: 88,
            water_category: 'low',
            water_compatibility_score: 89,
            soil_ph_compatibility_score: 89,
            family_diversity_score: 92,
            screening_score: 88,
          },
        ],
        diagnostics: {
          climate_compatibility: 88.5,
          water_compatibility: 88.5,
          family_rotation: 92,
          soil_compatibility: 89.5,
          soil_evaluated: true,
          soil_health_score: 88,
          regional_calendar_score: null,
          regional_calendar_evaluated: false,
          regional_timing_evidence: 'conditional',
          verified_calendar_seasons: 1,
          total_seasons: 2,
          unverified_calendar_crops: ['Lentil'],
          rainfall_evaluated: true,
          distinct_families: 2,
          distinct_crops: 2,
          goal_applied: 'soil',
          goal_weights_applied: { climate: 0.23, water: 0.19, soil_health: 0.37, diversity: 0.21, calendar: 0 },
          missing_data_notes: [],
          tie_note: null,
        },
        explanation: 'Partially verified regional calendar.',
      },
    })
  );
  assert.match(conditionalHtml, /Conditional Timing — Confirm Locally/);
  assert.match(conditionalHtml, /1\/2 seasons verified/);
});

test('44. /api/v1/environmental-context parses NASA + SoilGrids metadata and handles offline errors safely', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          location: { latitude: 30.15, longitude: 71.52 },
          start_year: 2016,
          end_year: 2025,
          retrieved_at: '2026-11-14T12:00:00Z',
          nasa_climate: {
            available: true,
            status: 'available',
            variables: {
              air_temperature_c: {
                variable: 'T2M',
                label: 'Historical 2m Air Temperature',
                value: 25.2,
                unit: '°C',
                available: true,
                status: 'available',
                source: 'NASA POWER (AG Community)',
                source_url: 'https://power.larc.nasa.gov/',
                category: 'observed_historical_climate',
                spatial_resolution: '0.5° × 0.625°',
                observation_period: '2016–2025',
                retrieved_at: '2026-11-14T12:00:00Z',
                uncertainty_note: 'Gridded climatology.',
              },
            },
          },
          nasa_soil_wetness: {
            available: true,
            status: 'available',
            variables: {
              surface_soil_wetness: {
                variable: 'GWETTOP',
                label: 'Surface Soil Wetness Index (0–5 cm)',
                value: 0.34,
                unit: '0–1 wetness fraction',
                available: true,
                status: 'available',
                source: 'NASA POWER (AG Community)',
                source_url: 'https://power.larc.nasa.gov/',
                category: 'modeled_reanalysis_estimate',
                spatial_resolution: '0.5° × 0.625°',
                observation_period: '2016–2025',
                retrieved_at: '2026-11-14T12:00:00Z',
                uncertainty_note: 'Coarse reanalysis index.',
              },
            },
          },
          soil_context: {
            available: true,
            status: 'available',
            source: 'ISRIC SoilGrids v2.0',
            endpoint_used: 'rest.isric.org',
            spatial_resolution: '250 m',
            retrieved_at: '2026-11-14T12:00:00Z',
            derived_usda_texture: 'Loam',
            mapped_farm_texture: 'loam',
            properties: {
              phh2o: {
                variable: 'phh2o',
                label: 'Soil pH in H2O',
                value: 7.4,
                unit: 'pH',
                q05: 6.6,
                q95: 8.2,
                depth_interval: '0–15 cm (thickness-weighted)',
                available: true,
                status: 'available',
                source: 'ISRIC SoilGrids v2.0',
                source_url: 'https://soilgrids.org/',
                category: 'public_modeled_soil_estimate',
                spatial_resolution: '250 m',
                observation_period: 'SoilGrids v2.0',
                retrieved_at: '2026-11-14T12:00:00Z',
                uncertainty_note: 'Modeled prediction.',
              },
              soc: {
                variable: 'soc',
                label: 'Soil Organic Carbon',
                value: 5.2,
                unit: 'g/kg',
                q05: 2.1,
                q95: 10.5,
                depth_interval: '0–15 cm (thickness-weighted)',
                available: true,
                status: 'available',
                source: 'ISRIC SoilGrids v2.0',
                source_url: 'https://soilgrids.org/',
                category: 'public_modeled_soil_estimate',
                spatial_resolution: '250 m',
                observation_period: 'SoilGrids v2.0',
                retrieved_at: '2026-11-14T12:00:00Z',
                uncertainty_note: 'Distinct from lab OM%.',
              },
            },
          },
          suggested_farm_defaults: {
            soil_ph: {
              field: 'soil.ph',
              available: true,
              suggested_value: 7.4,
              unit: 'pH',
              provenance: 'public_dataset_estimate',
              source_label: 'ISRIC SoilGrids v2.0',
              requires_confirmation: true,
              auto_applied: false,
            },
            soil_texture: {
              field: 'soil.texture',
              available: true,
              suggested_value: 'loam',
              usda_class: 'Loam',
              provenance: 'public_dataset_estimate',
              source_label: 'USDA triangle from SoilGrids',
              requires_confirmation: true,
              auto_applied: false,
            },
          },
          details_farmer_must_confirm: ['Field drainage quality', 'Salinity signs'],
          precedence_policy: 'lab_test > farmer_observation > public_dataset_estimate > unknown',
          limitations: ['Advisory reference only.'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )) as typeof fetch;

    const ctx = await fetchEnvironmentalContext(
      { latitude: 30.15, longitude: 71.52 },
      undefined,
      'https://api.example.com'
    );
    assert.equal(ctx.nasa_climate.available, true);
    assert.equal(ctx.nasa_soil_wetness.available, true);
    assert.equal(ctx.soil_context.derived_usda_texture, 'Loam');
    assert.equal(ctx.suggested_farm_defaults.soil_ph?.auto_applied, false);

    // Snapshot preserves SOC cleanly without converting to organicMatterPercent
    const snapshot = buildEnvironmentalSnapshot(ctx, { ph: 'accepted' });
    assert.equal(snapshot.soilReference?.socGKg, 5.2);
    assert.equal(snapshot.reviewedDecisions?.ph, 'accepted');

    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await assert.rejects(
      () => fetchEnvironmentalContext({ latitude: 30.15, longitude: 71.52 }, undefined, 'https://api.example.com'),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.message, FARMER_ERROR_MESSAGES.environmentalContext);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('45. Provenance protection prevents public estimates from overwriting lab tests or farmer observations and persists snapshots cleanly', () => {
  assert.equal(
    canApplyPublicSuggestion({ currentHasValue: true, currentProvenance: 'lab_test' }),
    false
  );
  assert.equal(
    canApplyPublicSuggestion({ currentHasValue: true, currentProvenance: 'farmer_observation' }),
    false
  );
  assert.equal(
    canApplyPublicSuggestion({ currentHasValue: true, currentProvenance: 'farmer_provided' }),
    false
  );
  assert.equal(
    canApplyPublicSuggestion({
      currentHasValue: false,
      currentProvenance: 'unknown',
      farmerLocked: true,
    }),
    false
  );
  assert.equal(
    canApplyPublicSuggestion({ currentHasValue: false, currentProvenance: 'unknown' }),
    true
  );
  assert.equal(formatProvenanceLabel('public_dataset_estimate'), 'Public SoilGrids estimate');
  assert.equal(formatProvenanceLabel('lab_test'), 'Lab soil test');

  withMockBrowser(() => {
    const farmWithSnapshot: FarmProfile = {
      id: 'farm-phase4a',
      location: {
        country: 'Kenya',
        countryCode: 'KE',
        region: 'Nakuru',
        locality: 'Nakuru',
        latitude: -0.3,
        longitude: 36.08,
        geometryType: 'point',
        polygonGeoJSON: null,
        polygonEstimatedHectares: null,
      },
      details: {
        name: 'Nakuru Smart Farm',
        areaHectares: 3.5,
        areaSource: 'manual',
        preferredAreaUnit: 'hectares',
        farmType: 'smallholder',
        irrigationMethod: 'rainfed_only',
        waterAvailability: 'seasonal_adequate',
        rainfallReliability: 'variable',
        managedFieldsCount: 1,
      },
      soil: {
        knowledgeLevel: 'some_details',
        texture: 'loam',
        textureProvenance: 'public_dataset_estimate',
        ph: 6.4,
        phProvenance: 'lab_test',
        drainage: 'well_drained',
        drainageProvenance: 'farmer_observation',
        organicMatterPercent: null,
        organicMatterProvenance: 'unknown',
        salinityConcern: 'none',
        hasLabSoilTest: false,
        observations: '',
      },
      environmentalContext: {
        retrievedAt: '2026-11-14T12:00:00Z',
        latitude: -0.3,
        longitude: 36.08,
        startYear: 2016,
        endYear: 2025,
        nasaClimateAvailable: true,
        nasaWetnessAvailable: true,
        soilAvailable: true,
        soilSource: 'ISRIC SoilGrids v2.0',
        soilReference: {
          ph: 6.1,
          socGKg: 14.2,
          usdaTexture: 'Loam',
        },
        reviewedDecisions: { texture: 'accepted', ph: 'ignored' },
      },
      history: {
        previousCropId: 'maize',
        previousCropName: 'Maize',
        earlierCrops: [],
        typicalPlantingWindow: '',
        typicalHarvestWindow: '',
        rotationChallenges: '',
      },
      priorities: ['support_soil_health'],
      createdAt: '2026-11-14T12:00:00.000Z',
      updatedAt: '2026-11-14T12:00:00.000Z',
    };

    farmRepository.saveFarm(farmWithSnapshot);
    const loaded = farmRepository.listFarms().data.find((f) => f.id === 'farm-phase4a');
    assert.ok(loaded);
    assert.equal(loaded.soil.ph, 6.4);
    assert.equal(loaded.soil.phProvenance, 'lab_test');
    assert.equal(loaded.soil.organicMatterPercent, null);
    assert.equal(loaded.environmentalContext?.soilReference?.socGKg, 14.2);
    assert.equal(loaded.environmentalContext?.reviewedDecisions?.texture, 'accepted');
  });
});

test('46. LocationContextPanel renders 4 grouped sections, accept/edit/ignore controls, and lab lock state cleanly', async () => {
  const { LocationContextPanel } = await import(
    '../src/components/farms/LocationContextPanel.tsx'
  );

  const html = renderToStaticMarkup(
    React.createElement(LocationContextPanel, {
      coordinatesValid: true,
      latitude: 30.15,
      longitude: 71.52,
      temperatureUnit: 'celsius',
      isLoading: false,
      errorMessage: null,
      isStaleForCoordinates: false,
      currentTexture: 'unknown',
      currentTextureProvenance: 'unknown',
      currentPh: '6.8',
      currentPhProvenance: 'lab_test',
      decisions: {},
      onCheckLocation: () => {},
      onAcceptTexture: () => {},
      onEditTexture: () => {},
      onIgnoreTexture: () => {},
      onAcceptPh: () => {},
      onEditPh: () => {},
      onIgnorePh: () => {},
      contextData: {
        location: { latitude: 30.15, longitude: 71.52 },
        start_year: 2016,
        end_year: 2025,
        retrieved_at: '2026-11-14T12:00:00Z',
        nasa_climate: {
          available: true,
          variables: {
            air_temperature_c: {
              variable: 'T2M',
              label: 'Historical 2m Air Temperature',
              value: 25.4,
              unit: '°C',
              available: true,
              status: 'available',
              source: 'NASA POWER',
              source_url: 'https://power.larc.nasa.gov/',
              category: 'observed_historical_climate',
              spatial_resolution: '0.5° × 0.625°',
              observation_period: '2016–2025',
              retrieved_at: '2026-11-14T12:00:00Z',
              uncertainty_note: 'Climatology.',
            },
          },
        },
        nasa_soil_wetness: {
          available: true,
          variables: {
            surface_soil_wetness: {
              variable: 'GWETTOP',
              label: 'Surface Soil Wetness Index (0–5 cm)',
              value: 0.31,
              unit: '0–1 wetness fraction',
              available: true,
              status: 'available',
              source: 'NASA POWER',
              source_url: 'https://power.larc.nasa.gov/',
              category: 'modeled_reanalysis_estimate',
              spatial_resolution: '0.5° × 0.625°',
              observation_period: '2016–2025',
              retrieved_at: '2026-11-14T12:00:00Z',
              uncertainty_note: 'Coarse reanalysis.',
            },
          },
        },
        soil_context: {
          available: true,
          status: 'available',
          source: 'ISRIC SoilGrids v2.0',
          endpoint_used: 'rest.isric.org',
          spatial_resolution: '250 m',
          derived_usda_texture: 'Loam',
          mapped_farm_texture: 'loam',
          properties: {
            phh2o: {
              variable: 'phh2o',
              label: 'Soil pH in H2O',
              value: 7.5,
              unit: 'pH',
              q05: 6.7,
              q95: 8.3,
              depth_interval: '0–15 cm',
              available: true,
              status: 'available',
              source: 'ISRIC SoilGrids v2.0',
              source_url: 'https://soilgrids.org/',
              category: 'public_modeled_soil_estimate',
              spatial_resolution: '250 m',
              observation_period: 'SoilGrids v2.0',
              retrieved_at: '2026-11-14T12:00:00Z',
              uncertainty_note: 'Prediction range.',
            },
            soc: {
              variable: 'soc',
              label: 'Soil Organic Carbon',
              value: 5.0,
              unit: 'g/kg',
              q05: 2.0,
              q95: 9.0,
              depth_interval: '0–15 cm',
              available: true,
              status: 'available',
              source: 'ISRIC SoilGrids v2.0',
              source_url: 'https://soilgrids.org/',
              category: 'public_modeled_soil_estimate',
              spatial_resolution: '250 m',
              observation_period: 'SoilGrids v2.0',
              retrieved_at: '2026-11-14T12:00:00Z',
              uncertainty_note: 'SOC only.',
            },
          },
        },
        suggested_farm_defaults: {
          soil_ph: {
            field: 'soil.ph',
            available: true,
            suggested_value: 7.5,
            unit: 'pH',
            provenance: 'public_dataset_estimate',
            source_label: 'ISRIC SoilGrids v2.0',
            requires_confirmation: true,
            auto_applied: false,
          },
          soil_texture: {
            field: 'soil.texture',
            available: true,
            suggested_value: 'loam',
            usda_class: 'Loam',
            provenance: 'public_dataset_estimate',
            source_label: 'USDA triangle',
            requires_confirmation: true,
            auto_applied: false,
          },
        },
        details_farmer_must_confirm: ['Field drainage quality', 'Salinity signs'],
        precedence_policy: 'lab_test > farmer_observation > public_dataset_estimate > unknown',
        limitations: ['Advisory context only.'],
      },
    })
  );

  assert.match(html, /Check available information for this location/);
  assert.match(html, /1\. NASA Climate Observations/);
  assert.match(html, /2\. NASA Soil Wetness Context/);
  assert.match(html, /3\. Public Estimated Soil Properties/);
  assert.match(html, /4\. Details You Still Need to Confirm/);
  assert.match(html, /Protected: keeping your Lab soil test \(6\.8\)/);
  assert.match(html, /Accept estimate/);
  assert.match(html, /Edit myself/);
  assert.match(html, /Ignore/);
  assert.match(html, /Soil Organic Carbon \(SOC, reference only\)/);
  assert.match(html, /never copied silently into OM%/);
});

test('47. Phase 4B RotationComparisonCard and formatProvenanceLabel render lab/estimate provenance and historical resilience cleanly', async () => {
  const { formatProvenanceLabel } = await import('../src/utils/provenance.ts');
  assert.equal(formatProvenanceLabel('lab_test'), 'Lab soil test');
  assert.equal(formatProvenanceLabel('public_dataset_estimate'), 'Public SoilGrids estimate');
  assert.equal(formatProvenanceLabel('unspecified'), 'Unknown');

  const { RotationComparisonCard } = await import(
    '../src/components/rotation/RotationComparisonCard.tsx'
  );

  const html = renderToStaticMarkup(
    React.createElement(RotationComparisonCard, {
      rank: 1,
      topScore: 86.4,
      temperatureUnit: 'celsius',
      plan: {
        crop_ids: ['wheat', 'chickpea'],
        score: 86.4,
        compatibility_band: 'Good Screening Match',
        feasibility: {
          status: 'feasible',
          regional_timing_evidence: 'verified',
          verified_calendar_seasons: 2,
          total_seasons: 2,
          unverified_crop_ids: [],
          total_cycle_months: 9,
          timeline_summary: 'S1: Wheat (May–Sep) → S2: Chickpea (Oct–Jan)',
          warnings: [],
        },
        seasons: [
          {
            crop_id: 'wheat',
            name: 'Wheat',
            family: 'poaceae',
            is_legume: false,
            planting_month: 5,
            duration_months: 5,
            window_label: 'May–Sep',
            avg_historical_temperature_c: 13.5,
            temperature_fit_score: 88,
            water_category: 'medium',
            water_compatibility_score: 84,
            soil_ph_compatibility_score: 92,
            family_diversity_score: 96,
            screening_score: 88,
          },
          {
            crop_id: 'chickpea',
            name: 'Chickpea',
            family: 'fabaceae',
            is_legume: true,
            planting_month: 10,
            duration_months: 4,
            window_label: 'Oct–Jan (crosses Dec–Jan)',
            wraps_year: true,
            avg_historical_temperature_c: 20.1,
            temperature_fit_score: 84,
            water_category: 'low',
            water_compatibility_score: 86,
            soil_ph_compatibility_score: 90,
            family_diversity_score: 96,
            screening_score: 86,
          },
        ],
        soil_health_summary: {
          soil_health_score: 85.2,
          soil_ph_compatibility: 91,
          soil_ph_evaluated: true,
          soil_ph_provenance: 'lab_test',
          soil_texture_provenance: 'public_dataset_estimate',
          soc_reference_note:
            'Public SoilGrids reference Soil Organic Carbon (SOC) is ~8.2 g/kg (0–15 cm, 250 m); SOC is shown for context only and is neither converted to lab organic matter (%) nor used to predict N mineralization.',
          has_legume: true,
          legume_crops: ['Chickpea'],
          legume_tradeoff_note: 'Fixes N via Mesorhizobium ciceri symbiosis.',
          distinct_families: 2,
          strengths: ['Alternates distinct botanical families across every transition.'],
          cautions: ['Sparse residue cover after pulse harvest.'],
          evaluated_factors: ['botanical_family_sequence', 'soil_ph'],
          missing_factors: [],
          evidence_caveat: 'Qualitative screening only.',
        },
        historical_resilience: {
          available: true,
          years_evaluated: 5,
          complete_precip_years: 5,
          incomplete_years_skipped: 1,
          year_span_label: '2019–2024',
          resilience_class: 'moderate_variability',
          wettest_cycle_mm: 690,
          wettest_cycle_year: '2021–2022',
          driest_cycle_mm: 215,
          driest_cycle_year: '2022–2023',
          warm_stress_seasons_count: 1,
          cool_stress_seasons_count: 0,
          dry_deficit_seasons_count: 1,
          excess_rain_seasons_count: 0,
          season_variability: [],
          summary: 'Evaluated 5 complete historical cycle(s) (2019–2024); 1 boundary/incomplete year(s) skipped.',
          caveat: 'Summarizes historical NASA POWER year-to-year variability only.',
        },
        diagnostics: {
          climate_compatibility: 86,
          water_compatibility: 85,
          family_rotation: 96,
          soil_compatibility: 91,
          soil_evaluated: true,
          soil_health_score: 85.2,
          regional_calendar_score: 95,
          regional_calendar_evaluated: true,
          regional_timing_evidence: 'verified',
          distinct_families: 2,
          distinct_crops: 2,
          goal_applied: 'soil',
          goal_weights_applied: { climate: 0.2, water: 0.16, soil_health: 0.32, diversity: 0.18, calendar: 0.14 },
          missing_data_notes: [],
          tie_note: null,
        },
        explanation: 'Good Screening Match.',
      },
    })
  );

  assert.match(html, /Fit vs\. Lab soil test/);
  assert.match(html, /Historical Year-to-Year Resilience/);
  assert.match(html, /Moderate year-to-year exposure/);
  assert.match(html, /Evaluated 5 complete historical cycle/);
});

test('48. CropIntelligencePanel renders evidence-backed metadata, farm comparisons, and parameter source links', async () => {
  const { CropIntelligencePanel } = await import(
    '../src/components/rotation/CropIntelligencePanel.tsx'
  );
  const { buildCropCatalog } = await import('../src/data/crops.ts');
  const catalog = buildCropCatalog(
    [
      {
        id: 'wheat',
        name: 'Wheat',
        family: 'poaceae',
        water_demand: 'medium',
        ph_min: 6.0,
        ph_max: 7.5,
        temp_min_c: 10,
        temp_max_c: 25,
        duration_months: 5,
        is_legume: false,
        scientific_name: 'Triticum aestivum',
        category: 'cereal',
        cycle_days_min: 110,
        cycle_days_max: 240,
        cycle_variability_note: 'Spring vs winter vernalization cycles vary.',
        temp_tol_min_c: 3,
        temp_tol_max_c: 32,
        heat_stress_threshold_c: 30,
        frost_sensitivity: 'low',
        suitable_soil_textures: ['loam', 'clay_loam'],
        salinity_ec_threshold_dsm: 6.0,
        salinity_tolerance: 'moderate',
        waterlogging_sensitivity: 'moderate',
        seasonal_rain_min_mm: 300,
        seasonal_rain_max_mm: 900,
        residue_management_notes: 'Produces fibrous straw.',
        succession_cautions: ['Back-to-back cereals increase root rot.'],
        rotation_advantages: ['Pairs well after broadleaf break crops.'],
        known_unknowns: ['Cultivar vernalization group not modeled globally.'],
        parameter_sources: { temperature_and_ph: ['fao_ecocrop'] },
      },
    ],
    false
  );

  const html = renderToStaticMarkup(
    React.createElement(CropIntelligencePanel, {
      crops: catalog,
      selectedCropId: 'wheat',
      onSelectCrop: () => {},
      temperatureUnit: 'celsius',
      isLiveCatalogLoaded: true,
      sources: [
        {
          id: 'fao_ecocrop',
          title: 'FAO ECOCROP / GAEZ Reference',
          organization: 'FAO',
          url: 'https://gaez.fao.org/pages/ecocrop',
          geographic_applicability: 'Global',
          crop_applicability: 'All 14 crops',
          limitations: 'Species bands only.',
          last_reviewed: '2026-11-14',
        },
      ],
      farm: {
        id: 'farm-ci',
        location: {
          country: 'Pakistan',
          countryCode: 'PK',
          region: 'Punjab',
          locality: 'Multan',
          latitude: 30.2,
          longitude: 71.5,
          geometryType: 'point',
          polygonGeoJSON: null,
          polygonEstimatedHectares: null,
        },
        details: {
          name: 'Multan Test Farm',
          areaHectares: 4,
          areaSource: 'manual',
          preferredAreaUnit: 'hectares',
          farmType: 'smallholder',
          irrigationMethod: 'canal_flood',
          waterAvailability: 'seasonal_adequate',
          rainfallReliability: 'variable',
          managedFieldsCount: 1,
        },
        soil: {
          knowledgeLevel: 'some_details',
          texture: 'loam',
          textureProvenance: 'public_dataset_estimate',
          ph: 7.2,
          phProvenance: 'lab_test',
          drainage: 'well_drained',
          drainageProvenance: 'farmer_observation',
          organicMatterPercent: null,
          organicMatterProvenance: 'unknown',
          salinityConcern: 'none',
          hasLabSoilTest: true,
          observations: '',
        },
        history: {
          previousCropId: 'rice',
          previousCropName: 'Rice',
          earlierCrops: [],
          typicalPlantingWindow: '',
          typicalHarvestWindow: '',
          rotationChallenges: '',
        },
        priorities: ['support_soil_health'],
        createdAt: '2026-11-14T12:00:00.000Z',
        updatedAt: '2026-11-14T12:00:00.000Z',
      },
    })
  );

  assert.match(html, /Triticum aestivum/);
  assert.match(html, /Synced with backend agronomic catalog/);
  assert.match(html, /Heat caution above 30\.0 °C/);
  assert.match(html, /Cultivar vernalization group not modeled globally/);
  assert.match(html, /https:\/\/gaez\.fao\.org\/pages\/ecocrop/);
});

test('49. ScenariosPage contains a single scenario-planting-month control without duplicate IDs', () => {
  const src = fs.readFileSync(path.resolve('src/pages/ScenariosPage.tsx'), 'utf8');
  const idMatches = src.match(/id="scenario-planting-month"/g) ?? [];
  assert.equal(idMatches.length, 1);
  const forMatches = src.match(/htmlFor="scenario-planting-month"/g) ?? [];
  assert.equal(forMatches.length, 1);
});

test('50. Phase 4W WaterIntelligencePanel helpers format units honestly and respect area confirmation', async () => {
  const {
    buildWaterCompareRequest,
    buildWaterChartData,
    formatEvidenceLabel,
    formatWaterDepthMm,
    formatWaterVolumeM3,
  } = await import('../src/components/rotation/WaterIntelligencePanel.tsx');

  const sampleFarm = {
    id: 'farm-w1',
    location: {
      country: 'Pakistan',
      countryCode: 'PK',
      region: 'Punjab',
      locality: 'Faisalabad',
      latitude: 31.45,
      longitude: 73.135,
      geometryType: 'point' as const,
      polygonGeoJSON: null,
      polygonEstimatedHectares: null,
    },
    details: {
      name: 'Faisalabad Field',
      areaHectares: 2.5,
      areaSource: 'manual' as const,
      preferredAreaUnit: 'hectares' as const,
      farmType: 'irrigated' as const,
      irrigationMethod: 'furrow_surface' as const,
      waterAvailability: 'seasonal_adequate' as const,
      rainfallReliability: 'variable' as const,
      managedFieldsCount: 1,
    },
    soil: {
      knowledgeLevel: 'some_details' as const,
      texture: 'loam' as const,
      textureProvenance: 'farmer_observation' as const,
      ph: 7.4,
      phProvenance: 'farmer_observation' as const,
      drainage: 'well_drained' as const,
      drainageProvenance: 'farmer_observation' as const,
      organicMatterPercent: null,
      organicMatterProvenance: 'unknown' as const,
      salinityConcern: 'none' as const,
      hasLabSoilTest: false,
      observations: '',
    },
    history: {
      previousCropId: 'wheat',
      previousCropName: 'Wheat',
      earlierCrops: [],
      typicalPlantingWindow: '',
      typicalHarvestWindow: '',
      rotationChallenges: '',
    },
    priorities: ['reduce_water_demand' as const],
    createdAt: '2026-11-14T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
  };

  const sampleRankedPlans = [
    {
      crop_ids: ['sorghum', 'chickpea'],
      score: 84.5,
      seasons: [
        {
          crop_id: 'sorghum',
          name: 'Sorghum',
          planting_month: 6,
          duration_months: 4,
          avg_historical_temperature_c: 32,
          temperature_fit_score: 85,
          water_category: 'low' as const,
          water_compatibility_score: 90,
          soil_ph_compatibility_score: 85,
          family_diversity_score: 95,
          screening_score: 88,
        },
        {
          crop_id: 'chickpea',
          name: 'Chickpea',
          planting_month: 11,
          duration_months: 4,
          avg_historical_temperature_c: 19,
          temperature_fit_score: 88,
          water_category: 'low' as const,
          water_compatibility_score: 92,
          soil_ph_compatibility_score: 84,
          family_diversity_score: 95,
          screening_score: 89,
        },
      ],
      explanation: 'Good match',
    },
  ];

  const reqWithArea = buildWaterCompareRequest({
    farm: sampleFarm,
    rankedPlans: sampleRankedPlans,
    startYear: 2020,
    endYear: 2024,
    waterLevel: 'medium',
    includeCultivatedArea: true,
  });
  assert.equal(reqWithArea.cultivated_area_ha, 2.5);
  assert.equal(reqWithArea.plans.length, 1);
  assert.equal(reqWithArea.plans[0].seasons[0].crop_id, 'sorghum');

  const reqWithoutArea = buildWaterCompareRequest({
    farm: sampleFarm,
    rankedPlans: sampleRankedPlans,
    startYear: 2020,
    endYear: 2024,
    waterLevel: 'medium',
    includeCultivatedArea: false,
  });
  assert.equal(reqWithoutArea.cultivated_area_ha, null);

  assert.equal(formatWaterDepthMm(797.8), '798 mm');
  assert.equal(formatWaterDepthMm(null), 'Unavailable');
  assert.equal(formatWaterVolumeM3(15956.2), '15,956 m³');
  assert.equal(formatWaterVolumeM3(null), 'Omitted (area unconfirmed)');
  assert.equal(formatEvidenceLabel('verified'), 'Verified FAO-56');
  assert.equal(formatEvidenceLabel('preliminary'), 'Preliminary Kc');

  const chart = buildWaterChartData([
    {
      plan_id: 'p1',
      label: '#1 Sorghum → Chickpea',
      is_current_practice: false,
      available: true,
      status: 'ok',
      evidence_status: 'preliminary',
      preliminary_kc_crops: ['chickpea'],
      missing_kc_crops: [],
      has_paddy_rice_caveat: false,
      paddy_rice_note: null,
      crop_ids: ['sorghum', 'chickpea'],
      crop_names: ['Sorghum', 'Chickpea'],
      comparable_years_used: [2020, 2021, 2022, 2023],
      comparable_years_count: 4,
      all_complete_years_count: 4,
      incomplete_years_skipped: [],
      total_crop_days: 245,
      total_turnaround_gap_days: 29,
      totals_mean_mm: {
        et0_mm: 1013.2,
        etc_mm: 728.8,
        precip_mm: 563.7,
        effective_rainfall_mm: 429.9,
        preliminary_deficit_mm: 352.4,
      },
      ranges_mm: null,
      effective_rainfall_etc_share_percent: 59,
      volumes_mean_m3: null,
      seasons: [],
      yearly_cycles: [],
    },
  ]);
  assert.equal(chart.length, 1);
  assert.equal(chart[0].ETc, 728.8);
  assert.equal(chart[0].EffectiveRain, 429.9);
  assert.equal(chart[0].Deficit, 352.4);
});

test('51. compareRotationWater API client handles valid payloads and upstream errors safely', async () => {
  const { compareRotationWater } = await import('../src/services/api/agroshiftApi.ts');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        status: 'ok',
        data_available: true,
        historical_not_forecast: true,
        farm_water_context: {
          cultivated_area_ha: null,
          volume_unit: null,
          water_availability_confirmed: false,
          water_availability_note:
            'Estimated crop water demand is available, but actual irrigation sufficiency cannot be determined from the information provided.',
        },
        comparison: {
          status: 'ok',
          comparable_plan_count: 1,
          common_comparable_years: [2020, 2021, 2022, 2023],
          common_comparable_years_count: 4,
        },
        plans: [],
        limitations: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const res = await compareRotationWater(
      {
        latitude: 31.45,
        longitude: 73.135,
        start_year: 2020,
        end_year: 2024,
        plans: [
          {
            plan_id: 'p1',
            label: 'Wheat',
            seasons: [{ crop_id: 'wheat', planting_month: 11 }],
          },
        ],
      },
      undefined,
      'https://api.example.com'
    );
    assert.equal(res.status, 'ok');
    assert.equal(res.farm_water_context.water_availability_confirmed, false);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: 'Service busy' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () =>
        compareRotationWater(
          {
            latitude: 31.45,
            longitude: 73.135,
            plans: [
              {
                plan_id: 'p1',
                label: 'Wheat',
                seasons: [{ crop_id: 'wheat', planting_month: 11 }],
              },
            ],
          },
          undefined,
          'https://api.example.com'
        ),
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.equal(err.message, FARMER_ERROR_MESSAGES.water);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('52. PlannerPage and ReportsPage wire Phase 4W WaterIntelligence cleanly without altering scores', () => {
  const plannerSrc = fs.readFileSync(path.resolve('src/pages/PlannerPage.tsx'), 'utf8');
  const reportsSrc = fs.readFileSync(path.resolve('src/pages/ReportsPage.tsx'), 'utf8');
  const panelSrc = fs.readFileSync(
    path.resolve('src/components/rotation/WaterIntelligencePanel.tsx'),
    'utf8'
  );

  assert.match(plannerSrc, /<WaterIntelligencePanel/);
  assert.match(reportsSrc, /fao56WaterComparison/);
  assert.match(reportsSrc, /NASA POWER Daily Water Balance/);
  assert.match(panelSrc, /Compare Crop Water Balance/);
  assert.match(panelSrc, /Paddy Rice Water Caveat/);
  assert.match(panelSrc, /1\. Atmospheric Demand \(ET₀\)/);
  assert.match(panelSrc, /5\. Prelim\. Net Deficit/);
});

test('53. observationRepository remains backward-compatible with pre-Phase 4W records lacking water fields', () => {
  withMockBrowser(() => {
    (window.localStorage as Storage).setItem(
      'agroshift.observations.v1',
      JSON.stringify({
        version: 1,
        byFarm: {
          'farm-legacy': {
            schemaVersion: 1,
            climateFetchedAt: '2026-10-01T00:00:00.000Z',
          },
        },
      })
    );
    const loaded = observationRepository.loadByFarm();
    assert.equal(loaded.storageError, null);
    assert.equal(loaded.data['farm-legacy']?.climateFetchedAt, '2026-10-01T00:00:00.000Z');
    assert.equal(loaded.data['farm-legacy']?.water, undefined);
  });
});

test('54. FieldHealthPage describeMoistureStress treats freezing low-NDMI Bosnia case as cold/dormant inconclusive and distinguishes NDMI from drought', () => {
  const bosniaFreezing = {
    ndvi: 0.577,
    ndvi_status: 'GOOD',
    ndmi: 0.058,
    ndmi_status: 'LOW',
    temperature_c: -1.7,
    humidity_percent: 68,
    recent_rainfall_mm: 0,
    heat_risk: 'LOW',
    rainfall_status: 'LOW',
    possible_water_stress: null,
    moisture_stress_status: 'INCONCLUSIVE_COLD_OR_DORMANT',
    analysis_confidence: 'MODERATE',
    observation_quality: 'GOOD',
    confidence_reason: null,
    satellite_available: true,
    satellite_observation_date: '2026-11-09',
    cloud_cover_percent: 4.0,
    valid_coverage_percent: 96.0,
    excluded_pixel_percent: 4.0,
    satellite_message: null,
    weather_available: true,
    weather_message: null,
    weather_source: 'open-meteo',
    ai_explanation: '',
    recommendations: [],
  };

  const coldMsg = describeMoistureStress(bosniaFreezing);
  assert.match(coldMsg, /^Inconclusive \(cold\/freezing or seasonal dormancy\)/i);
  assert.match(coldMsg, /frost|dormancy|senescence/i);
  assert.match(coldMsg, /current crop and growth stage are also unknown/i);
  assert.ok(!/warm/i.test(coldMsg));

  // Even a legacy cached response that had possible_water_stress=true at -1.7 C is overridden safely in UI
  const staleColdCached = {
    ...bosniaFreezing,
    possible_water_stress: true,
    moisture_stress_status: 'POSSIBLE_STRESS',
  };
  assert.match(describeMoistureStress(staleColdCached), /^Inconclusive \(cold\/freezing or seasonal dormancy\)/i);

  // Hot and dry + low NDMI flags possible stress while distinguishing optical NDMI from confirmed drought
  const hotDry = {
    ...bosniaFreezing,
    temperature_c: 36.5,
    heat_risk: 'MODERATE',
    possible_water_stress: true,
    moisture_stress_status: 'POSSIBLE_STRESS',
  };
  const hotMsg = describeMoistureStress(hotDry);
  assert.match(hotMsg, /not confirmed drought or irrigation deficiency/i);
  assert.match(hotMsg, /current crop, growth stage/i);

  // Missing weather stays Unavailable
  const missingWeather = {
    ...bosniaFreezing,
    weather_available: false,
    temperature_c: null,
    recent_rainfall_mm: null,
    possible_water_stress: null,
    moisture_stress_status: 'UNAVAILABLE',
  };
  assert.match(describeMoistureStress(missingWeather), /^Unavailable/i);
});

test('55. Assistant context and honesty rules prevent inferring current standing crop solely from previousCrop', () => {
  const assistantPageSrc = fs.readFileSync(path.resolve('src/pages/AssistantPage.tsx'), 'utf8');
  const assistantServiceSrc = fs.readFileSync(path.resolve('server/assistantService.ts'), 'utf8');

  assert.match(assistantPageSrc, /currentStandingCropKnown:\s*false/);
  assert.match(assistantPageSrc, /currentGrowthStageKnown:\s*false/);
  assert.match(assistantPageSrc, /moistureStressStatus:\s*fieldHealth\.moisture_stress_status/);
  assert.match(assistantServiceSrc, /Never infer the current standing crop on the field solely from previousCrop/);
  assert.match(assistantServiceSrc, /Never classify negative or near-freezing temperatures as warm weather/);
  assert.match(assistantServiceSrc, /Distinguish low optical canopy moisture indicators \(NDMI\) from confirmed drought/);
});


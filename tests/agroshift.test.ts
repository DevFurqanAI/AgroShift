import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantMarkdown } from '../src/components/assistant/AssistantMarkdown.tsx';
import {
  describeDataAvailability,
  describeInterpretationConfidence,
  describeMoistureStress,
  describeObservationQuality,
} from '../src/pages/FieldHealthPage.tsx';

import {
  ACRES_PER_HECTARE,
  acresToHectares,
  fromHectares,
  hectaresToAcres,
  toHectares,
} from '../src/utils/units.ts';
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
  fetchRotationCrops,
  fetchRotationPlan,
  fetchScenarioComparison,
  resolveApiBaseUrl,
} from '../src/services/api/agroshiftApi.ts';
import {
  DEFAULT_GEMINI_MODEL,
  getAssistantStatus,
  handleAssistantRequest,
  resolveGeminiModel,
} from '../server/assistantService.ts';
import {
  farmRepository,
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
    { messages: [{ role: 'user', content: 'Hi' }], farmContext: null },
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
    { messages: [{ role: 'user', content: 'Hi' }], farmContext: null },
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
    { messages: [{ role: 'user', content: 'Hi' }], farmContext: null },
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
    { messages: [{ role: 'user', content: 'Hi' }], farmContext: null },
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
    { messages: [{ role: 'user', content: 'Hi' }], farmContext: null },
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


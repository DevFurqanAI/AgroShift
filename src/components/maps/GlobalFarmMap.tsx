import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Pentagon,
  Search,
  Trash2,
  Undo2,
  Loader2,
  AlertCircle,
  Crosshair,
  LocateFixed,
} from 'lucide-react';
import {
  searchPlaces,
  type PlaceSearchCandidate,
} from '../../services/geocoding/nominatimService';
import type { GeoJSONPolygon } from '../../types/farm';
import { computePolygonMetrics, type LatLonPoint } from '../../utils/geo';
import { hectaresToAcres } from '../../utils/units';

interface GlobalFarmMapProps {
  latitude: number | null;
  longitude: number | null;
  polygonGeoJSON: GeoJSONPolygon | null;
  geometryType: 'point' | 'polygon';
  searchCountryCode?: string;
  searchLanguage?: string;
  focusTarget?: { lat: number; lon: number; zoom: number } | null;
  readOnly?: boolean;
  heightClass?: string;
  onPointChange?: (lat: number, lon: number, source: 'map_click' | 'device_geolocation') => void;
  onSearchSelect?: (candidate: PlaceSearchCandidate) => void;
  onPolygonChange?: (
    polygon: GeoJSONPolygon | null,
    estimatedHectares: number | null,
    representativePoint: LatLonPoint | null,
    validationError: string | null
  ) => void;
  onModeChange?: (mode: 'point' | 'polygon') => void;
}

function createPinIcon(color = '#14532D') {
  return L.divIcon({
    className: 'agroshift-pin-icon',
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:${color};border:3px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;"><div style="width:6px;height:6px;border-radius:9999px;background:#10B981;"></div></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function createVertexIcon() {
  return L.divIcon({
    className: 'agroshift-vertex-icon',
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:#ffffff;border:2.5px solid #16A34A;box-shadow:0 1px 4px rgba(0,0,0,0.3);cursor:grab;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function GlobalFarmMap({
  latitude,
  longitude,
  polygonGeoJSON,
  geometryType,
  searchCountryCode,
  searchLanguage,
  focusTarget,
  readOnly = false,
  heightClass = 'h-[380px] sm:h-[440px]',
  onPointChange,
  onSearchSelect,
  onPolygonChange,
  onModeChange,
}: GlobalFarmMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  const vertexMarkersRef = useRef<L.Marker[]>([]);

  const [drawMode, setDrawMode] = useState<'point' | 'polygon'>(geometryType);
  const [vertices, setVertices] = useState<Array<[number, number]>>(() => {
    if (polygonGeoJSON?.coordinates?.[0]?.length) {
      const ring = polygonGeoJSON.coordinates[0];
      return ring.slice(0, -1).map(([lon, lat]) => [lat, lon] as [number, number]);
    }
    return [];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const onPointChangeRef = useRef(onPointChange);
  onPointChangeRef.current = onPointChange;
  const onPolygonChangeRef = useRef(onPolygonChange);
  onPolygonChangeRef.current = onPolygonChange;

  useEffect(() => {
    setDrawMode(geometryType);
  }, [geometryType]);

  // Sync external polygon clear (e.g. if parent resets polygonGeoJSON to null while not drawing)
  useEffect(() => {
    if (polygonGeoJSON === null && geometryType === 'point' && vertices.length > 0) {
      setVertices([]);
    }
  }, [polygonGeoJSON, geometryType, vertices.length]);

  const emitPolygonUpdate = (nextVertices: Array<[number, number]>) => {
    if (nextVertices.length === 0) {
      onPolygonChangeRef.current?.(null, null, null, null);
      return;
    }
    if (nextVertices.length < 3) {
      onPolygonChangeRef.current?.(
        null,
        null,
        null,
        'Add at least 3 boundary corners to complete the field polygon.'
      );
      return;
    }
    const metrics = computePolygonMetrics(nextVertices);
    onPolygonChangeRef.current?.(
      metrics.geojson,
      metrics.estimatedHectares,
      metrics.representativePoint,
      metrics.error
    );
  };

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialLat = latitude ?? 20;
    const initialLon = longitude ?? 10;
    const initialZoom = latitude !== null && longitude !== null ? 13 : 2;

    const map = L.map(containerRef.current, {
      center: [initialLat, initialLon],
      zoom: initialZoom,
      zoomControl: true,
      tapHold: true,
    });

    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });

    tileLayer.on('tileerror', () => setTileError(true));
    tileLayer.on('tileload', () => setTileError(false));
    tileLayer.addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (readOnlyRef.current) return;
      const lat = Number(e.latlng.lat.toFixed(6));
      const lon = Number(e.latlng.lng.toFixed(6));

      if (drawModeRef.current === 'point') {
        onPointChangeRef.current?.(lat, lon, 'map_click');
      } else {
        setVertices((prev) => {
          const next = [...prev, [lat, lon] as [number, number]];
          emitPolygonUpdate(next);
          return next;
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pan map when focusTarget changes explicitly
  useEffect(() => {
    if (!mapRef.current || !focusTarget) return;
    mapRef.current.setView([focusTarget.lat, focusTarget.lon], focusTarget.zoom, {
      animate: true,
    });
  }, [focusTarget]);

  // Sync point marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    if (
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude)
    ) {
      const marker = L.marker([latitude, longitude], {
        icon: createPinIcon('#14532D'),
        draggable: !readOnly && drawMode === 'point',
      }).addTo(map);

      if (!readOnly && drawMode === 'point') {
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          onPointChangeRef.current?.(
            Number(pos.lat.toFixed(6)),
            Number(pos.lng.toFixed(6)),
            'map_click'
          );
        });
      }

      markerRef.current = marker;
    }
  }, [latitude, longitude, readOnly, drawMode]);

  const polygonMetrics = computePolygonMetrics(vertices);

  // Sync polygon + editable vertices
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygonLayerRef.current) {
      polygonLayerRef.current.remove();
      polygonLayerRef.current = null;
    }
    vertexMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];

    if (vertices.length >= 2) {
      const isInvalid = vertices.length >= 3 && !polygonMetrics.valid;
      const poly = L.polygon(vertices, {
        color: isInvalid ? '#DC2626' : '#16A34A',
        weight: 2.5,
        fillColor: isInvalid ? '#DC2626' : '#10B981',
        fillOpacity: isInvalid ? 0.14 : 0.2,
      }).addTo(map);
      polygonLayerRef.current = poly;
    }

    if (!readOnly && drawMode === 'polygon') {
      vertexMarkersRef.current = vertices.map(([lat, lon], idx) => {
        const vm = L.marker([lat, lon], {
          icon: createVertexIcon(),
          draggable: true,
        }).addTo(map);

        vm.on('dragend', () => {
          const pos = vm.getLatLng();
          setVertices((prev) => {
            const next = prev.map((pt, i) =>
              i === idx
                ? ([Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))] as [
                    number,
                    number,
                  ])
                : pt
            );
            emitPolygonUpdate(next);
            return next;
          });
        });

        return vm;
      });
    }
  }, [vertices, readOnly, drawMode, polygonMetrics.valid]);

  const handleModeSwitch = (mode: 'point' | 'polygon') => {
    setDrawMode(mode);
    onModeChange?.(mode);
  };

  const handleUndoVertex = () => {
    setVertices((prev) => {
      const next = prev.slice(0, -1);
      emitPolygonUpdate(next);
      return next;
    });
  };

  const handleClearPolygon = () => {
    setVertices([]);
    onPolygonChange?.(null, null, null, null);
  };

  const handleCenterOnSelection = () => {
    if (!mapRef.current) return;
    if (polygonLayerRef.current) {
      mapRef.current.fitBounds(polygonLayerRef.current.getBounds(), { padding: [32, 32] });
    } else if (latitude !== null && longitude !== null) {
      mapRef.current.setView([latitude, longitude], 14, { animate: true });
    }
  };

  const handleUseDeviceLocation = () => {
    if (readOnly) return;
    setGeoError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Device location is not supported in this browser. Search or click on the map instead.');
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoLoading(false);
        const lat = Number(position.coords.latitude.toFixed(6));
        const lon = Number(position.coords.longitude.toFixed(6));
        if (mapRef.current) {
          mapRef.current.setView([lat, lon], 15, { animate: true });
        }
        setDrawMode('point');
        onModeChange?.('point');
        onPointChange?.(lat, lon, 'device_geolocation');
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission was declined. You can search for a place or click on the map.');
        } else {
          setGeoError('Could not read your current device location. Please search or click on the map.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handlePlaceSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await searchPlaces(q, {
        countryCode: searchCountryCode,
        language: searchLanguage,
      });
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError(
          'No matching locations found. Try a nearby town, district, or clear the country filter.'
        );
      }
    } catch (err) {
      console.error('[AgroShift Map] Place search failed:', err);
      setSearchError(
        'Location search could not be reached right now. You can click the map or enter coordinates manually.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item: PlaceSearchCandidate) => {
    if (mapRef.current) {
      mapRef.current.setView([item.latitude, item.longitude], 13, { animate: true });
    }
    if (!readOnly) {
      if (onSearchSelect) {
        onSearchSelect(item);
      } else if (drawMode === 'point') {
        onPointChange?.(item.latitude, item.longitude, 'map_click');
      }
    }
    setSearchResults([]);
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Place Search (Submitted explicitly, never per keystroke) */}
          <form onSubmit={handlePlaceSearch} className="relative flex-1 max-w-xl">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search village, town, district, or address..."
                  aria-label="Search location on map"
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 text-[15px] rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#0B1310] text-[#172B22] dark:text-[#E8F1EC] focus:outline-none focus:ring-2 focus:ring-[#16A34A]"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="min-h-[44px] px-4 py-2 text-[14px] font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#172B22] dark:text-[#E8F1EC] hover:bg-[#F8FAF7] dark:hover:bg-[#182821] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
              <button
                type="button"
                onClick={handleUseDeviceLocation}
                disabled={geoLoading}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 text-[13.5px] font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#14532D] dark:text-[#10B981] hover:bg-[#F8FAF7] dark:hover:bg-[#182821] transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {geoLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LocateFixed className="w-4 h-4" />
                )}
                Use My Location
              </button>
            </div>

            {searchResults.length > 0 && (
              <ul className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] shadow-lg divide-y divide-[#E2E8F0] dark:divide-[#1E2E26] max-h-56 overflow-y-auto">
                {searchResults.map((res) => (
                  <li key={res.placeId}>
                    <button
                      type="button"
                      onClick={() => handleSelectSearchResult(res)}
                      className="w-full min-h-[42px] text-left px-3.5 py-2.5 text-[13.5px] text-[#172B22] dark:text-[#E8F1EC] hover:bg-[#F8FAF7] dark:hover:bg-[#182821] transition-colors"
                    >
                      {res.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>

          {/* Point vs Polygon Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-1 rounded-lg bg-[#E2E8F0]/60 dark:bg-[#182821]">
              <button
                type="button"
                onClick={() => handleModeSwitch('point')}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-[13.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  drawMode === 'point'
                    ? 'bg-white dark:bg-[#111D18] text-[#14532D] dark:text-[#10B981] shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#172B22] dark:hover:text-[#E8F1EC]'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Farm Point
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('polygon')}
                className={`inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-[13.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
                  drawMode === 'polygon'
                    ? 'bg-white dark:bg-[#111D18] text-[#14532D] dark:text-[#10B981] shadow-xs'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#172B22] dark:hover:text-[#E8F1EC]'
                }`}
              >
                <Pentagon className="w-4 h-4" />
                Draw Boundary
              </button>
            </div>

            {drawMode === 'polygon' && (
              <>
                <button
                  type="button"
                  onClick={handleUndoVertex}
                  disabled={vertices.length === 0}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-[13.5px] font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#172B22] dark:text-[#E8F1EC] hover:bg-[#F8FAF7] disabled:opacity-40 whitespace-nowrap"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={handleClearPolygon}
                  disabled={vertices.length === 0}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-[13.5px] font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#DC2626] hover:bg-[#DC2626]/5 disabled:opacity-40 whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleCenterOnSelection}
              title="Center map on selection"
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-[13.5px] font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] text-[#64748B] dark:text-[#94A3B8] hover:text-[#172B22] dark:hover:text-[#E8F1EC] whitespace-nowrap"
            >
              <Crosshair className="w-4 h-4" />
              Center
            </button>
          </div>
        </div>
      )}

      {geoError && (
        <div className="flex items-center gap-2 text-[13.5px] as-text-warning">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{geoError}</span>
        </div>
      )}

      {searchError && (
        <div className="flex items-center gap-2 text-[13.5px] as-text-warning">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{searchError}</span>
        </div>
      )}

      {!readOnly && drawMode === 'polygon' && polygonMetrics.error && vertices.length >= 3 && (
        <div role="alert" className="flex items-center gap-2 text-[13.5px] font-medium as-text-danger">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{polygonMetrics.error}</span>
        </div>
      )}

      {tileError && (
        <div className="flex items-center gap-2 text-[13.5px] as-text-warning">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Map background tiles could not load cleanly. Coordinate selection and manual entry still work.
          </span>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#E8EFE9] dark:bg-[#111D18]">
        <div ref={containerRef} className={`w-full ${heightClass}`} />
      </div>

      {/* Mode & Geometry Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[13px] text-[#64748B] dark:text-[#94A3B8]">
        <span>
          {readOnly
            ? geometryType === 'polygon'
              ? 'Showing saved field boundary polygon and farm reference point.'
              : 'Showing saved farm reference point.'
            : drawMode === 'point'
              ? 'Click on the map, drag the pin, search a place, or click Use My Location.'
              : 'Click on the map to add boundary corners (minimum 3 points, non-crossing). Drag corners to adjust.'}
        </span>

        {polygonMetrics.valid && polygonMetrics.estimatedHectares !== null && (
          <span className="font-semibold tabular-nums text-[#14532D] dark:text-[#10B981]">
            Estimated land area: ~{polygonMetrics.estimatedHectares.toFixed(2)} ha (
            {hectaresToAcres(polygonMetrics.estimatedHectares).toFixed(2)} ac)
          </span>
        )}
      </div>
    </div>
  );
}

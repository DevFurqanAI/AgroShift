export interface CountryOption {
  code: string;
  name: string;
  /** Used ONLY to pan the map view when the user picks a country from the dropdown. */
  mapFocusLat: number;
  mapFocusLon: number;
}

export const COUNTRIES: CountryOption[] = [
  { code: 'AR', name: 'Argentina', mapFocusLat: -34.6037, mapFocusLon: -63.6167 },
  { code: 'AU', name: 'Australia', mapFocusLat: -25.2744, mapFocusLon: 133.7751 },
  { code: 'BD', name: 'Bangladesh', mapFocusLat: 23.685, mapFocusLon: 90.3563 },
  { code: 'BR', name: 'Brazil', mapFocusLat: -14.235, mapFocusLon: -51.9253 },
  { code: 'CA', name: 'Canada', mapFocusLat: 52.1332, mapFocusLon: -106.67 },
  { code: 'CN', name: 'China', mapFocusLat: 35.8617, mapFocusLon: 104.1954 },
  { code: 'CO', name: 'Colombia', mapFocusLat: 4.5709, mapFocusLon: -74.2973 },
  { code: 'EG', name: 'Egypt', mapFocusLat: 26.8206, mapFocusLon: 30.8025 },
  { code: 'ET', name: 'Ethiopia', mapFocusLat: 9.145, mapFocusLon: 40.4897 },
  { code: 'FR', name: 'France', mapFocusLat: 46.2276, mapFocusLon: 2.2137 },
  { code: 'DE', name: 'Germany', mapFocusLat: 51.1657, mapFocusLon: 10.4515 },
  { code: 'GH', name: 'Ghana', mapFocusLat: 7.9465, mapFocusLon: -1.0232 },
  { code: 'IN', name: 'India', mapFocusLat: 21.1458, mapFocusLon: 79.0882 },
  { code: 'ID', name: 'Indonesia', mapFocusLat: -0.7893, mapFocusLon: 113.9213 },
  { code: 'IT', name: 'Italy', mapFocusLat: 41.8719, mapFocusLon: 12.5674 },
  { code: 'JP', name: 'Japan', mapFocusLat: 36.2048, mapFocusLon: 138.2529 },
  { code: 'KE', name: 'Kenya', mapFocusLat: -0.0236, mapFocusLon: 37.9062 },
  { code: 'MW', name: 'Malawi', mapFocusLat: -13.2543, mapFocusLon: 34.3015 },
  { code: 'MX', name: 'Mexico', mapFocusLat: 23.6345, mapFocusLon: -102.5528 },
  { code: 'MA', name: 'Morocco', mapFocusLat: 31.7917, mapFocusLon: -7.0926 },
  { code: 'NL', name: 'Netherlands', mapFocusLat: 52.1326, mapFocusLon: 5.2913 },
  { code: 'NG', name: 'Nigeria', mapFocusLat: 9.082, mapFocusLon: 8.6753 },
  { code: 'PK', name: 'Pakistan', mapFocusLat: 30.3753, mapFocusLon: 69.3451 },
  { code: 'PE', name: 'Peru', mapFocusLat: -9.19, mapFocusLon: -75.0152 },
  { code: 'PH', name: 'Philippines', mapFocusLat: 12.8797, mapFocusLon: 121.774 },
  { code: 'PL', name: 'Poland', mapFocusLat: 51.9194, mapFocusLon: 19.1451 },
  { code: 'ZA', name: 'South Africa', mapFocusLat: -30.5595, mapFocusLon: 22.9375 },
  { code: 'ES', name: 'Spain', mapFocusLat: 40.4637, mapFocusLon: -3.7492 },
  { code: 'TZ', name: 'Tanzania', mapFocusLat: -6.369, mapFocusLon: 34.8888 },
  { code: 'TH', name: 'Thailand', mapFocusLat: 15.87, mapFocusLon: 100.9925 },
  { code: 'TR', name: 'Turkey', mapFocusLat: 38.9637, mapFocusLon: 35.2433 },
  { code: 'UG', name: 'Uganda', mapFocusLat: 1.3733, mapFocusLon: 32.2903 },
  { code: 'UA', name: 'Ukraine', mapFocusLat: 48.3794, mapFocusLon: 31.1656 },
  { code: 'GB', name: 'United Kingdom', mapFocusLat: 54.0, mapFocusLon: -2.0 },
  { code: 'US', name: 'United States', mapFocusLat: 39.8283, mapFocusLon: -98.5795 },
  { code: 'VN', name: 'Vietnam', mapFocusLat: 14.0583, mapFocusLon: 108.2772 },
  { code: 'ZM', name: 'Zambia', mapFocusLat: -13.1339, mapFocusLon: 27.8493 },
  { code: 'OTHER', name: 'Other / Select on Map', mapFocusLat: 20, mapFocusLon: 0 },
];

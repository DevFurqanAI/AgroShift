"""Regional crop planting calendar service grounded in FAO, GIEWS, USDA, and national agricultural extension references.

Supports Northern Hemisphere, Southern Hemisphere, and Equatorial bimodal seasons,
circular Dec-Jan year-crossing windows, and honest fallback when regional data are unverified.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class RegionalCropWindow:
    country_code: str
    country_name: str
    region: str | None
    agroecological_zone: str
    hemisphere: str  # 'northern' | 'southern' | 'equatorial_bimodal'
    season_name: str
    crop_id: str
    planting_months: tuple[int, ...]
    harvest_months: tuple[int, ...]
    source_id: str
    notes: str = ''


# Grounded regional crop calendar entries compiled from FAO Crop Calendar,
# FAO GIEWS Country Briefs, USDA NASS Handbook 628, Punjab/Sindh Extension,
# ABARES/GRDC Australia, and KALRO/FAO Kenya bimodal calendars.
REGIONAL_WINDOWS: tuple[RegionalCropWindow, ...] = (
    # ---------------- PAKISTAN (PK) — Punjab & Sindh Rabi / Kharif ----------------
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Rabi (Winter)', 'wheat', (10, 11, 12), (4, 5), 'fao_giews_briefs',
        'Peak wheat sowing in November; late sowing may extend into Dec/early Jan after cotton.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Rabi (Winter)', 'chickpea', (10, 11), (3, 4), 'fao_crop_calendar',
        'Winter pulse (gram) mainly in rainfed/thal belts.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Rabi (Winter)', 'lentil', (10, 11), (4,), 'fao_crop_calendar',
        'Masoor winter pulse planted Oct–Nov and harvested April.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Rabi (Winter)', 'canola', (10, 11), (3, 4), 'fao_crop_calendar',
        'Punjab optimal sowing October; Sindh extends to November.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Autumn Potato', 'potato', (10, 11), (12, 1, 2), 'fao_crop_calendar',
        'Main plains autumn crop sown Oct–Nov, harvested Dec–Feb.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Spring Potato', 'potato', (1, 2), (4,), 'fao_crop_calendar',
        'Plains spring potato sown Jan–Feb, harvested April.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Spring Sunflower', 'sunflower', (1, 2), (5, 6), 'fao_crop_calendar',
        'Spring oilseed planted Jan–Feb; autumn crop follows in Aug–Sep.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Autumn Sunflower', 'sunflower', (8, 9), (11, 12), 'fao_crop_calendar',
        'Autumn planting window Aug–Sep, harvested Nov–Dec.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Kharif (Monsoon)', 'rice', (6, 7), (9, 10, 11, 12), 'fao_giews_briefs',
        'Transplanted Jun–Jul (nurseries May); harvested Sep–Dec.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Kharif (Summer)', 'cotton', (4, 5, 6), (9, 10, 11, 12), 'fao_giews_briefs',
        'Sown Apr–Jun (earlier in Sindh); picking stretches Sep–Dec.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Kharif (Monsoon)', 'maize', (7, 8), (10, 11), 'fao_giews_briefs',
        'Autumn/Kharif maize sown Jul–Aug.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Spring Maize', 'maize', (2, 3), (6, 7), 'fao_crop_calendar',
        'Irrigated spring maize sown Feb–Mar, harvested Jun–Jul.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Kharif (Monsoon)', 'sorghum', (6, 7), (9, 10), 'fao_crop_calendar',
        'Jowar sown Jun–Jul, harvested Sep–Oct.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Kharif (Monsoon)', 'millet', (6, 7), (9, 10), 'fao_crop_calendar',
        'Bajra sown Jun–Jul with monsoon onset, harvested Sep–Oct.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Kharif (Monsoon)', 'cowpea', (6, 7), (9, 10), 'fao_crop_calendar',
        'Warm-season Kharif pulse.',
    ),
    RegionalCropWindow(
        'PK', 'Pakistan', 'Punjab / Indus Plains', 'Semi-arid & Irrigated Indus Basin',
        'northern', 'Spring / Early Kharif', 'tomato', (2, 3), (5, 6), 'fao_crop_calendar',
        'Plains spring tomato crop; autumn nursery Jul–Aug.',
    ),

    # ---------------- INDIA (IN) — Rabi / Kharif ----------------
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi (Winter)', 'wheat', (10, 11, 12), (3, 4, 5), 'fao_giews_briefs',
        'Winter wheat planted Oct–Dec, harvested Mar–May.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Kharif (Monsoon)', 'rice', (6, 7, 8), (9, 10, 11, 12), 'fao_giews_briefs',
        'Main monsoon paddy sown Jun–Aug.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi Rice', 'rice', (11, 12, 1, 2), (4, 5, 6), 'fao_giews_briefs',
        'Winter/summer irrigated rice belt in eastern & southern zones.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Kharif (Monsoon)', 'soybean', (6, 7), (9, 10), 'fao_giews_briefs',
        'Central India rainfed Kharif oilseed-legume planted with monsoon onset.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Kharif (Monsoon)', 'maize', (6, 7), (9, 10), 'fao_giews_briefs',
        'Kharif maize Jun–Jul; Rabi maize exists Oct–Nov in irrigated belts.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi Maize', 'maize', (10, 11), (2, 3), 'fao_giews_briefs',
        'Winter irrigated maize season.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi (Winter)', 'chickpea', (10, 11), (2, 3, 4), 'fao_crop_calendar',
        'Major winter pulse following Kharif cereals.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi (Winter)', 'lentil', (10, 11), (3, 4), 'fao_crop_calendar',
        'Winter pulse in northern/central plains.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Kharif (Monsoon)', 'sorghum', (6, 7), (9, 10), 'fao_crop_calendar',
        'Rainfed Kharif sorghum.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Kharif (Monsoon)', 'millet', (6, 7), (9, 10), 'fao_crop_calendar',
        'Bajra Kharif monsoon dryland cereal.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Kharif (Summer)', 'cotton', (5, 6), (10, 11, 12), 'fao_crop_calendar',
        'Sown May–Jun.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi (Winter)', 'canola', (10, 11), (2, 3), 'fao_crop_calendar',
        'Rapeseed/mustard group planted Oct–Nov.',
    ),
    RegionalCropWindow(
        'IN', 'India', None, 'Indo-Gangetic & Peninsular Cropping Belts',
        'northern', 'Rabi (Winter)', 'potato', (10, 11), (1, 2, 3), 'fao_crop_calendar',
        'Plains winter potato.',
    ),

    # ---------------- AUSTRALIA (AU) — Southern Hemisphere Winter & Summer ----------------
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Winter Crop', 'wheat', (4, 5, 6, 7), (10, 11, 12, 1), 'fao_giews_briefs',
        'Southern Hemisphere winter wheat planted Apr–Jul, harvested Oct–Jan.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Winter Crop', 'canola', (4, 5), (10, 11, 12, 1), 'fao_crop_calendar',
        'Broadacre winter break crop planted Apr–May, harvested late spring/early summer.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Winter Crop', 'chickpea', (4, 5, 6), (10, 11, 12, 1), 'fao_crop_calendar',
        'Northern NSW & Queensland winter pulse planted Apr–Jun, harvested Oct–Jan.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Summer Crop', 'sorghum', (9, 10, 11, 12, 1), (2, 3, 4, 5, 6), 'fao_crop_calendar',
        'Queensland/NSW summer grain sorghum planted Sep–Jan, harvested Feb–Jun.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Summer Crop', 'cotton', (9, 10, 11), (3, 4, 5, 6), 'fao_crop_calendar',
        'Spring-planted summer cotton Sep–Nov, picked Mar–Jun.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Summer Crop', 'maize', (10, 11, 12), (4, 5, 6), 'fao_giews_briefs',
        'Summer maize Oct–Dec, harvested Apr–Jun.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Summer Crop', 'soybean', (10, 11, 12), (4, 5, 6), 'fao_giews_briefs',
        'Summer legume planted Oct–Dec, harvested Apr–Jun.',
    ),
    RegionalCropWindow(
        'AU', 'Australia', None, 'Southern Hemisphere Grain & Cotton Belts',
        'southern', 'Summer Crop', 'rice', (10, 11), (3, 4, 5), 'fao_giews_briefs',
        'Riverina irrigated spring-sown rice Oct–Nov, harvested Mar–May.',
    ),

    # ---------------- BRAZIL (BR) — Southern Hemisphere Summer / Safrinha / Winter ----------------
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'First (Summer) Crop', 'soybean', (9, 10, 11, 12), (1, 2, 3, 4, 5), 'fao_giews_briefs',
        'Main spring-sown soybean Sep–Dec, harvested Jan–May.',
    ),
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'First (Summer) Crop', 'maize', (9, 10, 11, 12), (2, 3, 4, 5), 'fao_giews_briefs',
        'First summer maize crop Sep–Dec.',
    ),
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'Second (Safrinha) Crop', 'maize', (1, 2, 3), (6, 7, 8, 9), 'fao_giews_briefs',
        'Second-season maize planted Jan–Mar immediately following soybean harvest.',
    ),
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'Winter Crop', 'wheat', (5, 6, 7, 8), (9, 10, 11, 12), 'fao_giews_briefs',
        'Southern Brazil winter wheat May–Aug, harvested Sep–Dec.',
    ),
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'First (Summer) Crop', 'rice', (9, 10, 11, 12), (2, 3, 4, 5), 'fao_giews_briefs',
        'Main rice crop Sep–Dec.',
    ),
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'Safrinha / Summer', 'sorghum', (1, 2, 3), (6, 7, 8), 'fao_crop_calendar',
        'Commonly planted in late-wet safrinha succession after soybean.',
    ),
    RegionalCropWindow(
        'BR', 'Brazil', None, 'Cerrado & Southern Subtropical Cropping Zones',
        'southern', 'Main / Safrinha Cotton', 'cotton', (12, 1, 2), (6, 7, 8, 9), 'fao_crop_calendar',
        'Dec–Feb planting across Center-West & Bahia belts.',
    ),

    # ---------------- KENYA (KE) — Bimodal Long Rains & Short Rains ----------------
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Long Rains (Main)', 'maize', (3, 4), (9, 10, 11, 12), 'fao_giews_briefs',
        'Main long-rains maize Mar–Apr; highland maturity extends longer.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Short Rains (Secondary)', 'maize', (10, 11), (2, 3), 'fao_giews_briefs',
        'Short-rains maize Oct–Nov, harvested Feb–Mar.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Main Season', 'wheat', (3, 4, 5), (8, 9, 10), 'fao_giews_briefs',
        'Highland wheat (e.g. Narok/Uasin Gishu) planted Mar–May.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Long Rains', 'sorghum', (3, 4), (8, 9, 10), 'fao_crop_calendar',
        'Drought-tolerant cereal aligned to March–April rains.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Short Rains', 'sorghum', (10, 11), (1, 2), 'fao_crop_calendar',
        'Short-rains dryland sorghum crossing Dec/Jan into Feb harvest.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Long Rains', 'millet', (3, 4), (8, 9, 10), 'fao_crop_calendar',
        'Long-rains millet Mar–Apr.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Short Rains', 'millet', (10, 11), (1, 2), 'fao_crop_calendar',
        'Short-rains millet Oct–Nov, harvested Jan–Feb.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Long Rains', 'cowpea', (3, 4), (6, 7), 'fao_crop_calendar',
        'Fast-maturing pulse planted Mar–Apr, harvested Jun–Jul.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Short Rains', 'cowpea', (10, 11), (12, 1), 'fao_crop_calendar',
        'Short-rains pulse Oct–Nov, harvested Dec–Jan.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Long Rains', 'potato', (3, 4), (7, 8, 9), 'fao_crop_calendar',
        'Cool highland Irish potato Mar–Apr.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Short Rains', 'potato', (10, 11), (1, 2), 'fao_crop_calendar',
        'Short-rains potato Oct–Nov, harvested Jan–Feb.',
    ),
    RegionalCropWindow(
        'KE', 'Kenya', None, 'Equatorial Bimodal (Long Rains MAM / Short Rains OND)',
        'equatorial_bimodal', 'Irrigated Main / Second', 'rice', (6, 7, 1, 2), (11, 12, 5, 6), 'fao_giews_briefs',
        'Scheme-dependent irrigated cycles (e.g., Mwea Jun–Jul / Jan–Feb).',
    ),

    # ---------------- UNITED STATES (US) — Temperate Spring / Winter ----------------
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Winter Wheat', 'wheat', (9, 10), (6, 7, 8), 'usda_nass_628',
        'Planted Sep–Oct, overwintering until Jun–Aug harvest.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Spring Wheat', 'wheat', (4, 5), (8, 9), 'usda_nass_628',
        'Northern Plains spring wheat planted Apr–May.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Main Summer', 'maize', (4, 5, 6), (9, 10, 11), 'usda_nass_628',
        'Midwest/Corn Belt planting Apr–early Jun.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Main Summer', 'soybean', (4, 5, 6), (9, 10, 11), 'usda_nass_628',
        'Usually follows maize planting late Apr–Jun.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Summer Row Crop', 'cotton', (4, 5, 6), (9, 10, 11, 12), 'usda_nass_628',
        'Southern belt cotton Apr–Jun.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Summer Grain', 'sorghum', (4, 5, 6, 7), (9, 10, 11), 'usda_nass_628',
        'Great Plains sorghum late Apr–early Jul.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Spring Canola', 'canola', (4, 5), (8,), 'usda_nass_628',
        'Northern Plains spring canola.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Winter Canola', 'canola', (8, 9), (6, 7), 'usda_nass_628',
        'Southern Plains winter canola.',
    ),
    RegionalCropWindow(
        'US', 'United States', None, 'Temperate Continental & Southern Belts',
        'northern', 'Fall Potato', 'potato', (4, 5, 6), (9, 10, 11), 'usda_nass_628',
        'Main fall potato planted Apr–Jun.',
    ),
)

COUNTRY_ALIASES: dict[str, str] = {
    'pk': 'PK', 'pak': 'PK', 'pakistan': 'PK',
    'in': 'IN', 'ind': 'IN', 'india': 'IN',
    'au': 'AU', 'aus': 'AU', 'australia': 'AU',
    'br': 'BR', 'bra': 'BR', 'brazil': 'BR', 'brasil': 'BR',
    'ke': 'KE', 'ken': 'KE', 'kenya': 'KE',
    'us': 'US', 'usa': 'US', 'united states': 'US', 'united states of america': 'US',
}

COUNTRY_DISPLAY: dict[str, str] = {
    'PK': 'Pakistan',
    'IN': 'India',
    'AU': 'Australia',
    'BR': 'Brazil',
    'KE': 'Kenya',
    'US': 'United States',
}

# Conservative interior coordinate boxes used ONLY when caller omits country.
INTERIOR_COORDINATE_HINTS: tuple[tuple[str, float, float, float, float], ...] = (
    ('PK', 25.0, 35.0, 66.5, 74.0),     # Core Indus / Punjab / Sindh plains
    ('KE', -3.8, 3.8, 34.5, 40.5),      # Core Kenya agricultural zones
    ('BR', -29.0, -5.0, -60.0, -39.0),  # Interior Brazil agricultural belts
    ('AU', -38.0, -19.0, 116.0, 152.0), # Australian wheat/cotton belts (land filter not assumed for ocean)
    ('US', 30.0, 48.0, -104.0, -78.0),  # Interior US continental farming belts
    ('IN', 11.0, 29.0, 74.5, 87.5),     # Peninsular / Central / Gangetic India interior
)


def infer_hemisphere(latitude: float) -> str:
    if latitude >= 15.0:
        return 'northern'
    if latitude <= -15.0:
        return 'southern'
    return 'tropical_equatorial'


def resolve_regional_calendar_context(
    latitude: float,
    longitude: float,
    country: str | None = None,
    country_code: str | None = None,
    region: str | None = None,
) -> dict:
    """Resolve regional calendar verification status honestly without fabricating unsupported regions."""
    hemisphere = infer_hemisphere(latitude)

    explicit_input = (country_code or country or '').strip()
    if explicit_input:
        norm = explicit_input.lower()
        resolved_code = COUNTRY_ALIASES.get(norm)
        if not resolved_code:
            return {
                'verified': False,
                'evidence_status': 'unverified_location',
                'location_resolution': 'explicit_unsupported_country',
                'country_code': (country_code or '').upper() or None,
                'country_name': country or country_code,
                'region': region,
                'hemisphere': hemisphere,
                'agroecological_zone': None,
                'source_ids': ['fao_crop_calendar'],
                'warning': (
                    f"Regional planting calendars for '{explicit_input}' are not yet in AgroShift's verified calendar database. "
                    'Results use historical climate and botanical-family screening only; confirm local sowing windows before planting.'
                ),
            }
        zone_windows = [w for w in REGIONAL_WINDOWS if w.country_code == resolved_code]
        return {
            'verified': True,
            'evidence_status': 'verified_regional',
            'location_resolution': 'explicit_country',
            'country_code': resolved_code,
            'country_name': COUNTRY_DISPLAY[resolved_code],
            'region': region or zone_windows[0].region,
            'hemisphere': zone_windows[0].hemisphere,
            'agroecological_zone': zone_windows[0].agroecological_zone,
            'source_ids': sorted({w.source_id for w in zone_windows}),
            'warning': None,
        }

    # No explicit country supplied -> check conservative interior coordinate hint only as advisory
    for code, lat_min, lat_max, lon_min, lon_max in INTERIOR_COORDINATE_HINTS:
        if lat_min <= latitude <= lat_max and lon_min <= longitude <= lon_max:
            zone_windows = [w for w in REGIONAL_WINDOWS if w.country_code == code]
            return {
                'verified': True,
                'evidence_status': 'inferred_from_coordinates',
                'location_resolution': 'coarse_coordinate_hint',
                'country_code': code,
                'country_name': COUNTRY_DISPLAY[code],
                'region': region or zone_windows[0].region,
                'hemisphere': zone_windows[0].hemisphere,
                'agroecological_zone': zone_windows[0].agroecological_zone,
                'source_ids': sorted({w.source_id for w in zone_windows}),
                'warning': (
                    f"Coarse coordinate region matched {COUNTRY_DISPLAY[code]} ({zone_windows[0].agroecological_zone}). "
                    'Confirm country and sub-region in your farm profile for sharper local calendar guidance.'
                ),
            }

    return {
        'verified': False,
        'evidence_status': 'unverified_location',
        'location_resolution': 'coordinates_unverified',
        'country_code': None,
        'country_name': None,
        'region': region,
        'hemisphere': hemisphere,
        'agroecological_zone': None,
        'source_ids': ['fao_crop_calendar'],
        'warning': (
            f"Coordinates ({latitude:.2f}°, {longitude:.2f}°, {hemisphere.replace('_', ' ')} zone) are outside currently verified "
            'regional crop calendar belts. Historical climate screening only; verify local planting seasons before sowing.'
        ),
    }


def circular_month_distance(month_a: int, month_b: int) -> int:
    diff = abs(month_a - month_b) % 12
    return min(diff, 12 - diff)


def evaluate_crop_planting_window(
    crop_id: str,
    planting_month: int,
    duration_months: int,
    calendar_context: dict,
) -> dict:
    """Evaluate planting-month alignment against verified regional windows (handles Dec/Jan wrap-around)."""
    if not calendar_context.get('verified') or not calendar_context.get('country_code'):
        return {
            'status': 'unverified_location',
            'verified': False,
            'evidence_tier': 'unverified',
            'score': None,  # Never fabricate an ideal calendar score for unverified locations!
            'matched_season_name': None,
            'expected_planting_months': [],
            'min_month_gap': None,
            'note': 'Regional planting window not verified for this location; confirm sowing month locally.',
        }

    code = calendar_context['country_code']
    windows = [w for w in REGIONAL_WINDOWS if w.country_code == code and w.crop_id == crop_id]
    if not windows:
        return {
            'status': 'crop_not_in_regional_calendar',
            'verified': False,
            'evidence_tier': 'unverified',
            'score': None,
            'matched_season_name': None,
            'expected_planting_months': [],
            'min_month_gap': None,
            'note': (
                f"No verified {calendar_context['country_name']} calendar entry for {crop_id}; "
                'local sowing window is unverified and must be confirmed locally before planting.'
            ),
        }

    best_window: RegionalCropWindow | None = None
    best_gap = 12
    for w in windows:
        gap = min(circular_month_distance(planting_month, pm) for pm in w.planting_months)
        if gap < best_gap:
            best_gap = gap
            best_window = w

    assert best_window is not None
    if best_gap == 0:
        return {
            'status': 'aligned',
            'verified': True,
            'evidence_tier': 'verified',
            'score': 94.0,
            'matched_season_name': best_window.season_name,
            'expected_planting_months': list(best_window.planting_months),
            'min_month_gap': 0,
            'note': f"Aligned with {calendar_context['country_name']} {best_window.season_name} window ({best_window.notes}).",
        }
    if best_gap == 1:
        return {
            'status': 'shoulder_window',
            'verified': True,
            'evidence_tier': 'verified',
            'score': 76.0,
            'matched_season_name': best_window.season_name,
            'expected_planting_months': list(best_window.planting_months),
            'min_month_gap': 1,
            'note': (
                f"Shoulder-month planting (1 month outside core {calendar_context['country_name']} "
                f"{best_window.season_name} window); verify cultivar maturity and local soil temperatures."
            ),
        }

    return {
        'status': 'off_season',
        'verified': True,
        'evidence_tier': 'verified',
        'score': max(8.0, 45.0 - 10.0 * best_gap),
        'matched_season_name': best_window.season_name,
        'expected_planting_months': list(best_window.planting_months),
        'min_month_gap': best_gap,
        'note': (
            f"Off-season mismatch in {calendar_context['country_name']}: {best_gap} months from typical "
            f"{best_window.season_name} planting months ({list(best_window.planting_months)})."
        ),
    }

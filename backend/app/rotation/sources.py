"""Documented agricultural & Earth-observation source registry for AgroShift.

Provides parameter-level source attribution across NASA POWER historical climate,
regional planting calendars, FAO ECOCROP ecological bands, FAO-56 water/salinity references,
and FAO conservation-agriculture soil-health principles.
"""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class AgronomicSource:
    id: str
    title: str
    organization: str
    url: str
    geographic_applicability: str
    crop_applicability: str
    limitations: str
    last_reviewed: str

    def public(self) -> dict[str, str]:
        return asdict(self)


AGRONOMIC_SOURCES: dict[str, AgronomicSource] = {
    'nasa_power': AgronomicSource(
        id='nasa_power',
        title='NASA POWER Agroclimatology Monthly Archive (T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M, GWETTOP/GWETROOT)',
        organization='NASA Langley Research Center',
        url='https://power.larc.nasa.gov/',
        geographic_applicability='Global gridded (~0.5° × 0.625° / ~0.5° × 0.5°) historical reanalysis & satellite climatology',
        crop_applicability='Historical air temperature and precipitation variability across all crops',
        limitations=(
            'Gridded historical estimates, not on-farm rain-gauge/thermometer readings, irrigation deliveries, '
            'effective rainfall, or future weather/climate forecasts.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_crop_calendar': AgronomicSource(
        id='fao_crop_calendar',
        title='FAO Crop Calendar Portal',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://cropcalendar.apps.fao.org/',
        geographic_applicability='Selective documented country and subnational agroecological zones',
        crop_applicability='Major staple cereals, pulses, oilseeds, cotton, and potato',
        limitations=(
            'Represents typical regional sowing and harvesting windows rather than cultivar-specific dates or '
            'elevation/microclimate shifts.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_giews_briefs': AgronomicSource(
        id='fao_giews_briefs',
        title='FAO GIEWS Country Briefs & Seasonal Crop Monitoring',
        organization='Food and Agriculture Organization of the United Nations (FAO GIEWS)',
        url='https://www.fao.org/giews/countrybrief/',
        geographic_applicability='Country-level seasonal cropping summaries (e.g., Pakistan, India, Brazil, Australia, Kenya)',
        crop_applicability='Major cereal, oilseed, cotton, and pulse cropping seasons',
        limitations=(
            'National/macro-regional crop calendars; local irrigated vs. rainfed belts vary.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_ecocrop': AgronomicSource(
        id='fao_ecocrop',
        title='FAO ECOCROP / GAEZ Crop Ecological Requirements Reference',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://gaez.fao.org/pages/ecocrop',
        geographic_applicability='Global generalized species ecology bands',
        crop_applicability='Optimal & tolerable temperature bands, soil pH bands, cycle lengths, and broad texture preferences across all 14 catalog crops',
        limitations=(
            'Species-level literature ranges, not cultivar-specific trials or yield response functions; local varieties '
            'may tolerate wider heat, cold, or pH conditions.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_56_irrigation': AgronomicSource(
        id='fao_56_irrigation',
        title='FAO Irrigation & Drainage Paper No. 56 (Crop Evapotranspiration, Rooting & Maas-Hoffman Salinity Tolerance)',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://www.fao.org/land-water/databases-and-software/crop-information/en/',
        geographic_applicability='Global standardized reference concepts for crop water classes, rooting depths, and soil salinity thresholds',
        crop_applicability='Seasonal water-demand classes, coarse cycle rainfall bands, rooting depths, and ECe salinity thresholds where documented',
        limitations=(
            'AgroShift uses qualitative water categories and coarse seasonal rainfall bounds rather than full '
            'FAO-56 Penman-Monteith ET0, stage Kc curves, or leaching-fraction calculations.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_land_water': AgronomicSource(
        id='fao_land_water',
        title='FAO Land & Water Databases, Crop Information & AQUASTAT Concepts',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://www.fao.org/land-water/databases-and-software/en/',
        geographic_applicability='Global qualitative crop water-demand & drainage screening references',
        crop_applicability='All 14 crops (cereal, legume, oilseed, fiber, tuber, and vegetable)',
        limitations=(
            'Used as coarse screening bands only; does not model irrigation efficiency or soil water balance.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_soil_conservation': AgronomicSource(
        id='fao_soil_conservation',
        title='FAO Conservation Agriculture & Crop Rotation Principles (Family Breaks, Residue Cover & BNF Caveats)',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://www.fao.org/conservation-agriculture/en/',
        geographic_applicability='Global qualitative crop-succession & soil-health principles',
        crop_applicability='Botanical family rotation breaks, surface residue persistence, and legume nitrogen-fixation trade-offs',
        limitations=(
            'Qualitative screening logic only; cannot predict kg N/ha credit, soil organic carbon change, '
            'rhizobia nodulation success, or disease suppression without field observation.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_gaez': AgronomicSource(
        id='fao_gaez',
        title='FAO Global Agro-Ecological Zones (GAEZ)',
        organization='FAO & IIASA',
        url='https://gaez.fao.org/',
        geographic_applicability='Global agroecological zoning reference',
        crop_applicability='General thermal, soil pH, drainage, and salinity suitability concepts',
        limitations=(
            'Catalog crop parameters in AgroShift are simplified screening bands, not full GAEZ spatially explicit yield models.'
        ),
        last_reviewed='2026-11-14',
    ),
    'usda_nass_628': AgronomicSource(
        id='usda_nass_628',
        title='USDA NASS Agricultural Handbook No. 628 — Usual Planting and Harvesting Dates',
        organization='USDA National Agricultural Statistics Service',
        url='https://usda.library.cornell.edu/',
        geographic_applicability='United States major agricultural regions',
        crop_applicability='Wheat (winter/spring), maize, soybean, cotton, sorghum, potato, canola',
        limitations=(
            'U.S. usual-date averages vary strongly by state latitude and cultivar; excludes abnormal weather years.'
        ),
        last_reviewed='2026-11-14',
    ),
    'isric_soilgrids': AgronomicSource(
        id='isric_soilgrids',
        title='ISRIC SoilGrids v2.0 (250 m Digital Soil Property Estimates)',
        organization='ISRIC — World Soil Information',
        url='https://soilgrids.org/',
        geographic_applicability='Global 250 m modeled top-soil estimates (pH H2O, sand/silt/clay, SOC)',
        crop_applicability='Optional preliminary soil pH and texture context when farmer lacks laboratory tests',
        limitations=(
            'Coarse 250 m spatial prediction with uncertainty quantiles (Q05–Q95); never equivalent to a plot-level '
            'laboratory soil test and excludes soil salinity (ECe) and field drainage.'
        ),
        last_reviewed='2026-11-14',
    ),
    'nasa_power_daily': AgronomicSource(
        id='nasa_power_daily',
        title='NASA POWER Daily Agroclimatology API (T2M, T2M_MAX, T2M_MIN, RH2M, T2MDEW, WS2M, ALLSKY_SFC_SW_DWN, PRECTOTCORR, PS)',
        organization='NASA Langley Research Center',
        url='https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
        geographic_applicability='Global gridded (~0.5° × 0.625° / ~0.5° × 0.5°) daily historical meteorological archive',
        crop_applicability='Daily inputs for FAO-56 Penman-Monteith ET0 and historical daily precipitation totals across all crops',
        limitations=(
            'Gridded historical satellite/reanalysis archive (~50 km scale); does not capture microclimate storms, '
            'local rain-gauge spikes, or future weather forecasts.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_56_penman_monteith': AgronomicSource(
        id='fao_56_penman_monteith',
        title='FAO Irrigation & Drainage Paper No. 56, Chapter 3 — Daily Penman-Monteith Reference Evapotranspiration (ET0)',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://www.fao.org/4/X0490E/x0490e06.htm',
        geographic_applicability='Global standardized reference grass surface (height 0.12 m, albedo 0.23, rs 70 s/m)',
        crop_applicability='Atmospheric evaporative demand (ET0, mm/day) independent of crop canopy and soil water limits',
        limitations=(
            'Uses daily 24-hour soil heat flux G ≈ 0 and gridded NASA weather; assumes an active, well-watered grass '
            'reference rather than dry bare soil.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_56_crop_coefficients': AgronomicSource(
        id='fao_56_crop_coefficients',
        title='FAO Irrigation & Drainage Paper No. 56, Chapter 6 (Tables 11 & 12) — Single Crop Coefficients (Kc) & Stage Lengths',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://www.fao.org/4/X0490E/x0490e0b.htm',
        geographic_applicability='Global standardized non-stressed crop curves (climate-adjusted via Eq. 62/65 where documented)',
        crop_applicability='12 verified catalog crops; 2 preliminary proxy crops (chickpea Pulses proxy, canola spring-oilseed proxy)',
        limitations=(
            'Represents standard non-stressed field management; omits cultivar maturity differences, paddy rice '
            'land-preparation/seepage losses, and actual soil water stress coefficients (Ks).'
        ),
        last_reviewed='2026-11-14',
    ),
    'usda_scs_effective_rainfall': AgronomicSource(
        id='usda_scs_effective_rainfall',
        title='USDA Soil Conservation Service (USDA-SCS) Monthly Effective Rainfall Method (FAO CROPWAT / Paper 25)',
        organization='USDA SCS / FAO',
        url='https://www.fao.org/4/X0490E/x0490e00.htm',
        geographic_applicability='Global generalized medium-soil monthly rainfall effectiveness screening equation',
        crop_applicability='Preliminary monthly effective rainfall (Peff) and monthly-step net irrigation deficit screening',
        limitations=(
            'Does not simulate daily root-zone soil water balance, storm runoff intensity, soil texture water-holding '
            'capacity, shallow water-table capillary rise, or irrigation delivery efficiency.'
        ),
        last_reviewed='2026-11-14',
    ),
}


def get_sources_for_context(
    source_ids: list[str] | None = None,
    has_nasa_data: bool = True,
    include_soilgrids: bool = False,
) -> list[dict[str, str]]:
    """Return structured, deduplicated source disclosures relevant to a rotation analysis."""
    ordered: list[str] = []
    if has_nasa_data:
        ordered.append('nasa_power')
    for sid in source_ids or []:
        if sid in AGRONOMIC_SOURCES and sid not in ordered:
            ordered.append(sid)
    for default_sid in ('fao_ecocrop', 'fao_56_irrigation', 'fao_soil_conservation', 'fao_land_water', 'fao_gaez'):
        if default_sid not in ordered:
            ordered.append(default_sid)
    if include_soilgrids and 'isric_soilgrids' not in ordered:
        ordered.append('isric_soilgrids')
    return [AGRONOMIC_SOURCES[sid].public() for sid in ordered if sid in AGRONOMIC_SOURCES]


def get_water_sources(uses_nasa_daily: bool = True) -> list[dict[str, str]]:
    """Return scientific source disclosures for Phase 4W FAO-56 water intelligence."""
    ordered: list[str] = []
    if uses_nasa_daily:
        ordered.append('nasa_power_daily')
    ordered.extend([
        'fao_56_penman_monteith',
        'fao_56_crop_coefficients',
        'usda_scs_effective_rainfall',
    ])
    return [AGRONOMIC_SOURCES[sid].public() for sid in ordered if sid in AGRONOMIC_SOURCES]


def get_all_catalog_sources() -> list[dict[str, str]]:
    """Return all agronomic sources referenced across the 14-crop catalog."""
    return [src.public() for src in AGRONOMIC_SOURCES.values()]

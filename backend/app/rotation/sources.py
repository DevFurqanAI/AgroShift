"""Documented agricultural & Earth-observation source registry for AgroShift."""
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
        title='NASA POWER Agroclimatology Monthly Climatology (T2M, PRECTOTCORR)',
        organization='NASA Langley Research Center',
        url='https://power.larc.nasa.gov/',
        geographic_applicability='Global gridded (~0.5° × 0.625° / ~0.5° × 0.5°) land & point climatology',
        crop_applicability='Historical temperature and precipitation baseline across all crops',
        limitations=(
            'Gridded historical reanalysis/satellite-derived estimates, not local weather-station measurements, '
            'field soil moisture readings, or future forecasts.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_crop_calendar': AgronomicSource(
        id='fao_crop_calendar',
        title='FAO Crop Calendar Portal',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://cropcalendar.apps.fao.org/',
        geographic_applicability='Country and subnational agroecological zones globally (selective catalog coverage)',
        crop_applicability='Major staple, pulse, oilseed, and fiber crops',
        limitations=(
            'Represents typical regional sowing and harvesting periods rather than farm-specific dates or cultivar maturity; '
            'microclimates, elevation, and irrigation access shift actual dates.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_giews_briefs': AgronomicSource(
        id='fao_giews_briefs',
        title='FAO GIEWS Country Briefs & Seasonal Crop Monitoring',
        organization='Food and Agriculture Organization of the United Nations (FAO GIEWS)',
        url='https://www.fao.org/giews/countrybrief/',
        geographic_applicability='Country-level seasonal cropping assessments (e.g., Pakistan, India, Brazil, Australia, Kenya)',
        crop_applicability='Major cereal and food-security crops',
        limitations=(
            'National and macro-regional summaries; subnational belts (irrigated plains vs. rainfed uplands) vary locally.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_land_water': AgronomicSource(
        id='fao_land_water',
        title='FAO Land & Water Databases, Crop Information & AQUASTAT/CROPWAT Concepts',
        organization='Food and Agriculture Organization of the United Nations (FAO)',
        url='https://www.fao.org/land-water/databases-and-software/en/',
        geographic_applicability='Global qualitative crop water-demand & conservation-agriculture soil principles',
        crop_applicability='Broad crop classes (cereals, legumes, oilseeds, fiber, roots/tubers)',
        limitations=(
            'Used only as qualitative reference bands and soil-health principles; AgroShift does not compute full '
            'FAO-56 Penman-Monteith ET0, crop coefficients (Kc), effective rainfall, or CROPWAT irrigation schedules.'
        ),
        last_reviewed='2026-11-14',
    ),
    'fao_gaez': AgronomicSource(
        id='fao_gaez',
        title='FAO Global Agro-Ecological Zones (GAEZ)',
        organization='FAO & IIASA',
        url='https://gaez.fao.org/',
        geographic_applicability='Global agroecological zoning reference',
        crop_applicability='General crop thermal, pH, drainage, and salinity suitability concepts',
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
}


def get_sources_for_context(
    source_ids: list[str] | None = None,
    has_nasa_data: bool = True,
) -> list[dict[str, str]]:
    """Return structured, deduplicated source disclosures relevant to a rotation analysis."""
    ordered: list[str] = []
    if has_nasa_data:
        ordered.append('nasa_power')
    for sid in source_ids or []:
        if sid in AGRONOMIC_SOURCES and sid not in ordered:
            ordered.append(sid)
    for default_sid in ('fao_land_water', 'fao_gaez'):
        if default_sid not in ordered:
            ordered.append(default_sid)
    return [AGRONOMIC_SOURCES[sid].public() for sid in ordered if sid in AGRONOMIC_SOURCES]

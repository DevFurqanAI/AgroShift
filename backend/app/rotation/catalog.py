"""Evidence-backed crop catalog for AgroShift's 14 supported screening crops.

Thresholds represent generalized species screening ranges derived from FAO ECOCROP/GAEZ,
FAO Irrigation & Drainage Paper No. 56, and FAO Conservation Agriculture references.
Never claims cultivar-specific yield guarantees or local field-trial validation.
"""
from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class Crop:
    id: str
    name: str
    family: str
    water_demand: str  # low / medium / high — qualitative screening category
    ph_min: float
    ph_max: float
    temp_min_c: float
    temp_max_c: float
    duration_months: int
    is_legume: bool = False
    residue_profile: str = 'moderate'  # low / moderate / high surface residue persistence
    rooting_depth_class: str = 'medium'  # shallow / medium / deep
    waterlogging_sensitivity: str = 'moderate'  # low / moderate / high
    salinity_tolerance: str = 'moderate'  # sensitive / moderate / tolerant
    seasonal_rain_min_mm: int = 250  # coarse screening rainfall reference over cycle (not ETc)
    seasonal_rain_max_mm: int = 1200
    # Phase 4B enriched crop intelligence fields
    scientific_name: str = ''
    category: str = 'cereal'
    cycle_days_min: int = 90
    cycle_days_max: int = 150
    cycle_variability_note: str = ''
    temp_tol_min_c: float = 5.0
    temp_tol_max_c: float = 38.0
    heat_stress_threshold_c: float | None = None
    frost_sensitivity: str = 'moderate'  # low / moderate / high / very_high
    suitable_soil_textures: tuple[str, ...] = ('sandy_loam', 'loam', 'silt_loam', 'clay_loam')
    salinity_ec_threshold_dsm: float | None = None  # Maas-Hoffman ECe threshold (dS/m) where documented
    legume_bnf_notes: str | None = None
    residue_management_notes: str = ''
    succession_cautions: tuple[str, ...] = ()
    rotation_advantages: tuple[str, ...] = ()
    known_unknowns: tuple[str, ...] = (
        'Local cultivar maturity group, disease-resistance genetics, and photoperiod sensitivity are not stored in the global catalog.',
        'Exact local yield, market price, and input availability depend on field management and extension guidance.',
    )
    parameter_sources: dict[str, tuple[str, ...]] = field(
        default_factory=lambda: {
            'temperature_and_ph': ('fao_ecocrop', 'fao_gaez'),
            'water_and_salinity': ('fao_56_irrigation', 'fao_land_water'),
            'soil_and_rotation': ('fao_soil_conservation',),
            'calendars': ('fao_crop_calendar', 'fao_giews_briefs', 'usda_nass_628'),
        }
    )

    def public(self) -> dict:
        data = asdict(self)
        data['suitable_soil_textures'] = list(self.suitable_soil_textures)
        data['succession_cautions'] = list(self.succession_cautions)
        data['rotation_advantages'] = list(self.rotation_advantages)
        data['known_unknowns'] = list(self.known_unknowns)
        data['parameter_sources'] = {k: list(v) for k, v in self.parameter_sources.items()}
        return data


CROPS: dict[str, Crop] = {
    c.id: c
    for c in [
        Crop(
            'wheat', 'Wheat', 'poaceae', 'medium', 6.0, 7.5, 10, 25, 5,
            is_legume=False, residue_profile='high', rooting_depth_class='medium',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=300, seasonal_rain_max_mm=900,
            scientific_name='Triticum aestivum',
            category='cereal',
            cycle_days_min=110, cycle_days_max=240,
            cycle_variability_note='Spring wheat matures in ~110–145 days; winter wheat vernalization cycles extend to ~180–240+ days across temperate latitudes.',
            temp_tol_min_c=3.0, temp_tol_max_c=32.0,
            heat_stress_threshold_c=30.0,
            frost_sensitivity='low',
            suitable_soil_textures=('loam', 'silt_loam', 'clay_loam', 'clay'),
            salinity_ec_threshold_dsm=6.0,
            legume_bnf_notes=None,
            residue_management_notes='Produces high fibrous cereal straw that protects topsoil against erosion if retained; rapid incorporation of heavy straw can briefly immobilize surface nitrogen for a following non-legume.',
            succession_cautions=(
                'Back-to-back cereals increase grassy weeds, Fusarium crown/root rot, rust inoculum, and soil N drawdown.',
                'Late harvest of preceding rice/cotton can compress sowing dates and expose grain-fill to spring heat (>30 °C).',
            ),
            rotation_advantages=(
                'Fibrous root system pairs well after broadleaf break crops (chickpea, lentil, canola, soybean).',
                'Strong weed-smothering canopy when established at target stand density.',
            ),
            known_unknowns=(
                'Catalog treats wheat at a 5-month active seasonal screening duration and does not separate overwintering vernalization from spring varieties.',
                'Terminal heat tolerance and rust race susceptibility depend on local cultivar.',
            ),
        ),
        Crop(
            'rice', 'Rice', 'poaceae', 'high', 5.5, 7.0, 22, 35, 5,
            is_legume=False, residue_profile='high', rooting_depth_class='shallow',
            waterlogging_sensitivity='low', salinity_tolerance='moderate',
            seasonal_rain_min_mm=700, seasonal_rain_max_mm=2200,
            scientific_name='Oryza sativa',
            category='cereal',
            cycle_days_min=105, cycle_days_max=160,
            cycle_variability_note='Short-duration aromatic/upland lines mature in ~105–120 days; transplanted basmati/medium-late varieties require ~135–160 days including nursery.',
            temp_tol_min_c=16.0, temp_tol_max_c=40.0,
            heat_stress_threshold_c=35.0,
            frost_sensitivity='very_high',
            suitable_soil_textures=('clay_loam', 'clay', 'silt_loam'),
            salinity_ec_threshold_dsm=3.0,
            legume_bnf_notes=None,
            residue_management_notes='Generates dense high-silica straw; avoiding straw burning preserves organic matter, though dense wet straw can delay timely zero-till sowing of the next winter crop.',
            succession_cautions=(
                'Puddled paddy soils often develop a compacted plow pan that restricts aeration and root penetration for following upland pulses/tubers.',
                'Continuous rice-wheat or rice-rice intensifies stem borer, grassy weeds, and irrigation groundwater demand.',
            ),
            rotation_advantages=(
                'Anaerobic flooding suppresses many dryland soil-borne fungal pathogens before upland rotation phases.',
                'Well suited to poorly drained fine-textured lowlands where most legumes/tubers suffer root rot.',
            ),
            known_unknowns=(
                'Water requirement differs sharply between flooded paddy (high percolation loss) and aerobic/upland rice.',
                'Seedling salinity tolerance (~3.0 dS/m ECe) is more sensitive than vegetative growth.',
            ),
        ),
        Crop(
            'maize', 'Maize', 'poaceae', 'medium', 5.8, 7.5, 18, 32, 4,
            is_legume=False, residue_profile='high', rooting_depth_class='medium',
            waterlogging_sensitivity='moderate', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=400, seasonal_rain_max_mm=1100,
            scientific_name='Zea mays',
            category='cereal',
            cycle_days_min=95, cycle_days_max=150,
            cycle_variability_note='Early tropical/spring hybrids mature in ~95–110 days; highland Kenyan and late temperate hybrids take ~135–180+ days.',
            temp_tol_min_c=10.0, temp_tol_max_c=36.0,
            heat_stress_threshold_c=34.0,
            frost_sensitivity='high',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam'),
            salinity_ec_threshold_dsm=1.7,
            legume_bnf_notes=None,
            residue_management_notes='Substantial coarse stover provides good surface mulch and erosion control when left on the field after harvest.',
            succession_cautions=(
                'Sensitive to waterlogging during early vegetative growth and to heat/moisture deficit around silking and pollination.',
                'High nitrogen feeder; continuous cereal-after-cereal increases leaf blight, stalk rot, and Striga/fall-armyworm pressure.',
            ),
            rotation_advantages=(
                'Responds well following legumes (soybean, cowpea, chickpea) due to improved soil structure and disease break.',
                'Fits both main-season and short second-season (e.g., Brazil Safrinha) windows with early hybrids.',
            ),
            known_unknowns=(
                'Silking heat sensitivity depends heavily on soil moisture availability at flowering.',
                'Highland Kenya/Andean ecotypes require longer cool-elevation cycles than lowland hybrids.',
            ),
        ),
        Crop(
            'sorghum', 'Sorghum', 'poaceae', 'low', 5.5, 8.0, 22, 35, 4,
            is_legume=False, residue_profile='high', rooting_depth_class='deep',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=220, seasonal_rain_max_mm=850,
            scientific_name='Sorghum bicolor',
            category='cereal',
            cycle_days_min=95, cycle_days_max=135,
            cycle_variability_note='Early dual-purpose/grain hybrids mature in ~95–115 days; photoperiod-sensitive landraces can run ~120–150+ days.',
            temp_tol_min_c=14.0, temp_tol_max_c=40.0,
            heat_stress_threshold_c=38.0,
            frost_sensitivity='high',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam', 'clay'),
            salinity_ec_threshold_dsm=6.8,
            legume_bnf_notes=None,
            residue_management_notes='Deep roots and durable stover anchor semi-arid soils against wind erosion; thick stubble requires planter clearance or breakdown time.',
            succession_cautions=(
                'Late-season sorghum residues can cause temporary nitrogen tie-up and mild allelopathic suppression for immediate small-seeded winter crops without balanced N/moisture.',
                'Cool temperatures (<15 °C) severely delay germination and establishment.',
            ),
            rotation_advantages=(
                'Deep rooting scavenges subsoil moisture/nitrate and tolerates transient mid-season dry spells better than maize.',
                'Higher salinity threshold (~6.8 dS/m) than maize or pulses.',
            ),
            known_unknowns=(
                'Grain-only vs. forage/ratoon sorghum management strongly alters duration and water extraction.',
            ),
        ),
        Crop(
            'millet', 'Pearl millet', 'poaceae', 'low', 5.5, 8.0, 22, 35, 4,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='high', salinity_tolerance='moderate',
            seasonal_rain_min_mm=180, seasonal_rain_max_mm=750,
            scientific_name='Cenchrus americanus',
            category='cereal',
            cycle_days_min=75, cycle_days_max=115,
            cycle_variability_note='Short-duration arid hybrids mature in ~75–90 days; dual-purpose/landrace types run ~95–120 days.',
            temp_tol_min_c=15.0, temp_tol_max_c=42.0,
            heat_stress_threshold_c=40.0,
            frost_sensitivity='very_high',
            suitable_soil_textures=('sandy', 'sandy_loam', 'loam'),
            salinity_ec_threshold_dsm=None,
            legume_bnf_notes=None,
            residue_management_notes='Moderate dryland stover helps shade sandy surfaces when partial stubble is anchored rather than grazed bare.',
            succession_cautions=(
                'Poorly tolerant of standing water or heavy poorly drained clay soils.',
                'Continuous millet increases downy mildew and Striga weed pressure in warm drylands.',
            ),
            rotation_advantages=(
                'Excels on coarse sandy/low-fertility soils under low, erratic rainfall where maize fails.',
                'Pairs effectively with drought-hardy legumes (cowpea) in warm semi-arid systems.',
            ),
            known_unknowns=(
                'Exact FAO-56 Maas-Hoffman ECe slope/threshold varies widely across millet species; catalog leaves ECe numeric threshold unspecified.',
            ),
        ),
        Crop(
            'soybean', 'Soybean', 'fabaceae', 'medium', 6.0, 7.5, 18, 30, 4,
            is_legume=True, residue_profile='moderate', rooting_depth_class='medium',
            waterlogging_sensitivity='moderate', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=380, seasonal_rain_max_mm=1050,
            scientific_name='Glycine max',
            category='legume',
            cycle_days_min=95, cycle_days_max=140,
            cycle_variability_note='Short tropical/mid-maturity cultivars finish in ~95–115 days; full-season maturity groups span ~120–145 days.',
            temp_tol_min_c=12.0, temp_tol_max_c=35.0,
            heat_stress_threshold_c=34.0,
            frost_sensitivity='high',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam'),
            salinity_ec_threshold_dsm=5.0,
            legume_bnf_notes=(
                'Can fix substantial atmospheric N with compatible Bradyrhizobium japonicum inoculant, adequate soil P, and moist topsoil; '
                'however, high-protein soybean seed harvests export large amounts of N, so net soil-N balance depends on inoculation and stover retention rather than assuming a fixed kg N/ha credit.'
            ),
            residue_management_notes='Low-C:N legume residue breaks down quickly after harvest, aiding rapid planting of second-season crops (e.g., Safrinha maize) while offering shorter-lived surface mulch than wheat/maize.',
            succession_cautions=(
                'Back-to-back soybean builds soybean cyst nematode, sudden death syndrome, and Asian soybean rust inoculum.',
                'Soil pH below ~5.8–6.0 restricts rhizobial nodulation and increases aluminum/manganese toxicity risk.',
            ),
            rotation_advantages=(
                'Strong broadleaf break before maize, wheat, or sorghum.',
                'Fast-decomposing stubble leaves clean seedbeds for reduced-till follow-on crops.',
            ),
            known_unknowns=(
                'Photoperiod sensitivity varies strongly by Maturity Group (MG 00 to MG IX).',
                'Actual net N residual credit cannot be estimated without seed harvest N removal and nodulation checks.',
            ),
        ),
        Crop(
            'chickpea', 'Chickpea', 'fabaceae', 'low', 6.0, 8.0, 12, 25, 4,
            is_legume=True, residue_profile='low', rooting_depth_class='deep',
            waterlogging_sensitivity='high', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=200, seasonal_rain_max_mm=650,
            scientific_name='Cicer arietinum',
            category='legume',
            cycle_days_min=95, cycle_days_max=145,
            cycle_variability_note='Short warm-margin desi types finish in ~95–115 days; cool winter kabuli/subtropical types require ~120–150 days.',
            temp_tol_min_c=5.0, temp_tol_max_c=32.0,
            heat_stress_threshold_c=30.0,
            frost_sensitivity='moderate',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam'),
            salinity_ec_threshold_dsm=None,
            legume_bnf_notes=(
                'Fixes N via Mesorhizobium ciceri symbiosis; seed inoculation is essential in fields without recent chickpea history. '
                'Nodulation declines sharply under waterlogging, drought, or P deficiency.'
            ),
            residue_management_notes='Produces sparse, fragile pulse residue that decomposes quickly, offering limited post-harvest soil cover unless preceded/followed by high-residue cereals.',
            succession_cautions=(
                'Very high sensitivity to poorly drained/waterlogged soils (Phytophthora root rot, Ascochyta blight in humid canopies).',
                'Should not return to the same paddock within 2–3 years where Ascochyta or Fusarium wilt occurs.',
            ),
            rotation_advantages=(
                'Deep taproot accesses stored subsoil moisture in post-monsoon or winter-crop rotations.',
                'Excellent broadleaf weed & cereal-disease break ahead of wheat or sorghum.',
            ),
            known_unknowns=(
                'Salinity sensitivity is well documented as high in field extension, though a single global FAO-56 ECe threshold varies between kabuli/desi cultivars.',
            ),
        ),
        Crop(
            'lentil', 'Lentil', 'fabaceae', 'low', 6.0, 8.0, 10, 25, 4,
            is_legume=True, residue_profile='low', rooting_depth_class='shallow',
            waterlogging_sensitivity='high', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=200, seasonal_rain_max_mm=600,
            scientific_name='Lens culinaris',
            category='legume',
            cycle_days_min=90, cycle_days_max=135,
            cycle_variability_note='Short subtropical red lentils mature in ~90–110 days; temperate spring/winter types span ~110–140 days.',
            temp_tol_min_c=4.0, temp_tol_max_c=30.0,
            heat_stress_threshold_c=29.0,
            frost_sensitivity='low',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam'),
            salinity_ec_threshold_dsm=None,
            legume_bnf_notes=(
                'Fixes atmospheric N with Rhizobium leguminosarum when soil is well-drained and near-neutral pH; '
                'shallow root zone makes nodulation sensitive to topsoil drying and compaction.'
            ),
            residue_management_notes='Very low post-harvest surface residue; pair with cereal stubble retention to maintain erosion protection.',
            succession_cautions=(
                'Intolerant of waterlogging and soil salinity; heavy wet clays impair emergence and encourage root rot.',
                'Low early stature makes lentil weak against winter broadleaf weeds without pre-sow management.',
            ),
            rotation_advantages=(
                'Short winter cycle fits tight cereal rotations with modest moisture use.',
                'Breaks grassy cereal disease cycles when rotated ahead of wheat or barley.',
            ),
            known_unknowns=(
                'Subnational lentil sowing calendars (e.g., southern Australia vs northern belts, Kenya highlands) vary beyond national summaries.',
            ),
        ),
        Crop(
            'cowpea', 'Cowpea', 'fabaceae', 'low', 5.5, 7.5, 20, 35, 3,
            is_legume=True, residue_profile='moderate', rooting_depth_class='medium',
            waterlogging_sensitivity='high', salinity_tolerance='moderate',
            seasonal_rain_min_mm=200, seasonal_rain_max_mm=800,
            scientific_name='Vigna unguiculata',
            category='legume',
            cycle_days_min=65, cycle_days_max=105,
            cycle_variability_note='Extra-early bush cultivars reach dry grain in ~65–75 days; spreading dual-purpose types run ~85–110 days.',
            temp_tol_min_c=15.0, temp_tol_max_c=39.0,
            heat_stress_threshold_c=37.0,
            frost_sensitivity='very_high',
            suitable_soil_textures=('sandy', 'sandy_loam', 'loam', 'silt_loam'),
            salinity_ec_threshold_dsm=4.9,
            legume_bnf_notes=(
                'Promiscuous nodulator with native Bradyrhizobium in many tropical soils, supporting heat-tolerant nitrogen fixation '
                'under low rainfall; dual-purpose haulm removal for fodder reduces net soil-N/organic return.'
            ),
            residue_management_notes='Dense vining canopy shades soil well during growth; retain leaves/haulms on-field if soil organic matter maintenance is the goal rather than cutting all biomass for forage.',
            succession_cautions=(
                'Sensitive to cool temperatures (<16 °C), prolonged waterlogging, and heavy wet clays.',
                'Flower thrips and pod-borer pressure escalates under consecutive warm legumes.',
            ),
            rotation_advantages=(
                'Fast 3-month maturity fits short equatorial rains and tight inter-cereal windows.',
                'Well adapted to lighter sandy-loam soils where few crops nodulate reliably.',
            ),
            known_unknowns=(
                'Grain-only vs. dual-purpose fodder harvest changes residual soil nitrogen/carbon retention considerably.',
            ),
        ),
        Crop(
            'potato', 'Potato', 'solanaceae', 'medium', 5.0, 6.5, 12, 23, 4,
            is_legume=False, residue_profile='low', rooting_depth_class='shallow',
            waterlogging_sensitivity='high', salinity_tolerance='sensitive',
            seasonal_rain_min_mm=350, seasonal_rain_max_mm=900,
            scientific_name='Solanum tuberosum',
            category='root_tuber',
            cycle_days_min=85, cycle_days_max=130,
            cycle_variability_note='Early subtropical/plains crops dig in ~85–100 days; main-season temperate storage crops span ~110–135 days.',
            temp_tol_min_c=6.0, temp_tol_max_c=28.0,
            heat_stress_threshold_c=27.0,
            frost_sensitivity='high',
            suitable_soil_textures=('sandy', 'sandy_loam', 'loam', 'silt_loam'),
            salinity_ec_threshold_dsm=1.7,
            legume_bnf_notes=None,
            residue_management_notes='Leaves minimal surface residue and involves soil disturbance at hilling and lifting; pair with high-residue cereals to rebuild soil aggregation and cover.',
            succession_cautions=(
                'Never follow potato with potato or tomato due to late blight, Verticillium wilt, bacterial wilt, and cyst nematodes.',
                'Heavy wet clay deforms tubers and spikes soft-rot risk; alkaline soils (>7.2 pH) elevate common scab risk.',
            ),
            rotation_advantages=(
                'Cool-season cash crop breaks cereal weed and root-disease cycles when given a 3+ season Solanaceae break.',
            ),
            known_unknowns=(
                'Nighttime temperature critically governs tuberization beyond monthly mean air temperature.',
                'Common scab risk around pH > 7.0 depends on irrigation uniformity at tuber initiation.',
            ),
        ),
        Crop(
            'tomato', 'Tomato', 'solanaceae', 'medium', 6.0, 7.0, 18, 30, 4,
            is_legume=False, residue_profile='low', rooting_depth_class='medium',
            waterlogging_sensitivity='high', salinity_tolerance='moderate',
            seasonal_rain_min_mm=350, seasonal_rain_max_mm=950,
            scientific_name='Solanum lycopersicum',
            category='vegetable',
            cycle_days_min=90, cycle_days_max=135,
            cycle_variability_note='Determinate processing/field crops finish in ~90–115 days post-transplant; indeterminate open-field picks stretch ~120–145+ days.',
            temp_tol_min_c=12.0, temp_tol_max_c=35.0,
            heat_stress_threshold_c=32.0,
            frost_sensitivity='very_high',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam'),
            salinity_ec_threshold_dsm=2.5,
            legume_bnf_notes=None,
            residue_management_notes='Low remaining residue; old Solanaceae vines harbor blight/wilt and should be sanitized/composted rather than carrying infection to adjacent Solanaceae.',
            succession_cautions=(
                'Avoid following tomato or potato directly; bacterial wilt, root-knot nematodes, and early blight intensify rapidly.',
                'Requires uniform soil moisture and good drainage; waterlogging causes rapid root collapse and blossom-end disorders.',
            ),
            rotation_advantages=(
                'High-value horticultural phase breaks cereal pest cycles when rotated with grasses and clean legumes.',
            ),
            known_unknowns=(
                'Open-field rainfed vs. staked drip-irrigated tomato yield and disease pressure differ dramatically.',
                'Pollen viability drops rapidly when daytime/nighttime spikes exceed ~32–34 °C.',
            ),
        ),
        Crop(
            'sunflower', 'Sunflower', 'asteraceae', 'medium', 6.0, 7.8, 17, 32, 4,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=300, seasonal_rain_max_mm=900,
            scientific_name='Helianthus annuus',
            category='oilseed',
            cycle_days_min=95, cycle_days_max=130,
            cycle_variability_note='Short subtropical oilseed hybrids mature in ~95–110 days; temperate full-season hybrids run ~115–135 days.',
            temp_tol_min_c=10.0, temp_tol_max_c=36.0,
            heat_stress_threshold_c=34.0,
            frost_sensitivity='moderate',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam', 'clay'),
            salinity_ec_threshold_dsm=4.8,
            legume_bnf_notes=None,
            residue_management_notes='Deep taproot breaks mild subsurface compaction, while thick woody stalks take time to break down under minimum tillage.',
            succession_cautions=(
                'Heavy subsoil water miner — leaves deeper soil profile drier for an immediately following rainfed crop.',
                'Avoid frequent sunflower/canola proximity where Sclerotinia white mold is endemic.',
            ),
            rotation_advantages=(
                'Distinct Asteraceae family breaks Poaceae cereal and Fabaceae pulse pest cycles.',
                'Deep rooting scavenges leached nutrients from deeper horizons.',
            ),
            known_unknowns=(
                'Volunteer sunflower seedlings and Sclerotinia pressure depend on local humid microclimate.',
            ),
        ),
        Crop(
            'cotton', 'Cotton', 'malvaceae', 'high', 5.8, 8.0, 20, 35, 6,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='high', salinity_tolerance='tolerant',
            seasonal_rain_min_mm=450, seasonal_rain_max_mm=1300,
            scientific_name='Gossypium hirsutum',
            category='fiber',
            cycle_days_min=150, cycle_days_max=200,
            cycle_variability_note='Short-season irrigated/stripper cultivars pick in ~150–170 days; indeterminate multi-pick subtropical belts run ~175–210 days.',
            temp_tol_min_c=15.0, temp_tol_max_c=40.0,
            heat_stress_threshold_c=38.0,
            frost_sensitivity='very_high',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam', 'clay'),
            salinity_ec_threshold_dsm=7.7,
            legume_bnf_notes=None,
            residue_management_notes='Woody stalks require shredding and pink-bollworm sanitation rather than leaving standing overwintering stalks.',
            succession_cautions=(
                '6-month long cycle delays follow-on winter wheat/chickpea sowing and leaves zero turnaround time if picking stretches late.',
                'Consecutive cotton escalates Verticillium wilt, whitefly, and bollworm carryover.',
            ),
            rotation_advantages=(
                'Among the highest salinity tolerances in the catalog (~7.7 dS/m ECe Maas-Hoffman threshold) once established.',
                'Distinct Malvaceae family provides a full disease break from Poaceae cereals and Fabaceae pulses.',
            ),
            known_unknowns=(
                'Harvest date depends strongly on late-season boll retention, defoliation, and irrigation cutoff.',
            ),
        ),
        Crop(
            'canola', 'Canola', 'brassicaceae', 'medium', 5.5, 7.5, 10, 25, 4,
            is_legume=False, residue_profile='moderate', rooting_depth_class='deep',
            waterlogging_sensitivity='moderate', salinity_tolerance='moderate',
            seasonal_rain_min_mm=280, seasonal_rain_max_mm=800,
            scientific_name='Brassica napus',
            category='oilseed',
            cycle_days_min=110, cycle_days_max=240,
            cycle_variability_note='Subtropical/spring types mature in ~110–145 days; temperate winter canola requires vernalization (~210–250 days).',
            temp_tol_min_c=4.0, temp_tol_max_c=30.0,
            heat_stress_threshold_c=29.0,
            frost_sensitivity='low',
            suitable_soil_textures=('sandy_loam', 'loam', 'silt_loam', 'clay_loam'),
            salinity_ec_threshold_dsm=None,
            legume_bnf_notes=None,
            residue_management_notes='Deep taproot and mustard/Brassica residues deliver biofumigant suppression of several cereal root diseases, though rapid breakdown leaves lighter winter cover than wheat.',
            succession_cautions=(
                'Short turnaround (<2–3 years) between Brassicaceae increases blackleg and clubroot pressure (especially in acidic soils).',
                'Flowering/pod-fill is sensitive to heat spikes (>29 °C) and water deficit.',
            ),
            rotation_advantages=(
                'Premier non-mycorrhizal Brassica break crop before wheat or barley, improving subsequent root health and weed control.',
            ),
            known_unknowns=(
                'Sulfur fertility requirements are high relative to cereals and are not measured by AgroShift.',
                'Winter vs. spring ecotype separation depends on regional cultivar.',
            ),
        ),
    ]
}

CATALOG_NOTE = (
    'General screening crop parameters compiled from FAO ECOCROP/GAEZ, FAO-56, and FAO Conservation Agriculture references; '
    'cultivar maturity, local sowing dates, soil fertility, and regional extension guidance vary locally.'
)

"""Transparent qualitative soil-health reasoning module.

Evaluates crop-family diversity, repeated botanical families, legume inclusion with species-specific
biological nitrogen fixation (BNF) caveats, residue/ground-cover trade-offs, and optional farmer-provided
or SoilGrids-derived soil properties (distinguishing lab tests from public dataset estimates).
Never fabricates soil nutrient measurements, yield boosts, or soil-carbon percentages.
"""
from statistics import mean
from .catalog import Crop


def _normalize_provenance(raw: str | None) -> str:
    val = (raw or '').strip().lower()
    if val == 'lab_test':
        return 'lab_test'
    if val in ('public_dataset_estimate', 'external_estimate', 'estimated'):
        return 'public_dataset_estimate'
    if val in ('farmer_observation', 'farmer_provided'):
        return 'farmer_observation'
    return 'unspecified'


def _describe_provenance(prov: str, metric_name: str) -> str:
    if prov == 'lab_test':
        return f'Laboratory soil test {metric_name}'
    if prov == 'public_dataset_estimate':
        return f'Public SoilGrids v2.0 250 m estimated {metric_name} (coarse spatial model; verify locally before lime or amendment rates)'
    if prov == 'farmer_observation':
        return f'Farmer-reported {metric_name}'
    return f'Recorded {metric_name} (source unspecified)'


def score_soil_ph(soil_ph: float | None, ph_min: float, ph_max: float) -> float | None:
    """Optional soil pH comfort curve; returns None when soil pH is omitted."""
    if soil_ph is None:
        return None
    if ph_min <= soil_ph <= ph_max:
        mid = (ph_min + ph_max) / 2.0
        half_span = max(0.25, (ph_max - ph_min) / 2.0)
        norm_dist = min(1.0, abs(soil_ph - mid) / half_span)
        return 100.0 - 18.0 * (norm_dist ** 1.5)
    overshoot = min(abs(soil_ph - ph_min), abs(soil_ph - ph_max))
    return max(0.0, 82.0 - 32.0 * overshoot)


def evaluate_soil_health_sequence(
    rotation: tuple[Crop, ...],
    prev_crop: Crop,
    soil_ph: float | None = None,
    soil_texture: str | None = None,
    drainage: str | None = None,
    salinity_concern: str | None = None,
    soil_ph_provenance: str | None = None,
    soil_texture_provenance: str | None = None,
    soil_organic_carbon_g_kg: float | None = None,
) -> dict:
    """Compute qualitative soil-health assessment distinguishing lab data from coarse public estimates."""
    strengths: list[str] = []
    cautions: list[str] = []
    evaluated_factors: list[str] = ['botanical_family_sequence', 'legume_presence', 'residue_cover_profile']
    missing_factors: list[str] = []

    ph_prov = _normalize_provenance(soil_ph_provenance) if soil_ph is not None else 'unspecified'
    tex_prov = _normalize_provenance(soil_texture_provenance)

    seq_ids = [c.id for c in rotation]
    seq_families = [c.family for c in rotation]
    all_families_with_prev = [prev_crop.family] + seq_families

    distinct_families = len(set(seq_families))
    legume_crops_list = [c for c in rotation if c.is_legume]
    legumes = [c.name for c in legume_crops_list]
    has_legume = len(legumes) > 0
    repeated_same_crop_pairs = sum(
        1 for a, b in zip([prev_crop.id] + seq_ids, seq_ids) if a == b
    )
    repeated_family_pairs = sum(
        1 for a, b in zip(all_families_with_prev, seq_families) if a == b
    )

    component_scores: list[float] = []

    # 1. Family break & succession disease mitigation
    if distinct_families == len(rotation) and repeated_family_pairs == 0:
        strengths.append(
            'Alternates distinct botanical families across every transition, helping break specialist soil-borne pest and pathogen cycles.'
        )
        diversity_health = 92.0
    elif repeated_same_crop_pairs > 0:
        cautions.append(
            'Includes back-to-back planting of the same crop, elevating soil-borne pathogen carryover and weed resistance pressure.'
        )
        diversity_health = 35.0
    elif repeated_family_pairs > 0:
        cautions.append(
            'Repeats the same botanical family in adjacent seasons (e.g. Poaceae → Poaceae or Solanaceae → Solanaceae), narrowing pest-break benefits.'
        )
        diversity_health = 54.0
    else:
        strengths.append('Rotates families across immediate transitions before repeating later in the horizon.')
        diversity_health = 78.0
    component_scores.append(diversity_health)

    # 2. Species-aware legume evaluation (never treats all legumes identically)
    legume_tradeoff_note: str | None = None
    if has_legume:
        unique_legume_objs = list({c.id: c for c in legume_crops_list}.values())
        species_notes = [c.legume_bnf_notes for c in unique_legume_objs if c.legume_bnf_notes]
        legume_tradeoff_note = ' '.join(species_notes) if species_notes else None
        strengths.append(
            f"Includes legume crop ({', '.join(dict.fromkeys(legumes))}), offering potential biological nitrogen fixation "
            '(conditioned on compatible rhizobia, soil phosphorus, pH, and moisture; not a guaranteed nitrogen credit).'
        )
        if any(c.id == 'soybean' for c in unique_legume_objs):
            cautions.append(
                'Soybean harvests export substantial nitrogen in grain; net soil-N carryover depends on inoculation and stover retention.'
            )
        if soil_ph is not None and soil_ph < 5.8:
            cautions.append(
                f"Soil pH ({soil_ph}) is relatively acidic for optimal rhizobial nodulation in pulses; confirm nodulation locally."
            )
        component_scores.append(88.0)
    else:
        cautions.append(
            'Contains no legume phase; nitrogen replenishment depends entirely on soil reserves or external nutrient inputs.'
        )
        component_scores.append(60.0)

    # 3. Residue, rooting depth complementarity, & ground-cover balance
    high_res = sum(1 for c in rotation if c.residue_profile == 'high')
    low_res = sum(1 for c in rotation if c.residue_profile == 'low')
    root_depths = {c.rooting_depth_class for c in rotation}

    if high_res >= 1 and low_res < len(rotation):
        strengths.append(
            'Pairs higher-residue crops with other phases to support surface cover if crop residues are retained rather than burned or removed for fodder.'
        )
        residue_score = 82.0
    elif low_res == len(rotation):
        cautions.append(
            'Composed only of lower-residue crops, leaving soil more exposed between harvests unless cover crops or mulch are maintained.'
        )
        residue_score = 55.0
    else:
        residue_score = 72.0

    if 'deep' in root_depths and ('shallow' in root_depths or 'medium' in root_depths):
        strengths.append(
            f"Combines contrasting rooting depths ({', '.join(sorted(root_depths))}), supporting soil-profile scavenging across horizons."
        )
        residue_score = min(90.0, residue_score + 4.0)
    component_scores.append(residue_score)

    # 4. Optional soil pH (with explicit provenance distinction)
    per_season_ph = [score_soil_ph(soil_ph, c.ph_min, c.ph_max) for c in rotation]
    ph_score_avg = round(mean(s for s in per_season_ph if s is not None), 1) if soil_ph is not None else None
    if soil_ph is not None and ph_score_avg is not None:
        evaluated_factors.append('soil_ph')
        component_scores.append(ph_score_avg)
        ph_source_desc = _describe_provenance(ph_prov, f'soil pH ({soil_ph})')
        out_of_ph = [c.name for c, s in zip(rotation, per_season_ph) if s is not None and s < 75.0]
        if out_of_ph:
            cautions.append(
                f"{ph_source_desc} lies near or outside general screening bounds for {', '.join(dict.fromkeys(out_of_ph))}."
            )
        else:
            strengths.append(f"{ph_source_desc} falls within general screening bounds for selected crops.")
        if ph_prov == 'public_dataset_estimate':
            cautions.append(
                'Soil pH comes from a 250 m public SoilGrids estimate rather than a field lab test; confirm topsoil pH before lime/sulfur amendments.'
            )
    else:
        missing_factors.append('soil_ph')

    # 5. Optional farmer-supplied drainage
    norm_drainage = (drainage or 'unknown').lower()
    if norm_drainage not in ('', 'unknown'):
        evaluated_factors.append('drainage')
        if norm_drainage in ('poorly_drained', 'waterlogging_prone'):
            sensitive = [c.name for c in rotation if c.waterlogging_sensitivity == 'high']
            if sensitive:
                cautions.append(
                    f"Drainage is reported as '{norm_drainage.replace('_', ' ')}', raising root/collar-rot risk for sensitive crops ({', '.join(dict.fromkeys(sensitive))})."
                )
                component_scores.append(42.0)
            else:
                strengths.append('Selected crops tolerate slower field drainage relatively better than waterlogging-sensitive pulses/tubers.')
                component_scores.append(78.0)
        else:
            component_scores.append(88.0)
    else:
        missing_factors.append('drainage')

    # 6. Optional farmer-supplied salinity
    norm_salinity = (salinity_concern or 'unknown').lower()
    if norm_salinity not in ('', 'unknown'):
        evaluated_factors.append('salinity_concern')
        if norm_salinity in ('suspected', 'confirmed'):
            sensitive = [c.name for c in rotation if c.salinity_tolerance == 'sensitive']
            if sensitive:
                cautions.append(
                    f"Salinity concern ({norm_salinity}) poses higher establishment risk for salt-sensitive crops ({', '.join(dict.fromkeys(sensitive))})."
                )
                component_scores.append(45.0)
            else:
                strengths.append('Avoids the most salt-sensitive crops in the catalog, though local ECe testing remains essential.')
                component_scores.append(80.0)
        else:
            component_scores.append(90.0)
    else:
        missing_factors.append('salinity_concern')

    # 7. Optional soil texture (comparing suitability + provenance)
    norm_texture = (soil_texture or 'unknown').lower()
    if norm_texture not in ('', 'unknown'):
        evaluated_factors.append('soil_texture')
        tex_desc = _describe_provenance(tex_prov, f"soil texture ('{norm_texture.replace('_', ' ')}')")
        mismatch_crops = [
            c.name for c in rotation
            if c.suitable_soil_textures and norm_texture not in c.suitable_soil_textures
        ]
        if norm_texture == 'sandy':
            high_water = [c.name for c in rotation if c.water_demand == 'high']
            if high_water or mismatch_crops:
                flagged = list(dict.fromkeys(high_water + mismatch_crops))
                cautions.append(
                    f"{tex_desc} drains rapidly and retains less moisture; {', '.join(flagged)} may face moisture/establishment stress without careful irrigation."
                )
                component_scores.append(58.0)
            else:
                strengths.append(f"{tex_desc} matches lighter-soil tolerance of the selected crops.")
                component_scores.append(84.0)
        elif norm_texture == 'clay':
            tuber_pulse = [c.name for c in rotation if c.id in ('potato', 'chickpea', 'lentil', 'cowpea') or c.name in mismatch_crops]
            if tuber_pulse:
                cautions.append(
                    f"{tex_desc} can restrict root-zone aeration and harvest cleanliness for {', '.join(dict.fromkeys(tuber_pulse))} if compacted or wet."
                )
                component_scores.append(64.0)
            else:
                strengths.append(f"{tex_desc} is broadly compatible with selected cereals/fiber crops if drainage is maintained.")
                component_scores.append(84.0)
        elif mismatch_crops:
            cautions.append(
                f"{tex_desc} falls outside typical preferred textures for {', '.join(dict.fromkeys(mismatch_crops))}."
            )
            component_scores.append(72.0)
        else:
            strengths.append(f"{tex_desc} aligns well with general catalog soil-texture ranges.")
            component_scores.append(88.0)
    else:
        missing_factors.append('soil_texture')

    soc_reference_note: str | None = None
    if soil_organic_carbon_g_kg is not None:
        soc_reference_note = (
            f'Public SoilGrids reference Soil Organic Carbon (SOC) is ~{round(soil_organic_carbon_g_kg, 1)} g/kg (0–15 cm, 250 m); '
            'SOC is shown for context only and is neither converted to lab organic matter (%) nor used to predict N mineralization.'
        )

    qualitative_score = round(max(0.0, min(100.0, mean(component_scores))), 1)

    return {
        'soil_health_score': qualitative_score,
        'soil_ph_compatibility': ph_score_avg,
        'soil_ph_evaluated': soil_ph is not None,
        'soil_ph_provenance': ph_prov,
        'soil_texture_provenance': tex_prov if norm_texture not in ('', 'unknown') else 'unspecified',
        'soc_reference_note': soc_reference_note,
        'has_legume': has_legume,
        'legume_crops': list(dict.fromkeys(legumes)),
        'legume_tradeoff_note': legume_tradeoff_note,
        'distinct_families': distinct_families,
        'strengths': strengths,
        'cautions': cautions,
        'evaluated_factors': evaluated_factors,
        'missing_factors': missing_factors,
        'evidence_caveat': (
            'Qualitative soil-health screening only; biological nitrogen fixation, residue carbon retention, '
            'and disease suppression depend on local management, P/K/Zn fertility, rhizobia nodulation, and field soil tests.'
        ),
    }

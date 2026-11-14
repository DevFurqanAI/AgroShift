"""Transparent qualitative soil-health reasoning module.

Evaluates crop-family diversity, repeated botanical families, legume inclusion with conditional
biological nitrogen fixation (BNF) caveats, residue/ground-cover trade-offs, and optional farmer-provided
soil properties (pH, texture, drainage, salinity).
Never fabricates soil nutrient measurements, yield boosts, or soil-carbon percentages.
"""
from statistics import mean
from .catalog import Crop


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
) -> dict:
    """Compute qualitative soil-health assessment distinguishing potential benefits from verified outcomes."""
    strengths: list[str] = []
    cautions: list[str] = []
    evaluated_factors: list[str] = ['botanical_family_sequence', 'legume_presence', 'residue_cover_profile']
    missing_factors: list[str] = []

    seq_ids = [c.id for c in rotation]
    seq_families = [c.family for c in rotation]
    all_families_with_prev = [prev_crop.family] + seq_families

    distinct_families = len(set(seq_families))
    legumes = [c.name for c in rotation if c.is_legume]
    has_legume = len(legumes) > 0
    repeated_same_crop_pairs = sum(
        1 for a, b in zip([prev_crop.id] + seq_ids, seq_ids) if a == b
    )
    repeated_family_pairs = sum(
        1 for a, b in zip(all_families_with_prev, seq_families) if a == b
    )

    # 1. Family break & legume BNF evaluation
    component_scores: list[float] = []

    if distinct_families == len(rotation) and repeated_family_pairs == 0:
        strengths.append(
            'Alternates distinct botanical families across every transition, helping break specialist pest and pathogen cycles.'
        )
        diversity_health = 92.0
    elif repeated_same_crop_pairs > 0:
        cautions.append(
            'Includes back-to-back planting of the same crop, increasing soil-borne disease and nutrient-depletion pressure.'
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

    if has_legume:
        strengths.append(
            f"Includes legume crop ({', '.join(dict.fromkeys(legumes))}), offering potential biological nitrogen fixation "
            '(conditioned on compatible rhizobia, soil phosphorus, and moisture; not a guaranteed nitrogen credit).'
        )
        component_scores.append(88.0)
    else:
        cautions.append(
            'Contains no legume phase; nitrogen replenishment depends entirely on soil reserves or external nutrient inputs.'
        )
        component_scores.append(60.0)

    # 2. Residue & organic matter / ground cover qualitative balance
    high_res = sum(1 for c in rotation if c.residue_profile == 'high')
    low_res = sum(1 for c in rotation if c.residue_profile == 'low')
    if high_res >= 1 and low_res < len(rotation):
        strengths.append(
            'Pairs higher-residue crops with other phases to support surface cover if crop residues are retained rather than burned or removed for fodder.'
        )
        component_scores.append(82.0)
    elif low_res == len(rotation):
        cautions.append(
            'Composed only of lower-residue crops, leaving soil more exposed between harvests unless cover crops or mulch are maintained.'
        )
        component_scores.append(55.0)
    else:
        component_scores.append(72.0)

    # 3. Optional farmer-supplied soil pH
    per_season_ph = [score_soil_ph(soil_ph, c.ph_min, c.ph_max) for c in rotation]
    ph_score_avg = round(mean(s for s in per_season_ph if s is not None), 1) if soil_ph is not None else None
    if soil_ph is not None and ph_score_avg is not None:
        evaluated_factors.append('soil_ph')
        component_scores.append(ph_score_avg)
        out_of_ph = [c.name for c, s in zip(rotation, per_season_ph) if s is not None and s < 75.0]
        if out_of_ph:
            cautions.append(
                f"Recorded soil pH ({soil_ph}) lies near or outside general screening bounds for {', '.join(dict.fromkeys(out_of_ph))}."
            )
        else:
            strengths.append(f"Recorded soil pH ({soil_ph}) falls within general screening bounds for all selected crops.")
    else:
        missing_factors.append('soil_ph')

    # 4. Optional farmer-supplied drainage
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

    # 5. Optional farmer-supplied salinity
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
                strengths.append('Avoids the most salt-sensitive crops in the catalog, though local EC testing remains essential.')
                component_scores.append(80.0)
        else:
            component_scores.append(90.0)
    else:
        missing_factors.append('salinity_concern')

    # 6. Optional farmer-supplied soil texture
    norm_texture = (soil_texture or 'unknown').lower()
    if norm_texture not in ('', 'unknown'):
        evaluated_factors.append('soil_texture')
        if norm_texture == 'sandy':
            high_water = [c.name for c in rotation if c.water_demand == 'high']
            if high_water:
                cautions.append(
                    f"Sandy texture drains rapidly; high-water crops ({', '.join(dict.fromkeys(high_water))}) require frequent irrigation/moisture management."
                )
                component_scores.append(58.0)
            else:
                component_scores.append(84.0)
        elif norm_texture == 'clay':
            tuber_pulse = [c.name for c in rotation if c.id in ('potato', 'chickpea')]
            if tuber_pulse:
                cautions.append(
                    f"Heavy clay texture can restrict aeration and harvest cleanly for {', '.join(dict.fromkeys(tuber_pulse))} if compacted or wet."
                )
                component_scores.append(64.0)
            else:
                component_scores.append(84.0)
        else:
            component_scores.append(88.0)
    else:
        missing_factors.append('soil_texture')

    qualitative_score = round(max(0.0, min(100.0, mean(component_scores))), 1)

    return {
        'soil_health_score': qualitative_score,
        'soil_ph_compatibility': ph_score_avg,
        'soil_ph_evaluated': soil_ph is not None,
        'has_legume': has_legume,
        'legume_crops': list(dict.fromkeys(legumes)),
        'distinct_families': distinct_families,
        'strengths': strengths,
        'cautions': cautions,
        'evaluated_factors': evaluated_factors,
        'missing_factors': missing_factors,
        'evidence_caveat': (
            'Qualitative soil-health screening only; biological nitrogen fixation, residue carbon retention, '
            'and pest suppression depend on local management, P/Zn fertility, and field tests.'
        ),
    }

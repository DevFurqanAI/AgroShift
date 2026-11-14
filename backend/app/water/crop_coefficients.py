"""FAO-56 Single Crop Coefficient (Kc) & Growth-Stage Durations for AgroShift's 14 crops.

Official Reference:
FAO Irrigation and Drainage Paper No. 56, Chapter 6 (Tables 11 and 12):
https://www.fao.org/4/X0490E/x0490e0b.htm

Scientific Honesty Rules:
- Uses verified Table 12 single crop coefficients (Kc_ini, Kc_mid, Kc_end) and max plant height (h).
- Uses FAO Table 11 growth-stage durations (L_ini, L_dev, L_mid, L_late) where explicitly documented.
- Explicitly flags preliminary stage mappings where Table 11 lacks an exact row (Chickpea uses
  Pulses group proxy; Canola uses generalized spring-oilseed stage proxy without winter vernalization).
- Explicitly flags paddy rice standing-water land preparation, seepage, and deep percolation losses
  that sit outside standard FAO-56 ETc = Kc * ET0.
- Never fabricates Kc values for crops absent from the registry (returns None / unavailable).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CropKcProfile:
    crop_id: str
    crop_name: str
    kc_ini: float
    kc_mid: float
    kc_end: float
    max_height_m: float
    l_ini: int
    l_dev: int
    l_mid: int
    l_late: int
    evidence_status: str  # 'verified' | 'preliminary'
    fao_table12_reference: str
    fao_table11_reference: str
    requires_paddy_water_adjustment: bool = False
    limitations_note: str = ""

    @property
    def total_days(self) -> int:
        return self.l_ini + self.l_dev + self.l_mid + self.l_late

    def public(self) -> dict:
        return {
            "crop_id": self.crop_id,
            "crop_name": self.crop_name,
            "kc_ini": self.kc_ini,
            "kc_mid": self.kc_mid,
            "kc_end": self.kc_end,
            "max_height_m": self.max_height_m,
            "stage_days": {
                "initial": self.l_ini,
                "development": self.l_dev,
                "mid_season": self.l_mid,
                "late_season": self.l_late,
                "total": self.total_days,
            },
            "evidence_status": self.evidence_status,
            "fao_table12_reference": self.fao_table12_reference,
            "fao_table11_reference": self.fao_table11_reference,
            "requires_paddy_water_adjustment": self.requires_paddy_water_adjustment,
            "limitations_note": self.limitations_note,
            "source_url": "https://www.fao.org/4/X0490E/x0490e0b.htm",
        }


CROP_KC_PROFILES: dict[str, CropKcProfile] = {
    "wheat": CropKcProfile(
        crop_id="wheat",
        crop_name="Wheat",
        kc_ini=0.30,
        kc_mid=1.15,
        kc_end=0.35,  # Table 12: Spring wheat harvested dry grain 0.25-0.40
        max_height_m=1.0,
        l_ini=20,
        l_dev=30,
        l_mid=60,
        l_late=40,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Cereals / Spring Wheat: Kc_ini=0.30, Kc_mid=1.15, Kc_end=0.25-0.40, h=1.0 m)",
        fao_table11_reference="FAO-56 Table 11 (Small grains / Wheat 150 d Mediterranean-subtropical: 20/30/60/40 d)",
        limitations_note=(
            "Represents active 150-day spring/subtropical wheat cycle aligned with catalog 5-month slot; "
            "overwintering temperate winter wheat with dormancy (Table 11: 180-335 d, Table 12 Kc_ini=0.40-0.70) is not separately modeled."
        ),
    ),
    "rice": CropKcProfile(
        crop_id="rice",
        crop_name="Rice",
        kc_ini=1.05,
        kc_mid=1.20,
        kc_end=0.75,  # Table 12: 0.90-0.60 (0.75 mid-range drained/wet)
        max_height_m=1.0,
        l_ini=30,
        l_dev=30,
        l_mid=60,
        l_late=30,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Rice: Kc_ini=1.05, Kc_mid=1.20, Kc_end=0.60-0.90, h=1.0 m)",
        fao_table11_reference="FAO-56 Table 11 (Rice 150 d Tropics/Mediterranean: 30/30/60/30 d)",
        requires_paddy_water_adjustment=True,
        limitations_note=(
            "Standard FAO-56 ETc estimates crop transpiration and open-water evaporation during the 150-day field period only. "
            "For flooded paddy rice, it EXCLUDES land preparation/puddling water (~150-250 mm typical) and bund seepage or deep percolation losses, "
            "which frequently double gross field irrigation requirements."
        ),
    ),
    "maize": CropKcProfile(
        crop_id="maize",
        crop_name="Maize",
        kc_ini=0.30,
        kc_mid=1.20,
        kc_end=0.35,  # Table 12 Maize, Field (grain) harvested dry grain
        max_height_m=2.0,
        l_ini=20,
        l_dev=35,
        l_mid=40,
        l_late=30,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Maize, Field grain: Kc_ini=0.30, Kc_mid=1.20, Kc_end=0.35 dry grain, h=2.0 m)",
        fao_table11_reference="FAO-56 Table 11 (Maize grain 125 d India/Nigeria: 20/35/40/30 d)",
        limitations_note=(
            "Reflects ~125-day grain maize cycle matching AgroShift's 4-month slot; long-season highland maize hybrids (160-180 d) "
            "accumulate higher total seasonal ETc."
        ),
    ),
    "sorghum": CropKcProfile(
        crop_id="sorghum",
        crop_name="Sorghum",
        kc_ini=0.30,
        kc_mid=1.05,  # Table 12 Sorghum grain 1.00-1.10
        kc_end=0.55,
        max_height_m=1.5,
        l_ini=20,
        l_dev=35,
        l_mid=40,
        l_late=30,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Sorghum - grain: Kc_ini=0.30, Kc_mid=1.00-1.10, Kc_end=0.55, h=1.0-2.0 m)",
        fao_table11_reference="FAO-56 Table 11 (Sorghum USA/Pakistan/Med: 20/35/40/30 = 125 d)",
        limitations_note="Grain sorghum single-Kc screening assumes standard cover; sweet/forage ratoon sorghum has higher late-season Kc (~1.05).",
    ),
    "millet": CropKcProfile(
        crop_id="millet",
        crop_name="Pearl millet",
        kc_ini=0.30,
        kc_mid=1.00,
        kc_end=0.30,
        max_height_m=1.5,
        l_ini=15,
        l_dev=25,
        l_mid=40,
        l_late=25,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Millet: Kc_ini=0.30, Kc_mid=1.00, Kc_end=0.30, h=1.5 m)",
        fao_table11_reference="FAO-56 Table 11 (Millet Pakistan 105 d: 15/25/40/25 d)",
        limitations_note="Uses Pakistan 105-day grain millet benchmark; multi-cut forage pearl millet differs.",
    ),
    "soybean": CropKcProfile(
        crop_id="soybean",
        crop_name="Soybean",
        kc_ini=0.40,
        kc_mid=1.15,
        kc_end=0.50,
        max_height_m=0.75,  # Table 12: 0.5-1.0 m
        l_ini=18,
        l_dev=27,
        l_mid=50,
        l_late=25,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Soybeans: Kc_ini=0.40, Kc_mid=1.15, Kc_end=0.50, h=0.5-1.0 m)",
        fao_table11_reference="FAO-56 Table 11 (Soybeans 85-140 d range proportionally scaled to 120 d catalog slot: 18/27/50/25 d)",
        limitations_note="Duration reflects 120-day mid-maturity group aligned to 4-month rotation window; short tropical cultivars (85 d) use less water.",
    ),
    "chickpea": CropKcProfile(
        crop_id="chickpea",
        crop_name="Chickpea",
        kc_ini=0.40,
        kc_mid=1.00,
        kc_end=0.35,
        max_height_m=0.4,
        l_ini=20,
        l_dev=30,
        l_mid=45,
        l_late=25,
        evidence_status="preliminary",
        fao_table12_reference="FAO-56 Table 12 (Chick pea: Kc_ini=0.40, Kc_mid=1.00, Kc_end=0.35, h=0.4 m)",
        fao_table11_reference="Preliminary Pulses proxy (FAO-56 Table 11 lacks a dedicated Chickpea row; uses FAO-56 Pulses 120 d stage split 20/30/45/25 d)",
        limitations_note=(
            "Kc values come directly from FAO-56 Table 12, but stage durations use generalized FAO-56 Pulses proportions (preliminary confidence) "
            "because Table 11 omits an explicit Chickpea row."
        ),
    ),
    "lentil": CropKcProfile(
        crop_id="lentil",
        crop_name="Lentil",
        kc_ini=0.40,
        kc_mid=1.10,
        kc_end=0.30,
        max_height_m=0.5,
        l_ini=16,
        l_dev=24,
        l_mid=48,
        l_late=32,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Lentil: Kc_ini=0.40, Kc_mid=1.10, Kc_end=0.30, h=0.5 m)",
        fao_table11_reference="FAO-56 Table 11 (Lentil 20/30/60/40 ratio scaled cleanly to 120 d within 90-135 d catalog cycle: 16/24/48/32 d)",
        limitations_note="Maintains FAO-56 Table 11 stage proportions across AgroShift's 120-day (4-month) red/subtropical lentil window.",
    ),
    "cowpea": CropKcProfile(
        crop_id="cowpea",
        crop_name="Cowpea",
        kc_ini=0.40,
        kc_mid=1.05,
        kc_end=0.35,  # Dry seed harvest (Table 12 range 0.60 green - 0.35 dry seed)
        max_height_m=0.4,
        l_ini=20,
        l_dev=30,
        l_mid=30,
        l_late=20,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Green Gram & Cowpeas: Kc_ini=0.40, Kc_mid=1.05, Kc_end=0.35 dry grain, h=0.4 m)",
        fao_table11_reference="FAO-56 Table 11 (Green gram, cowpeas: 20/30/30/20 = 100 d)",
        limitations_note="Uses dry-grain late-season Kc (0.35); fresh/green-pod or dual-purpose fodder harvest keeps Kc_end closer to 0.60.",
    ),
    "potato": CropKcProfile(
        crop_id="potato",
        crop_name="Potato",
        kc_ini=0.50,
        kc_mid=1.15,
        kc_end=0.75,
        max_height_m=0.6,
        l_ini=25,
        l_dev=30,
        l_mid=35,
        l_late=30,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Potato: Kc_ini=0.50, Kc_mid=1.15, Kc_end=0.75 fresh harvest, h=0.6 m)",
        fao_table11_reference="FAO-56 Table 11 (Potato Semi-Arid 115-130 d: 25/30/35/30 = 120 d)",
        limitations_note="Kc_end=0.75 assumes standard tuber harvest without extended vine kill; shallow rooting increases drought-stress sensitivity.",
    ),
    "tomato": CropKcProfile(
        crop_id="tomato",
        crop_name="Tomato",
        kc_ini=0.60,
        kc_mid=1.15,
        kc_end=0.80,
        max_height_m=0.6,
        l_ini=25,
        l_dev=35,
        l_mid=40,
        l_late=25,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Tomato: Kc_ini=0.60, Kc_mid=1.15, Kc_end=0.70-0.90, h=0.6 m)",
        fao_table11_reference="FAO-56 Table 11 (Tomato 135 d Arid / adjusted 125 d post-transplant: 25/35/40/25 d)",
        limitations_note="Assumes open-field ~125-day post-transplant determinate tomato (h=0.6 m); trellised fresh-market tomatoes reach 1.5-2.0 m (Table 12 fn 2).",
    ),
    "sunflower": CropKcProfile(
        crop_id="sunflower",
        crop_name="Sunflower",
        kc_ini=0.35,
        kc_mid=1.10,  # Table 12: 1.0-1.15 under full/partial canopy
        kc_end=0.35,
        max_height_m=2.0,
        l_ini=25,
        l_dev=35,
        l_mid=45,
        l_late=25,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Sunflower: Kc_ini=0.35, Kc_mid=1.00-1.15, Kc_end=0.35, h=2.0 m)",
        fao_table11_reference="FAO-56 Table 11 (Sunflower 130 d Medit./Calif.: 25/35/45/25 d)",
        limitations_note="Uses mid-range Kc_mid=1.10 (Table 12 fn 9 spans 1.0-1.15 depending on planting density and full cover).",
    ),
    "cotton": CropKcProfile(
        crop_id="cotton",
        crop_name="Cotton",
        kc_ini=0.35,
        kc_mid=1.18,  # Table 12: 1.15-1.20
        kc_end=0.60,  # Table 12: 0.70-0.50
        max_height_m=1.35,  # Table 12: 1.2-1.5 m
        l_ini=30,
        l_dev=50,
        l_mid=55,
        l_late=45,
        evidence_status="verified",
        fao_table12_reference="FAO-56 Table 12 (Cotton: Kc_ini=0.35, Kc_mid=1.15-1.20, Kc_end=0.50-0.70, h=1.2-1.5 m)",
        fao_table11_reference="FAO-56 Table 11 (Cotton Texas/Egypt/Pakistan 180 d: 30/50/55/45 d)",
        limitations_note="Represents a 180-day (6-month) field cycle; late boll-fill picking or early defoliation alters L_late.",
    ),
    "canola": CropKcProfile(
        crop_id="canola",
        crop_name="Canola",
        kc_ini=0.35,
        kc_mid=1.08,  # Table 12 Rapeseed, Canola: 1.0-1.15
        kc_end=0.35,
        max_height_m=0.6,
        l_ini=20,
        l_dev=35,
        l_mid=40,
        l_late=25,
        evidence_status="preliminary",
        fao_table12_reference="FAO-56 Table 12 (Rapeseed, Canola: Kc_ini=0.35, Kc_mid=1.00-1.15, Kc_end=0.35, h=0.6 m)",
        fao_table11_reference="Preliminary Oilseed proxy (FAO-56 Table 11 has no Rapeseed/Canola row; uses 120 d spring oilseed proxy 20/35/40/25 d)",
        limitations_note=(
            "Kc values come from FAO-56 Table 12, but Table 11 omits Rapeseed/Canola growth-stage lengths. "
            "Treated as preliminary (~120 d spring/subtropical cycle); overwintering winter canola (210-250 d) is not modeled."
        ),
    ),
}


def get_crop_kc_profile(crop_id: str) -> CropKcProfile | None:
    return CROP_KC_PROFILES.get(crop_id)


def adjust_kc_mid_fao56(
    kc_mid_table: float,
    max_height_m: float,
    u2_mid_ms: float | None,
    rh_min_mid_percent: float | None,
) -> float:
    """FAO-56 Eq. 62 climate adjustment for Kc_mid when climate differs from RHmin=45%, u2=2 m/s.

    Clamped to FAO-56 valid range (u2 in [1.0, 6.0] m/s, RHmin in [20, 80]%, h in [0.1, 10] m).
    """
    if u2_mid_ms is None or rh_min_mid_percent is None:
        return kc_mid_table
    u2_clamped = max(1.0, min(6.0, float(u2_mid_ms)))
    rh_clamped = max(20.0, min(80.0, float(rh_min_mid_percent)))
    h_clamped = max(0.1, min(10.0, float(max_height_m)))
    adj = (0.04 * (u2_clamped - 2.0) - 0.004 * (rh_clamped - 45.0)) * ((h_clamped / 3.0) ** 0.3)
    return round(max(0.45, kc_mid_table + adj), 3)


def adjust_kc_end_fao56(
    kc_end_table: float,
    max_height_m: float,
    u2_late_ms: float | None,
    rh_min_late_percent: float | None,
) -> float:
    """FAO-56 Eq. 65 climate adjustment for Kc_end (applied only when Kc_end >= 0.45 per FAO-56)."""
    if kc_end_table < 0.45 or u2_late_ms is None or rh_min_late_percent is None:
        return kc_end_table
    u2_clamped = max(1.0, min(6.0, float(u2_late_ms)))
    rh_clamped = max(20.0, min(80.0, float(rh_min_late_percent)))
    h_clamped = max(0.1, min(10.0, float(max_height_m)))
    adj = (0.04 * (u2_clamped - 2.0) - 0.004 * (rh_clamped - 45.0)) * ((h_clamped / 3.0) ** 0.3)
    return round(max(0.20, kc_end_table + adj), 3)


def build_daily_kc_curve(
    profile: CropKcProfile,
    kc_mid_override: float | None = None,
    kc_end_override: float | None = None,
) -> list[float]:
    """Construct day-by-day piecewise linear FAO-56 single Kc curve across L_ini + L_dev + L_mid + L_late."""
    kc_ini = profile.kc_ini
    kc_mid = kc_mid_override if kc_mid_override is not None else profile.kc_mid
    kc_end = kc_end_override if kc_end_override is not None else profile.kc_end

    curve: list[float] = []
    # Initial stage: constant Kc_ini
    curve.extend([kc_ini] * profile.l_ini)

    # Development stage: linear interpolation from Kc_ini to Kc_mid
    for i in range(1, profile.l_dev + 1):
        frac = i / max(1, profile.l_dev)
        curve.append(kc_ini + (kc_mid - kc_ini) * frac)

    # Mid-season stage: constant Kc_mid
    curve.extend([kc_mid] * profile.l_mid)

    # Late-season stage: linear interpolation from Kc_mid to Kc_end
    for i in range(1, profile.l_late + 1):
        frac = i / max(1, profile.l_late)
        curve.append(kc_mid + (kc_end - kc_mid) * frac)

    return curve

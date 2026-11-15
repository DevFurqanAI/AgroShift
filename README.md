# AgroShift — Every Farm Deserves Smarter Decisions

**NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data**  
**Team:** Bro Codes · **Local event:** Multan, Pakistan

[**Try AgroShift**](https://agro-shift-wheat.vercel.app/) · [**Source repository**](https://github.com/DevFurqanAI/AgroShift) · [**Official challenge**](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/)

## The problem

Farmers must select crops as rainfall, temperature, water access, and soil conditions change. Yet agricultural information is fragmented, and many farmers do not have laboratory soil measurements or the expertise to interpret satellite data. A useful decision tool must combine environmental evidence with **the farmer's own constraints and priorities**, without treating gridded estimates as field measurements.

## Our solution

**AgroShift** is a public, no-login web application that helps farmers explore **two- and three-season crop rotations** using NASA climate data, publicly available soil estimates, crop characteristics, region-specific planting evidence, and farmer goals. It explains *why* a rotation is suggested and distinguishes confirmed information from estimates and missing evidence.

AgroShift is a **decision-support prototype**, not a yield predictor, soil laboratory, irrigation controller, or substitute for local agronomic advice.

## From NASA data to a farmer's decision

1. **Locate a farm.** Search for a place or draw a field boundary; provide known farm details and crop history.
2. **Understand local conditions.** Retrieve NASA POWER historical gridded climate estimates and modeled soil-wetness context, plus SoilGrids estimates where available. Farmers can accept, edit, or ignore public soil estimates; lab and farmer-provided measurements take precedence.
3. **Compare rotations.** Screen a 14-crop catalog against growing-season conditions, crop-family and soil-health considerations, documented regional calendars, and farmer priorities.
4. **Examine water and climate trade-offs.** Compare historical climate exposure and preliminary FAO-56 crop-water requirements. Keep this water-balance calculation **separate from** the original rotation ranking.
5. **Explain and report.** View data sources, limitations, ranked alternatives, hypothetical climate sensitivities, and saved/exportable farm reports.

## Key features

| Feature | What it provides |
| --- | --- |
| Farm mapping and onboarding | Global place search, polygon boundary area, cultivated-area override, irrigation information, soil knowledge and crop history |
| NASA climate intelligence | Multi-year NASA POWER temperature and rainfall summaries and seasonal charts |
| Automatic environmental context | NASA POWER radiation, humidity and coarse MERRA-2 soil-wetness indicators; SoilGrids soil estimates where accessible |
| Field health | Copernicus Sentinel-2 NDVI/NDMI with scene-quality and observation-date disclosures; cautious seasonal interpretations |
| Rotation planner | Two-/three-season options, 14 crop profiles, farmer-priority sensitivity, current-practice comparisons and regional evidence tiers |
| Climate comparisons | Historical exposure and **hypothetical** warmer/drier/wetter sensitivity tests—not future forecasts |
| Water Intelligence | NASA POWER daily weather, FAO-56 reference ET₀, stage-based crop ETc, estimated effective rainfall and preliminary net water deficit |
| Ask AgroShift | Agriculture-focused Gemini assistant with context and explicit uncertainty limits |
| Reports | Farm-scoped saved observations, rotation comparisons, reference data and export/print options |

## Earth observation and agricultural data

| Source | Data used | How it is interpreted |
| --- | --- | --- |
| **NASA POWER** | Historical temperature, precipitation, humidity, radiation, wind, pressure and daily weather for water modeling | Historical **gridded climate estimates** from satellite-derived and reanalysis/model inputs; not an on-field weather sensor or future forecast |
| **NASA POWER / MERRA-2** | `GWETTOP`, `GWETROOT` | Coarse modeled soil-wetness fractions; **not** precise soil moisture at a farm |
| **ESA / Copernicus Sentinel-2** | Optical imagery for NDVI and NDMI | Vegetation greenness and moisture-related optical indicators; not definitive drought or irrigation diagnoses |
| **ISRIC SoilGrids** | Modeled pH, soil texture, SOC, bulk density where available | Spatial estimates with depth, provenance and uncertainty; availability varies |
| **FAO crop guidance / FAO-56** | Planting and crop characteristics, crop coefficients, evapotranspiration methods | Parameter-specific agricultural evidence; some crop profiles or stage durations remain preliminary |
| **OpenStreetMap / Nominatim** | Place search and geocoding | Farm location assistance |
| **Open-Meteo / OpenWeatherMap** | Weather context where providers are available | Recent weather context, with provider and forecast distinctions |

**Core references:** [NASA POWER](https://power.larc.nasa.gov/) · [NASA POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/) · [FAO-56](https://www.fao.org/4/X0490E/x0490e00.htm) · [FAO Crop Calendar](https://cropcalendar.apps.fao.org/) · [SoilGrids](https://soilgrids.org/) · [Copernicus Data Space](https://dataspace.copernicus.eu/) · [OpenStreetMap](https://www.openstreetmap.org/)

NASA POWER is the principal **NASA data source** for the challenge. Sentinel-2 is a **European Space Agency/Copernicus**, not NASA, dataset.

## How the water comparison works

The separate Water Intelligence module uses NASA POWER daily meteorology and FAO-56 Penman–Monteith to estimate reference evapotranspiration (**ET₀**). Stage-specific crop coefficients (**Kc**) estimate crop evapotranspiration (**ETc = Kc × ET₀**). A documented effective-rainfall approximation supports a **preliminary** monthly water-deficit comparison. Results can also be converted from millimeters to cubic meters when the farmer supplies cultivated area.

This is **not** a measured irrigation requirement or guaranteed water saving. It does not model all field water storage, runoff, irrigation efficiencies or rice-paddy preparation/percolation needs. Candidate rotations are compared over aligned historical periods when sufficient data is available.

## Decision quality and uncertainty

- **Verified / conditional / unverified** planting-calendar evidence is shown explicitly. A high numerical screening score cannot make unsupported local planting timing verified.
- Screening scores indicate **relative compatibility under modeled factors**, not guaranteed yield, profitability or field performance.
- Soil health discussion covers diversity, legumes, residues and soil concerns qualitatively; it does not claim measured improvements in nitrogen or organic carbon.
- SoilGrids values are optional estimates. Farmer and lab measurements are protected from silent overwrites.
- Low NDMI alone does not prove drought. Cold weather, seasonal dormancy, senescence and unknown crop stage can make an observation inconclusive.
- Crop coefficients and thresholds are generally species-level; some growing-stage profiles are preliminary. Local cultivars and management practices may differ.
- Historical climate screening and hypothetical scenarios are **not climate or weather forecasts**.
- Some regions lack verified crop calendars or usable soil-estimate coverage. These gaps are shown rather than filled with invented values.

## Technology and architecture

```text
Farmer's browser (React + TypeScript + Vite + Tailwind)
  ├── Farm profiles, localStorage and maps
  ├── Vercel serverless Gemini assistant (/api/assistant)
  └── Python FastAPI backend on Render
       ├── NASA POWER monthly climate + daily water inputs
       ├── Environmental and SoilGrids context
       ├── Sentinel-2 / recent-weather field analysis
       ├── Crop-rotation and climate-resilience engine
       └── FAO-56 Water Intelligence (/api/v1/water/compare)
```

**Deployment:** Vercel (frontend and assistant); Render (FastAPI). **User access:** public; no account required. Farm profiles and saved observations are kept in browser storage, so they are device/browser-specific rather than synchronized across devices. Browser storage can be cleared by browser settings or storage policies; export important reports separately.

## Run locally

### Requirements

- Node.js compatible with Vite 8 (Node.js 20.19+ or 22.12+); Node.js 24 is used in frontend CI.
- Python 3.11 for the backend.
- External credentials only for services that require them, as listed below.

### 1. Python backend

```bash
cd backend
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

FastAPI documentation: `http://127.0.0.1:8000/docs`.

### 2. React frontend

From the repository root, in a separate terminal:

```bash
npm install
```

Create `.env.local` (do not commit credentials):

```dotenv
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Then:

```bash
npm run dev
```

The project includes a local Node/Express development entry point (`server.ts`) and Vercel serverless assistant routes. To use **Ask AgroShift locally**, provide `GEMINI_API_KEY` in the environment of the Node server (for example, a root `.env` file loaded by `dotenv/config`, or a shell environment variable). A key in `.env.local` alone is not guaranteed to be read by this Node entry point; do not expose the key as a `VITE_` variable. The rest of the farm-planning application can run without the assistant key, but the Gemini assistant requires a configured key. The **scientific API remains Python FastAPI**; do not substitute the local Express server for its agricultural calculations.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Browser's FastAPI endpoint; required when backend is on a different origin |
| `ALLOWED_ORIGINS` | Render backend CORS allowlist for frontend origin(s) |
| `COPERNICUS_CLIENT_ID`, `COPERNICUS_CLIENT_SECRET` | Sentinel-2 Copernicus integration |
| `OPENWEATHER_API_KEY` | Optional fallback for weather context |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Key required for Gemini assistant functionality; model override optional |
| `GROQ_API_KEY` | Optional backend AI explanation provider where supported by the Field Health service |

Never publish live API keys in GitHub or client-side files.

### Run tests

```bash
# From the root
npx tsc --noEmit
npx tsx --test tests/agroshift.test.ts
npm run build

# Python tests (from root, after installing backend requirements)
python -m pytest -q backend/tests
```

GitHub Actions runs frontend checks and backend pytest. **Note:** the provided project ZIP did not include `package-lock.json`, but the GitHub Actions workflow requires it for `npm ci` and npm dependency caching. Confirm that the actual GitHub repository contains a compatible committed lockfile; if not, regenerate it and rerun CI. A passing CI job would indicate that the checked-out commit has a usable lockfile.

## API examples

- `GET /api/v1/climate/history` — NASA historical climate
- `GET /api/v1/environmental-context` — NASA environmental and available soil context
- `POST /api/v1/analyze` — field health analysis
- `GET /api/v1/rotation/crops` — crop catalog and sources
- `POST /api/v1/rotation/plan` — rotation screening
- `POST /api/v1/rotation/scenario` — climate sensitivity comparison
- `POST /api/v1/water/compare` — historical crop-water comparison

Open the running FastAPI `/docs` page for the current schemas.

## Challenge alignment

**Official challenge:** [Field Shift: Adapting Farms with NASA Data](https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/)

| Challenge objective | AgroShift response |
| --- | --- |
| Use NASA Earth observations | NASA POWER climate history and weather-based crop-water calculations |
| Include local soil information | SoilGrids estimated context, optional farmer and lab measurements |
| Consider crop characteristics | Source-linked 14-crop profiles and seasonal characteristics |
| Reflect farmer priorities | Goal-sensitive screening and explanations |
| Explore crop rotations | Two-/three-season rankings, existing-practice comparison, regional evidence |
| Support soil health | Qualitative rotation diversity, legume and residue considerations |
| Adapt to changing conditions | Historical resilience, hypothetical scenarios and water-deficit comparisons |

## AI use and attribution

AgroShift includes a Gemini-based agricultural assistant. Google AI Studio and generative AI coding assistance were used during development, code refinement and explanation design; AI-assisted output was iteratively evaluated with automated tests and implementation reviews; this does not constitute independent agronomic validation. AI-generated content is **not** a substitute for source data or professional agronomic validation. Disclose all additional tools, pre-existing code and third-party assets accurately in the official submission form.

The project uses NASA and third-party data services, each subject to its own access and attribution conditions. Review current provider terms before redistribution or reuse of raw data. AgroShift is an independent team project **not endorsed by NASA, ESA, ISRIC or FAO**.

## Team and license

**Bro Codes** · NASA Space Apps Challenge 2026 · **Multan, Pakistan**.

Licensed under the [MIT License](LICENSE). Individual contributions and any pre-existing or reused project components should be disclosed accurately on the official project page; this README does not assert details not evidenced in the repository.

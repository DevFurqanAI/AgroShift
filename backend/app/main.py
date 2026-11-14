from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.models import FarmAnalyzeRequest, FarmAnalyzeResponse
from app.services import process_farm_analysis
from app.nasa_power import fetch_climate_summary, NASAClimateError
from app.rotation.routes import router as rotation_router
from fastapi import Query, HTTPException
import logging
import math

logger = logging.getLogger(__name__)

app = FastAPI(
    title="AgroShift Backend API",
    description="Field-analysis services inherited from TerraWise plus NASA POWER historical climate data.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,  # Public API; no user authentication or cross-origin cookies.
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(rotation_router)

@app.exception_handler(RequestValidationError)
def validation_exception_handler(request: Request, exc: RequestValidationError):
    first_error = exc.errors()[0] if exc.errors() else {}
    message = first_error.get("msg", "Invalid request payload.")
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": message})


@app.get("/")
def read_root():
    return {"status": "online", "message": "AgroShift backend is active."}


@app.post("/api/v1/analyze", response_model=FarmAnalyzeResponse, status_code=status.HTTP_200_OK)
def analyze_farm(payload: FarmAnalyzeRequest):
    try:
        return process_farm_analysis(
            lat=payload.latitude,
            lng=payload.longitude,
            acres=payload.acres,
            polygon_geojson=payload.polygon_geojson,
            lang=payload.language,
        )
    except Exception:
        logger.exception("Farm analysis failed")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Analysis could not be completed. Please try again shortly."},
        )


@app.get("/api/v1/climate/history")
def climate_history(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    start_year: int = Query(2015, ge=1981, le=2100),
    end_year: int = Query(2025, ge=1981, le=2100),
):
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise HTTPException(status_code=422, detail="Coordinates must be finite numbers.")
    from datetime import datetime, timezone
    if end_year < start_year or end_year - start_year > 30 or end_year > datetime.now(timezone.utc).year:
        raise HTTPException(status_code=422, detail="Choose a valid time period of at most 31 years.")
    try:
        result = fetch_climate_summary(latitude, longitude, start_year, end_year)
        return {"data_available": True, **result}
    except NASAClimateError as exc:
        logger.warning("NASA climate data unavailable: %s", exc)
        return {"data_available": False, "source": "NASA POWER", "monthly": [],
                "location": {"latitude": latitude, "longitude": longitude},
                "start_year": start_year, "end_year": end_year,
                "message": "Historical climate data are currently unavailable. Please retry later.",
                "historical_not_forecast": True}

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from pydantic import ValidationError
from app.models import FarmAnalyzeRequest


def test_valid_field_polygon():
    farm = FarmAnalyzeRequest(latitude=30, longitude=71, language="en", polygon_geojson={
        "type": "Polygon", "coordinates": [[[71, 30], [71.01, 30], [71, 30.01], [71, 30]]]
    })
    assert farm.polygon_geojson["type"] == "Polygon"


@pytest.mark.parametrize("bad", [200, float("nan"), "not-a-coordinate"])
def test_invalid_polygon_coordinates(bad):
    with pytest.raises(ValidationError):
        FarmAnalyzeRequest(latitude=30, longitude=71, polygon_geojson={
            "type": "Polygon", "coordinates": [[[bad, 30], [71.01, 30], [71, 30.01], [bad, 30]]]
        })

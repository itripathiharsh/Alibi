"""Test ensuring openapi.json is in sync with the FastAPI schema (AC-M0-5)."""

import json
from pathlib import Path

from app.main import app


def test_openapi_schema_is_not_stale() -> None:
    """Verify that committed openapi.json matches current FastAPI schema."""
    repo_root = Path(__file__).resolve().parents[3]
    schema_file = repo_root / "openapi.json"

    assert schema_file.exists(), "openapi.json not found in repository root. Run 'make openapi'."

    with open(schema_file, encoding="utf-8") as f:
        committed_schema = json.load(f)

    current_schema = app.openapi()

    assert committed_schema == current_schema, (
        "openapi.json is out of sync with current FastAPI backend routes. "
        "Run '.\\make.ps1 openapi' and commit the updated openapi.json."
    )

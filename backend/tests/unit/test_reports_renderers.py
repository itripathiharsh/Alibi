"""Unit tests for Report Renderers (doc 10 §5.3, AC-M9-4)."""

import io

import openpyxl

from app.reports.renderers import render_csv, render_html_viewer, render_xlsx, sanitize_csv_cell


def test_csv_formula_injection_neutralization() -> None:
    # AC-M9-4: CSV injection neutralized
    assert sanitize_csv_cell("=1+1") == "'=1+1"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-10% discount") == "'-10% discount"
    assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
    assert sanitize_csv_cell("Normal Task Title") == "Normal Task Title"
    assert sanitize_csv_cell(42) == "42"


def test_render_csv_output() -> None:
    facts = {
        "completed_tasks": [
            {
                "title": "=Dangerous Title",
                "category": "Work",
                "completed_at": "2026-11-16T10:00:00Z",
                "duration_min": 60,
                "priority": "P1",
            }
        ]
    }
    csv_str = render_csv(facts)
    assert csv_str.startswith("\ufeff")  # BOM check
    assert "'=Dangerous Title" in csv_str


def test_render_xlsx_validity() -> None:
    facts = {
        "period_start": "2026-11-10",
        "period_end": "2026-11-16",
        "summary": {
            "completed_count": 5,
            "pending_count": 2,
            "overdue_count": 0,
            "total_time_minutes": 240,
            "total_time_hours": 4.0,
        },
        "completed_tasks": [
            {
                "title": "Design API",
                "category": "Engineering",
                "completed_at": "2026-11-15T12:00:00Z",
                "duration_min": 120,
                "priority": "P1",
            }
        ],
        "pending_tasks": [],
        "time_by_category": {"Engineering": 240},
    }
    xlsx_bytes = render_xlsx(facts)
    assert len(xlsx_bytes) > 0

    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    assert "Summary" in wb.sheetnames
    assert "Completed Tasks" in wb.sheetnames
    ws_comp = wb["Completed Tasks"]
    assert ws_comp.freeze_panes == "A2"
    assert ws_comp.cell(row=2, column=1).value == "Design API"


def test_render_html_viewer() -> None:
    facts = {
        "period_start": "2026-11-10",
        "period_end": "2026-11-16",
        "summary": {"completed_count": 3, "total_time_hours": 2.5, "pending_count": 1},
        "completed_tasks": [],
    }
    html = render_html_viewer(
        facts=facts,
        recipient_label="Executive Sponsor",
        expires_at_str="2026-11-23 23:59 UTC",
        scope=["work"],
    )
    assert "ALIBI Activity Report" in html
    assert "Executive Sponsor" in html
    assert "Professional Only" in html
    assert "2026-11-23 23:59 UTC" in html


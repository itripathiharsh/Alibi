"""Integration tests for Reports generation, Exports, and Public Sharing (AC-M9-1..5)."""

from datetime import date, timedelta

import httpx
import pytest


@pytest.mark.asyncio
async def test_report_generation_and_export_lifecycle(auth_client: httpx.AsyncClient) -> None:
    """AC-M9-1 & AC-M9-4: Test factual report generation, CSV export with BOM, and XLSX download."""
    today = date.today()
    start_date = today - timedelta(days=7)

    # 1. Generate Report
    rep_res = await auth_client.post(
        "/api/v1/reports",
        json={
            "report_type": "weekly",
            "period_start": start_date.isoformat(),
            "period_end": today.isoformat(),
            "scope": ["personal", "work", "shared"],
        },
    )
    assert rep_res.status_code == 201
    rep_data = rep_res.json()
    report_id = rep_data["id"]
    assert rep_data["facts_hash"] is not None
    assert "summary" in rep_data["facts"]

    # 2. Export CSV
    csv_res = await auth_client.get(f"/api/v1/reports/{report_id}/export/csv")
    assert csv_res.status_code == 200
    assert csv_res.headers["content-type"] == "text/csv; charset=utf-8"
    assert csv_res.text.startswith("\ufeff")  # BOM check

    # 3. Export XLSX
    xlsx_res = await auth_client.get(f"/api/v1/reports/{report_id}/export/xlsx")
    assert xlsx_res.status_code == 200
    assert "openxmlformats" in xlsx_res.headers["content-type"]
    assert len(xlsx_res.content) > 100


@pytest.mark.asyncio
async def test_report_sharing_public_viewer_and_revocation(auth_client: httpx.AsyncClient) -> None:
    """AC-M9-3 & AC-M9-5: Test share token generation, public HTML viewer, and 410 Gone upon revocation."""
    today = date.today()

    # 1. Generate Report
    rep_res = await auth_client.post(
        "/api/v1/reports",
        json={
            "report_type": "eod",
            "period_start": today.isoformat(),
            "period_end": today.isoformat(),
            "scope": ["work"],
        },
    )
    assert rep_res.status_code == 201
    report_id = rep_res.json()["id"]

    # 2. Create Share Token (AC-M9-3: single-reveal token)
    share_res = await auth_client.post(
        f"/api/v1/reports/{report_id}/shares",
        json={
            "recipient_label": "Project Stakeholder",
            "scope": ["work"],
            "expires_in_days": 3,
            "allow_download": True,
        },
    )
    assert share_res.status_code == 201
    share_data = share_res.json()
    share_id = share_data["id"]
    share_token = share_data["share_token"]
    assert len(share_token) > 20

    # 3. Public access via /s/{token} without authentication (AC-M9-5)
    # Using an unauthenticated client
    async with httpx.AsyncClient(
        base_url="http://testserver", transport=auth_client._transport
    ) as anon_client:
        pub_res = await anon_client.get(f"/s/{share_token}")
        assert pub_res.status_code == 200
        assert "text/html" in pub_res.headers["content-type"]
        assert "Project Stakeholder" in pub_res.text

    # 4. Revoke the share link
    rev_res = await auth_client.post(f"/api/v1/reports/shares/{share_id}/revoke")
    assert rev_res.status_code == 200

    # 5. Accessing revoked share link returns 410 Gone (AC-M9-5)
    async with httpx.AsyncClient(
        base_url="http://testserver", transport=auth_client._transport
    ) as anon_client:
        revoked_res = await anon_client.get(f"/s/{share_token}")
        assert revoked_res.status_code == 410
        assert "Link No Longer Available" in revoked_res.text

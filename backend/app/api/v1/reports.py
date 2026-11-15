"""Reports and Sharing API endpoints (doc 04, doc 10 §5–6)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.models.report import Report, ReportShare
from app.reports.facts import ReportFactBuilder, compute_facts_hash
from app.reports.renderers import render_csv, render_xlsx
from app.reports.share_service import ReportShareService
from app.schemas.report import (
    ReportCreateRequest,
    ReportResponse,
    ReportShareCreateRequest,
    ReportShareCreateResponse,
    ReportShareResponse,
)

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def generate_report(
    body: ReportCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportResponse:
    """Generate a verified report with a frozen factual snapshot (doc 10 §5)."""
    builder = ReportFactBuilder(db)
    facts = await builder.build_facts(
        user_id=auth.user.id,
        period_start=body.period_start,
        period_end=body.period_end,
        include_classes=body.scope,
    )
    facts_hash = compute_facts_hash(facts)

    report = Report(
        user_id=auth.user.id,
        report_type=body.report_type,
        period_start=body.period_start,
        period_end=body.period_end,
        scope=body.scope,
        facts=facts,
        facts_hash=facts_hash,
        status="ready",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return ReportResponse(
        id=report.id,
        report_type=report.report_type,
        period_start=report.period_start,
        period_end=report.period_end,
        scope=report.scope,
        facts=report.facts,
        facts_hash=report.facts_hash,
        status=report.status,
        generated_at=report.generated_at,
    )


@router.get("", response_model=list[ReportResponse])
async def list_reports(
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 20,
) -> list[ReportResponse]:
    """List historical reports for the authenticated user."""
    stmt = (
        select(Report)
        .where(Report.user_id == auth.user.id)
        .order_by(desc(Report.generated_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    reports = res.scalars().all()
    return [
        ReportResponse(
            id=r.id,
            report_type=r.report_type,
            period_start=r.period_start,
            period_end=r.period_end,
            scope=r.scope,
            facts=r.facts,
            facts_hash=r.facts_hash,
            status=r.status,
            generated_at=r.generated_at,
        )
        for r in reports
    ]


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportResponse:
    """Retrieve frozen factual snapshot of a specific report."""
    stmt = select(Report).where(Report.id == report_id, Report.user_id == auth.user.id)
    res = await db.execute(stmt)
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return ReportResponse(
        id=report.id,
        report_type=report.report_type,
        period_start=report.period_start,
        period_end=report.period_end,
        scope=report.scope,
        facts=report.facts,
        facts_hash=report.facts_hash,
        status=report.status,
        generated_at=report.generated_at,
    )


@router.get("/{report_id}/export/csv")
async def export_report_csv(
    report_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Download report as formula-injection protected UTF-8 CSV with BOM (AC-M9-4)."""
    stmt = select(Report).where(Report.id == report_id, Report.user_id == auth.user.id)
    res = await db.execute(stmt)
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    csv_data = render_csv(report.facts)
    filename = f"alibi_report_{report.period_start}_{report.period_end}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}/export/xlsx")
async def export_report_xlsx(
    report_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Download report as a multi-tab Excel spreadsheet with typed cells (AC-M9-4)."""
    stmt = select(Report).where(Report.id == report_id, Report.user_id == auth.user.id)
    res = await db.execute(stmt)
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    xlsx_bytes = render_xlsx(report.facts)
    filename = f"alibi_report_{report.period_start}_{report.period_end}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/{report_id}/shares",
    response_model=ReportShareCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_report_share(
    report_id: uuid.UUID,
    body: ReportShareCreateRequest,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ReportShareCreateResponse:
    """Create a cryptographically hashed public share link. Raw token shown once (AC-M9-3)."""
    service = ReportShareService(db)
    try:
        share, raw_token = await service.create_share(
            user_id=auth.user.id,
            report_id=report_id,
            recipient_label=body.recipient_label,
            scope=body.scope,
            expires_in_days=body.expires_in_days,
            allow_download=body.allow_download,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    return ReportShareCreateResponse(
        id=share.id,
        report_id=share.report_id,
        recipient_label=share.recipient_label,
        scope=share.scope,
        token_prefix=share.token_prefix,
        share_token=raw_token,
        expires_at=share.expires_at,
        created_at=share.created_at,
    )


@router.get("/{report_id}/shares", response_model=list[ReportShareResponse])
async def list_report_shares(
    report_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ReportShareResponse]:
    """List all active and historical share links for a report."""
    stmt = (
        select(ReportShare)
        .where(ReportShare.report_id == report_id, ReportShare.user_id == auth.user.id)
        .order_by(desc(ReportShare.created_at))
    )
    res = await db.execute(stmt)
    shares = res.scalars().all()
    return [
        ReportShareResponse(
            id=s.id,
            report_id=s.report_id,
            recipient_label=s.recipient_label,
            scope=s.scope,
            token_prefix=s.token_prefix,
            allow_download=s.allow_download,
            expires_at=s.expires_at,
            revoked_at=s.revoked_at,
            created_at=s.created_at,
            last_accessed_at=s.last_accessed_at,
            access_count=s.access_count,
        )
        for s in shares
    ]


@router.post("/shares/{share_id}/revoke", status_code=status.HTTP_200_OK)
async def revoke_report_share(
    share_id: uuid.UUID,
    auth: Annotated[AuthContext, Depends(get_auth_context)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Revoke an active report share link (AC-M9-5)."""
    service = ReportShareService(db)
    success = await service.revoke_share(user_id=auth.user.id, share_id=share_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share link not found")
    await db.commit()
    return {"status": "revoked"}

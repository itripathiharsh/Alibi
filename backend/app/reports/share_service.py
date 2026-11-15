"""Report Sharing and Access Control Service (doc 10 §6, doc 12, AC-M9-3/5).

Generates cryptographic single-reveal share tokens, enforces revocations,
verifies expirations, and logs every access attempt with hashed identifiers.
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models.report import Report, ReportShare, ReportShareAccessLog


def hash_identifier(val: str) -> str:
    """Compute deterministic SHA-256 hash of an identifier (e.g. IP or User-Agent)."""
    return hashlib.sha256(val.encode("utf-8")).hexdigest()


class ReportShareService:
    """Service managing public shared links for verified reports."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_share(
        self,
        user_id: uuid.UUID,
        report_id: uuid.UUID,
        recipient_label: str,
        scope: list[str] | None = None,
        expires_in_days: int = 7,
        allow_download: bool = True,
    ) -> tuple[ReportShare, str]:
        """Create a share link. Returns (ReportShare, raw_token) once; DB holds only hash (AC-M9-3)."""
        # 1. Fetch report
        stmt = select(Report).where(Report.id == report_id, Report.user_id == user_id)
        res = await self.session.execute(stmt)
        report = res.scalar_one_or_none()
        if not report:
            raise ValueError("Report not found or not owned by user.")

        target_scope = scope or report.scope
        # Filter facts to only items permitted in target_scope
        raw_facts = report.facts
        shared_facts = dict(raw_facts)
        if "completed_tasks" in raw_facts:
            shared_facts["completed_tasks"] = [
                t
                for t in raw_facts["completed_tasks"]
                if t.get("category_class", "personal") in target_scope or "personal" in target_scope
            ]

        # 2. Cryptographic token generation
        raw_token = secrets.token_urlsafe(32)
        token_prefix = raw_token[:6]
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).digest()

        now = datetime.now(UTC)
        expires_at = now + timedelta(days=expires_in_days)

        share = ReportShare(
            user_id=user_id,
            report_id=report.id,
            token_hash=token_hash,
            token_prefix=token_prefix,
            recipient_label=recipient_label,
            scope=target_scope,
            shared_facts=shared_facts,
            allow_download=allow_download,
            expires_at=expires_at,
        )
        self.session.add(share)
        await self.session.flush()
        return (share, raw_token)

    async def access_shared_report(
        self,
        raw_token: str,
        client_ip: str = "127.0.0.1",
        user_agent: str = "Unknown",
    ) -> tuple[str, ReportShare | None]:
        """Retrieve shared report facts or return error outcome with audit logging (AC-M9-5)."""
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).digest()
        ip_h = hash_identifier(client_ip)
        ua_h = hash_identifier(user_agent)

        stmt = select(ReportShare).where(ReportShare.token_hash == token_hash)
        res = await self.session.execute(stmt)
        share = res.scalar_one_or_none()

        if not share:
            return ("not_found", None)

        now = datetime.now(UTC)

        # Check revoked
        if share.revoked_at is not None:
            self.session.add(
                ReportShareAccessLog(
                    share_id=share.id,
                    ip_hash=ip_h,
                    user_agent_hash=ua_h,
                    outcome="revoked",
                )
            )
            await self.session.flush()
            return ("revoked", share)

        # Check expired
        if share.expires_at < now:
            self.session.add(
                ReportShareAccessLog(
                    share_id=share.id,
                    ip_hash=ip_h,
                    user_agent_hash=ua_h,
                    outcome="expired",
                )
            )
            await self.session.flush()
            return ("expired", share)

        # Valid access
        share.access_count += 1
        share.last_accessed_at = utc_now()
        self.session.add(
            ReportShareAccessLog(
                share_id=share.id,
                ip_hash=ip_h,
                user_agent_hash=ua_h,
                outcome="ok",
            )
        )
        await self.session.flush()
        return ("ok", share)

    async def revoke_share(self, user_id: uuid.UUID, share_id: uuid.UUID) -> bool:
        """Revoke a previously created report share."""
        stmt = select(ReportShare).where(ReportShare.id == share_id, ReportShare.user_id == user_id)
        res = await self.session.execute(stmt)
        share = res.scalar_one_or_none()
        if not share:
            return False
        share.revoked_at = utc_now()
        await self.session.flush()
        return True

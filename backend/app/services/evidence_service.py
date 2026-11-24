"""Evidence service managing file attachments, links, deliverables, and MIME constraints (AC-M2-9)."""

import hashlib
import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import NotFoundError, ProblemException
from app.models.evidence import Evidence
from app.repositories.evidence_repo import EvidenceRepository
from app.repositories.task_repo import TaskRepository

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/markdown",
    "text/csv",
}

# Max file size limits in bytes
LOCAL_MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
HOSTED_MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB
HOSTED_MAX_TOTAL_QUOTA = 250 * 1024 * 1024  # 250 MB


class EvidenceService:
    """Service managing evidence uploads, file validation, and deliverable associations."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.evidence_repo = EvidenceRepository(session, user_id)
        self.task_repo = TaskRepository(session, user_id)

    async def add_file_evidence(
        self,
        task_id: uuid.UUID,
        filename: str,
        content: bytes,
        mime_type: str,
        is_deliverable: bool = False,
    ) -> Evidence:
        """Upload file evidence, verifying MIME allow-list, size limits, and storage quotas."""
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        # 1. MIME Validation
        normalized_mime = mime_type.lower().split(";")[0].strip()
        if normalized_mime not in ALLOWED_MIME_TYPES:
            raise ProblemException(
                status=415,
                title="Unsupported Media Type",
                detail=f"MIME type '{mime_type}' is not allowed for evidence uploads.",
                code="unsupported_media_type",
            )

        # 2. File Size Limit
        size_bytes = len(content)
        max_size = HOSTED_MAX_FILE_SIZE if settings.alibi_mode == "hosted" else LOCAL_MAX_FILE_SIZE
        if size_bytes > max_size:
            raise ProblemException(
                status=413,
                title="Payload Too Large",
                detail=f"File exceeds maximum allowed size of {max_size // (1024 * 1024)} MB.",
                code="payload_too_large",
            )

        # 3. Hosted Quota Limit (250 MB total)
        if settings.alibi_mode == "hosted":
            current_total = await self.evidence_repo.get_total_storage_bytes()
            if current_total + size_bytes > HOSTED_MAX_TOTAL_QUOTA:
                raise ProblemException(
                    status=413,
                    title="Storage Quota Exceeded",
                    detail="Total user storage quota (250 MB) exceeded.",
                    code="storage_quota_exceeded",
                )

        # 4. Storage Key and SHA-256
        sha256 = hashlib.sha256(content).hexdigest()

        # Write under the configured storage folder (ALIBI_STORAGE_DIR). Only the last part
        # of the client's file name is kept, so "a/b.pdf" or "..\\x" cannot leave the folder
        # or fail on a missing sub-folder.
        storage_dir = Path(settings.alibi_storage_dir) / "evidence" / str(self.user_id)
        storage_dir.mkdir(parents=True, exist_ok=True)
        safe_name = Path(filename.replace("\\", "/")).name.strip() or "file"
        target_path = storage_dir / f"{sha256}_{safe_name}"
        target_path.write_bytes(content)

        evidence = Evidence(
            id=uuid.uuid4(),
            user_id=self.user_id,
            task_id=task_id,
            kind="file",
            title=filename,
            storage_key=str(target_path),
            mime=normalized_mime,
            size_bytes=size_bytes,
            sha256=sha256,
            is_deliverable=is_deliverable,
        )
        await self.evidence_repo.create(evidence)
        return evidence

    async def add_link_or_text_evidence(
        self,
        task_id: uuid.UUID,
        kind: str,
        title: str,
        url: str | None = None,
        text_content: str | None = None,
        is_deliverable: bool = False,
    ) -> Evidence:
        """Create URL link or note evidence."""
        task = await self.task_repo.get_by_id(task_id)
        if not task:
            raise NotFoundError("Task not found.")

        if kind not in ("link", "text"):
            raise ProblemException(
                status=400,
                title="Bad Request",
                detail="Evidence kind must be 'file', 'link', or 'text'.",
            )

        evidence = Evidence(
            id=uuid.uuid4(),
            user_id=self.user_id,
            task_id=task_id,
            kind=kind,
            title=title,
            url=url,
            text=text_content,
            is_deliverable=is_deliverable,
        )
        await self.evidence_repo.create(evidence)
        return evidence

    async def get_evidence(self, evidence_id: uuid.UUID) -> Evidence:
        """Fetch evidence entry, requiring user ownership."""
        evidence = await self.evidence_repo.get_by_id(evidence_id)
        if not evidence:
            raise NotFoundError("Evidence not found.")
        return evidence

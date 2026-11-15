"""Evidence and attachments API router (doc 04 §4.6)."""

import uuid
from collections.abc import Sequence
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.errors import NotFoundError, ProblemException
from app.models.evidence import Evidence
from app.repositories.evidence_repo import EvidenceRepository
from app.schemas.evidence import EvidenceResponse, EvidenceTextOrLinkRequest
from app.services.evidence_service import EvidenceService

router = APIRouter(tags=["evidence"])


@router.post(
    "/tasks/{task_id}/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_evidence(
    task_id: uuid.UUID,
    data: EvidenceTextOrLinkRequest | None = None,
    file: UploadFile = File(None),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Evidence:
    """Upload file attachment or add link/note evidence to a task."""
    service = EvidenceService(db, auth.user_id)

    if file:
        content = await file.read()
        mime_type = file.content_type or "application/octet-stream"
        filename = file.filename or "attachment"
        return await service.add_file_evidence(
            task_id=task_id,
            filename=filename,
            content=content,
            mime_type=mime_type,
            is_deliverable=False,
        )

    if data:
        return await service.add_link_or_text_evidence(
            task_id=task_id,
            kind=data.kind,
            title=data.title,
            url=data.url,
            text_content=data.text,
            is_deliverable=data.is_deliverable,
        )

    raise ProblemException(
        status=400,
        title="Bad Request",
        detail="Either a file upload or link/text JSON body is required.",
    )


@router.get("/tasks/{task_id}/evidence", response_model=list[EvidenceResponse])
async def list_task_evidence(
    task_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> Sequence[Evidence]:
    """List all evidence attached to a task."""
    repo = EvidenceRepository(db, auth.user_id)
    return await repo.list_for_task(task_id)


@router.get("/evidence/{evidence_id}/download")
async def download_evidence(
    evidence_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    """Download evidence file attachment. Strictly requires authentication (AC-M2-9)."""
    service = EvidenceService(db, auth.user_id)
    evidence = await service.get_evidence(evidence_id)

    if evidence.kind != "file" or not evidence.storage_key:
        raise ProblemException(
            status=400,
            title="Bad Request",
            detail="Evidence is not a downloadable file.",
        )

    file_path = Path(evidence.storage_key)
    if not file_path.exists():
        raise NotFoundError("Evidence file not found on server storage.")

    return FileResponse(
        path=file_path,
        media_type=evidence.mime or "application/octet-stream",
        filename=evidence.title,
    )


@router.delete("/evidence/{evidence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_evidence(
    evidence_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft delete an evidence attachment."""
    repo = EvidenceRepository(db, auth.user_id)
    deleted = await repo.soft_delete(evidence_id)
    if not deleted:
        raise NotFoundError("Evidence not found.")

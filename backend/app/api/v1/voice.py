"""Voice STT and capture API endpoints (doc 06 §8, ADR-020)."""

from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.grounding_validator import GroundingValidator
from app.api.deps import AuthContext, get_auth_context, get_db
from app.core.config import settings
from app.core.crypto import decrypt_api_key
from app.models.ai_provider import AIProviderSetting
from app.services.rules_parser import RulesParser

router = APIRouter(prefix="/voice", tags=["Voice"])


class TranscriptionResponse(BaseModel):
    text: str
    language: str = "en"
    duration_s: float | None = None


class VoiceCaptureResponse(BaseModel):
    transcription: TranscriptionResponse
    parsed_draft: dict[str, Any]


async def _transcribe_audio(
    file_bytes: bytes, filename: str, user_id: Any, db: AsyncSession
) -> TranscriptionResponse:
    """Transcribe audio bytes using Groq Whisper if external AI permitted."""
    if not settings.ai_external_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="External AI is disabled in settings (AI_EXTERNAL_ENABLED=false). Voice transcription unavailable.",
        )

    from sqlalchemy import select

    # Get Groq API key from settings
    stmt = select(AIProviderSetting).where(
        AIProviderSetting.user_id == user_id,
        AIProviderSetting.provider == "groq",
    )
    res = await db.execute(stmt)
    setting = res.scalar_one_or_none()
    if not setting or not setting.api_key_encrypted:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Groq provider is not configured or missing API key for voice transcription.",
        )

    api_key = decrypt_api_key(setting.api_key_encrypted)

    # Forward to Groq Whisper endpoint without saving audio to disk
    url = "https://api.groq.com/openai/v1/audio/transcriptions"
    headers = {"Authorization": f"Bearer {api_key}"}
    files = {"file": (filename or "audio.wav", file_bytes, "audio/wav")}
    data = {"model": "whisper-large-v3", "response_format": "json"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, files=files, data=data)
            resp.raise_for_status()
            res_data = resp.json()
            return TranscriptionResponse(
                text=res_data.get("text", "").strip(),
                language="en",
            )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Groq Whisper transcription failed: HTTP {e.response.status_code}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Voice transcription request failed: {e}",
        ) from e


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> TranscriptionResponse:
    """Transcribe voice audio to text without persisting audio to disk (privacy by default)."""
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty.",
        )
    return await _transcribe_audio(file_bytes, file.filename or "audio.wav", auth.user.id, db)


@router.post("/capture", response_model=VoiceCaptureResponse)
async def voice_capture_endpoint(
    file: UploadFile = File(...),
    auth: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
) -> VoiceCaptureResponse:
    """Transcribe voice audio and run it through the grounded task extraction pipeline."""
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded audio file is empty.",
        )
    transcription = await _transcribe_audio(
        file_bytes, file.filename or "audio.wav", auth.user.id, db
    )

    # Parse extracted text with deterministic rules parser
    parser = RulesParser(default_tz=auth.user.timezone)
    rules_res = parser.parse(transcription.text)

    # Grounded validator
    validator = GroundingValidator(timezone=auth.user.timezone)
    final_proposal = validator.validate(
        raw_input=transcription.text,
        rules_result=rules_res,
        llm_output={},
        existing_projects=[],
    )

    return VoiceCaptureResponse(
        transcription=transcription,
        parsed_draft=final_proposal,
    )

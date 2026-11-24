"""0017_allow_openrouter_provider

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-24

OpenRouter joined the supported providers in ADR-028, but the ai_provider_settings check
constraint still listed only the original four, so saving any OpenRouter setting failed
with a server error (logic audit 2026-11-24). This widens the list.

Downgrade restores the narrower list as NOT VALID: existing OpenRouter rows are kept
(no user data is deleted) and only new rows are checked.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "ai_provider_settings"
NAME = "chk_ai_provider_name"


def upgrade() -> None:
    op.drop_constraint(NAME, TABLE, type_="check")
    op.create_check_constraint(
        NAME, TABLE, "provider IN ('ollama', 'nvidia', 'gemini', 'groq', 'openrouter')"
    )


def downgrade() -> None:
    op.drop_constraint(NAME, TABLE, type_="check")
    op.execute(
        f"ALTER TABLE {TABLE} ADD CONSTRAINT {NAME} "
        "CHECK (provider IN ('ollama', 'nvidia', 'gemini', 'groq')) NOT VALID"
    )

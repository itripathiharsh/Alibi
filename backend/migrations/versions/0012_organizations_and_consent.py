"""0012_organizations_and_consent

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-17

Add organization roles, revocable invitations, and professional-only consent (FR-ORG-001..006).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("slug", sa.String(90), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
        sa.CheckConstraint("status IN ('active','suspended','deleted')", name="ck_organizations_status"),
    )
    op.create_index("ix_organizations_owner_user_id", "organizations", ["owner_user_id"])

    op.create_table(
        "organization_memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("professional_sharing_consent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("consent_version", sa.String(32), nullable=True),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_membership_org_user"),
        sa.CheckConstraint("role IN ('owner','team_lead','member')", name="ck_org_memberships_role"),
        sa.CheckConstraint("status IN ('active','left','revoked')", name="ck_org_memberships_status"),
        sa.CheckConstraint(
            "(professional_sharing_consent AND consented_at IS NOT NULL AND consent_version IS NOT NULL) "
            "OR (NOT professional_sharing_consent AND consented_at IS NULL)",
            name="ck_org_memberships_consent_fields",
        ),
    )
    op.create_index("ix_org_memberships_org_status", "organization_memberships", ["organization_id", "status"])
    op.create_index("ix_org_memberships_user_status", "organization_memberships", ["user_id", "status"])

    op.create_table(
        "organization_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('team_lead','member')", name="ck_org_invites_role"),
    )
    op.create_index("ix_org_invites_org_created", "organization_invites", ["organization_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_org_invites_org_created", table_name="organization_invites")
    op.drop_table("organization_invites")
    op.drop_index("ix_org_memberships_user_status", table_name="organization_memberships")
    op.drop_index("ix_org_memberships_org_status", table_name="organization_memberships")
    op.drop_table("organization_memberships")
    op.drop_index("ix_organizations_owner_user_id", table_name="organizations")
    op.drop_table("organizations")

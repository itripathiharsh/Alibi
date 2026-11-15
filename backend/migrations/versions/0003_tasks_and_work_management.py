"""0003_tasks_and_work_management

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-15 23:50:00.000000

Implements M2 Task 1: projects, tags, tasks, subtasks, task_tags, task_dependencies,
recurrence_rules, task_events, time_entries, evidence, ai_extractions, work_logs.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Projects table
    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("color", sa.String(length=20), server_default="#3B82F6", nullable=False),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.CheckConstraint("status IN ('active', 'paused', 'done', 'archived')", name="chk_project_status"),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"])
    op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"])
    op.create_index("ix_projects_category_id", "projects", ["category_id"])

    op.execute("CREATE TRIGGER trg_projects_sync_init BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_projects_sync_bump BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 2. Tags table
    op.create_table(
        "tags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
    )
    op.create_index("ix_tags_user_id", "tags", ["user_id"])
    op.execute("CREATE UNIQUE INDEX uq_tags_user_lower_name ON tags (user_id, lower(name)) WHERE deleted_at IS NULL;")

    op.execute("CREATE TRIGGER trg_tags_sync_init BEFORE INSERT ON tags FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_tags_sync_bump BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 3. Recurrence Rules table
    op.create_table(
        "recurrence_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("rrule", sa.String(length=255), nullable=False),
        sa.Column("dtstart", sa.DateTime(timezone=True), nullable=False),
        sa.Column("until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("generated_until", sa.Date(), nullable=True),
        sa.Column("source", sa.String(length=30), server_default="user", nullable=False),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
    )
    op.create_index("ix_recurrence_rules_user_id", "recurrence_rules", ["user_id"])

    op.execute("CREATE TRIGGER trg_recurrence_rules_sync_init BEFORE INSERT ON recurrence_rules FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_recurrence_rules_sync_bump BEFORE UPDATE ON recurrence_rules FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 4. Tasks table
    op.create_table(
        "tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("raw_input", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("priority", sa.SmallInteger(), nullable=True),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deadline_kind", sa.String(length=10), nullable=True),
        sa.Column("deadline_source", sa.String(length=20), nullable=True),
        sa.Column("estimate_user_min", sa.Integer(), nullable=True),
        sa.Column("estimate_ai_min", sa.Integer(), nullable=True),
        sa.Column("estimate_final_min", sa.Integer(), nullable=True),
        sa.Column("actual_min", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("origin", sa.String(length=30), server_default="manual", nullable=False),
        sa.Column("origin_ref", sa.String(length=255), nullable=True),
        sa.Column("recurrence_rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recurrence_rules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recurrence_instance_date", sa.Date(), nullable=True),
        sa.Column("reschedule_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("parse_status", sa.String(length=20), server_default="none", nullable=False),
        sa.Column("completion_note", sa.Text(), nullable=True),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        # Check constraints
        sa.CheckConstraint("status IN ('pending', 'in_progress', 'completed', 'cancelled')", name="chk_task_status"),
        sa.CheckConstraint("priority IS NULL OR (priority >= 1 AND priority <= 4)", name="chk_task_priority"),
        sa.CheckConstraint("deadline_kind IS NULL OR deadline_kind IN ('hard', 'soft')", name="chk_task_deadline_kind"),
        sa.CheckConstraint("deadline_source IS NULL OR deadline_source IN ('user', 'extraction', 'recurrence')", name="chk_task_deadline_source"),
        sa.CheckConstraint("origin IN ('manual', 'voice', 'ai_recommendation', 'meeting', 'external_assignment', 'recurring')", name="chk_task_origin"),
        sa.CheckConstraint("parse_status IN ('none', 'pending', 'proposed', 'accepted', 'failed')", name="chk_task_parse_status"),
        sa.CheckConstraint("estimate_user_min IS NULL OR (estimate_user_min > 0 AND estimate_user_min <= 10080)", name="chk_task_estimate_user"),
        sa.CheckConstraint("estimate_ai_min IS NULL OR (estimate_ai_min > 0 AND estimate_ai_min <= 10080)", name="chk_task_estimate_ai"),
        sa.CheckConstraint("estimate_final_min IS NULL OR (estimate_final_min > 0 AND estimate_final_min <= 10080)", name="chk_task_estimate_final"),
        sa.CheckConstraint("(status = 'completed' AND completed_at IS NOT NULL) OR (status != 'completed')", name="chk_task_completed_at"),
    )
    op.create_index("ix_tasks_user_id", "tasks", ["user_id"])
    op.create_index("ix_tasks_workspace_id", "tasks", ["workspace_id"])
    op.create_index("ix_tasks_category_id", "tasks", ["category_id"])
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_user_status_deadline", "tasks", ["user_id", "status", "deadline_at"])
    op.create_index("ix_tasks_user_completed_at", "tasks", ["user_id", "completed_at"])
    op.create_index("ix_tasks_user_server_seq", "tasks", ["user_id", "server_seq"])
    op.execute("CREATE INDEX ix_tasks_title_trgm ON tasks USING gin (title gin_trgm_ops);")
    op.execute("""
    CREATE UNIQUE INDEX uq_tasks_recurrence_instance
    ON tasks (recurrence_rule_id, recurrence_instance_date)
    WHERE deleted_at IS NULL AND recurrence_rule_id IS NOT NULL;
    """)

    op.execute("CREATE TRIGGER trg_tasks_sync_init BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_tasks_sync_bump BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 5. Subtasks table
    op.create_table(
        "subtasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("is_done", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
    )
    op.create_index("ix_subtasks_user_id", "subtasks", ["user_id"])
    op.create_index("ix_subtasks_task_id", "subtasks", ["task_id"])

    op.execute("CREATE TRIGGER trg_subtasks_sync_init BEFORE INSERT ON subtasks FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_subtasks_sync_bump BEFORE UPDATE ON subtasks FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 6. Task Tags table
    op.create_table(
        "task_tags",
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
    )
    op.create_index("ix_task_tags_user_id", "task_tags", ["user_id"])

    op.execute("CREATE TRIGGER trg_task_tags_sync_init BEFORE INSERT ON task_tags FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_task_tags_sync_bump BEFORE UPDATE ON task_tags FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 7. Task Dependencies table
    op.create_table(
        "task_dependencies",
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("depends_on_task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.CheckConstraint("task_id != depends_on_task_id", name="chk_no_self_dependency"),
    )
    op.create_index("ix_task_dependencies_user_id", "task_dependencies", ["user_id"])

    op.execute("CREATE TRIGGER trg_task_dependencies_sync_init BEFORE INSERT ON task_dependencies FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_task_dependencies_sync_bump BEFORE UPDATE ON task_dependencies FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 8. Task Events table (Append-only)
    op.create_table(
        "task_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("changes", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("actor", sa.String(length=20), server_default="user", nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.CheckConstraint("actor IN ('user', 'ai', 'system', 'sync')", name="chk_task_event_actor"),
    )
    op.create_index("ix_task_events_user_id", "task_events", ["user_id"])
    op.create_index("ix_task_events_task_occurred", "task_events", ["task_id", "occurred_at"])
    op.create_index("ix_task_events_event_type", "task_events", ["event_type"])

    op.execute("""
    CREATE TRIGGER trg_task_events_append_only
    BEFORE UPDATE OR DELETE ON task_events
    FOR EACH ROW EXECUTE FUNCTION trg_append_only();
    """)

    # 9. Time Entries table
    op.create_table(
        "time_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_min", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=20), server_default="timer", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.CheckConstraint("source IN ('timer', 'manual', 'pomodoro')", name="chk_time_entry_source"),
        sa.CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="chk_time_entry_bounds"),
        sa.CheckConstraint("duration_min IS NULL OR (duration_min >= 1 AND duration_min <= 1440)", name="chk_time_entry_duration"),
    )
    op.create_index("ix_time_entries_user_id", "time_entries", ["user_id"])
    op.create_index("ix_time_entries_task_id", "time_entries", ["task_id"])
    op.execute("""
    CREATE UNIQUE INDEX uq_time_entries_running_timer
    ON time_entries (user_id)
    WHERE ended_at IS NULL AND deleted_at IS NULL;
    """)

    op.execute("CREATE TRIGGER trg_time_entries_sync_init BEFORE INSERT ON time_entries FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_time_entries_sync_bump BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 10. Evidence table
    op.create_table(
        "evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("storage_key", sa.String(length=255), nullable=True),
        sa.Column("mime", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("is_deliverable", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.CheckConstraint("kind IN ('file', 'link', 'text')", name="chk_evidence_kind"),
    )
    op.create_index("ix_evidence_user_id", "evidence", ["user_id"])
    op.create_index("ix_evidence_task_id", "evidence", ["task_id"])

    op.execute("CREATE TRIGGER trg_evidence_sync_init BEFORE INSERT ON evidence FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_evidence_sync_bump BEFORE UPDATE ON evidence FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")

    # 11. AI Extractions table
    op.create_table(
        "ai_extractions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("input_text", sa.Text(), nullable=False),
        sa.Column("rules_result", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("llm_result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("final_proposal", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("clarification", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=True),
        sa.Column("model", sa.String(length=50), nullable=True),
        sa.Column("prompt_version", sa.String(length=50), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="proposed", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_decision", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index("ix_ai_extractions_user_id", "ai_extractions", ["user_id"])
    op.create_index("ix_ai_extractions_task_id", "ai_extractions", ["task_id"])

    # 12. Work Logs table
    op.create_table(
        "work_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("task_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        # SyncableMixin
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("server_seq", sa.BigInteger(), server_default=sa.text("nextval('sync_seq')"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_modified_device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("field_versions", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
    )
    op.create_index("ix_work_logs_user_id", "work_logs", ["user_id"])
    op.create_index("ix_work_logs_log_date", "work_logs", ["log_date"])

    op.execute("CREATE TRIGGER trg_work_logs_sync_init BEFORE INSERT ON work_logs FOR EACH ROW EXECUTE FUNCTION trg_sync_init();")
    op.execute("CREATE TRIGGER trg_work_logs_sync_bump BEFORE UPDATE ON work_logs FOR EACH ROW EXECUTE FUNCTION trg_sync_bump();")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_work_logs_sync_bump ON work_logs;")
    op.execute("DROP TRIGGER IF EXISTS trg_work_logs_sync_init ON work_logs;")
    op.drop_table("work_logs")

    op.drop_table("ai_extractions")

    op.execute("DROP TRIGGER IF EXISTS trg_evidence_sync_bump ON evidence;")
    op.execute("DROP TRIGGER IF EXISTS trg_evidence_sync_init ON evidence;")
    op.drop_table("evidence")

    op.execute("DROP TRIGGER IF EXISTS trg_time_entries_sync_bump ON time_entries;")
    op.execute("DROP TRIGGER IF EXISTS trg_time_entries_sync_init ON time_entries;")
    op.drop_table("time_entries")

    op.execute("DROP TRIGGER IF EXISTS trg_task_events_append_only ON task_events;")
    op.drop_table("task_events")

    op.execute("DROP TRIGGER IF EXISTS trg_task_dependencies_sync_bump ON task_dependencies;")
    op.execute("DROP TRIGGER IF EXISTS trg_task_dependencies_sync_init ON task_dependencies;")
    op.drop_table("task_dependencies")

    op.execute("DROP TRIGGER IF EXISTS trg_task_tags_sync_bump ON task_tags;")
    op.execute("DROP TRIGGER IF EXISTS trg_task_tags_sync_init ON task_tags;")
    op.drop_table("task_tags")

    op.execute("DROP TRIGGER IF EXISTS trg_subtasks_sync_bump ON subtasks;")
    op.execute("DROP TRIGGER IF EXISTS trg_subtasks_sync_init ON subtasks;")
    op.drop_table("subtasks")

    op.execute("DROP TRIGGER IF EXISTS trg_tasks_sync_bump ON tasks;")
    op.execute("DROP TRIGGER IF EXISTS trg_tasks_sync_init ON tasks;")
    op.drop_table("tasks")

    op.execute("DROP TRIGGER IF EXISTS trg_recurrence_rules_sync_bump ON recurrence_rules;")
    op.execute("DROP TRIGGER IF EXISTS trg_recurrence_rules_sync_init ON recurrence_rules;")
    op.drop_table("recurrence_rules")

    op.execute("DROP TRIGGER IF EXISTS trg_tags_sync_bump ON tags;")
    op.execute("DROP TRIGGER IF EXISTS trg_tags_sync_init ON tags;")
    op.drop_table("tags")

    op.execute("DROP TRIGGER IF EXISTS trg_projects_sync_bump ON projects;")
    op.execute("DROP TRIGGER IF EXISTS trg_projects_sync_init ON projects;")
    op.drop_table("projects")


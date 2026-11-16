"""Domain models exported for Alembic metadata and application services."""

from app.database.base import Base, SyncableMixin
from app.models.ai_extraction import AIExtraction
from app.models.ai_provider import AIProviderSetting, AIUsageLog
from app.models.audit_log import AuditLog
from app.models.calendar import CalendarEvent, ScheduleRecommendation
from app.models.category import Category
from app.models.device import Device
from app.models.evidence import Evidence
from app.models.job import Job
from app.models.learning import (
    BehaviorObservation,
    LearnedPattern,
    MemoryProfile,
    MLModel,
    TaskPrediction,
)
from app.models.notification import Notification
from app.models.project import Project
from app.models.recurrence_rule import RecurrenceRule
from app.models.refresh_token import RefreshToken
from app.models.report import Report, ReportShare, ReportShareAccessLog
from app.models.subtask import Subtask
from app.models.sync import SyncConflict, SyncOperation
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_dependency import TaskDependency
from app.models.task_event import TaskEvent
from app.models.task_tag import TaskTag
from app.models.time_entry import TimeEntry
from app.models.user import User
from app.models.vault import ChatMessage, ChatThread, Note, NoteEmbedding
from app.models.work_log import WorkLog
from app.models.workspace import Workspace

__all__ = [
    "Base",
    "SyncableMixin",
    "User",
    "Device",
    "RefreshToken",
    "AuditLog",
    "CalendarEvent",
    "ScheduleRecommendation",
    "Job",
    "Workspace",
    "Category",
    "Project",
    "Tag",
    "TaskTag",
    "Task",
    "Subtask",
    "TaskDependency",
    "RecurrenceRule",
    "TaskEvent",
    "TimeEntry",
    "Evidence",
    "AIExtraction",
    "AIProviderSetting",
    "AIUsageLog",
    "BehaviorObservation",
    "LearnedPattern",
    "MemoryProfile",
    "TaskPrediction",
    "MLModel",
    "Notification",
    "Note",
    "NoteEmbedding",
    "ChatThread",
    "ChatMessage",
    "Report",
    "ReportShare",
    "ReportShareAccessLog",
    "SyncOperation",
    "SyncConflict",
    "WorkLog",
]

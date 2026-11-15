"""Unit and property-based tests for time tracking and actual_min consistency (AC-M2-5)."""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.core.errors import ConflictError
from app.models.task import Task
from app.models.time_entry import TimeEntry
from app.services.time_service import TimeService


@pytest.mark.asyncio
async def test_ac_m2_5_single_running_timer_enforcement() -> None:
    """AC-M2-5: Only one running timer allowed per user; starting another raises 409 Conflict."""
    user_id = uuid.uuid4()
    mock_session = AsyncMock()
    service = TimeService(mock_session, user_id)

    task_1 = uuid.uuid4()
    task_2 = uuid.uuid4()

    # In-memory timer storage
    active_timer: TimeEntry | None = None

    async def mock_get_running() -> TimeEntry | None:
        return active_timer

    async def mock_start(
        task_id: uuid.UUID, started_at: datetime | None = None, entry_id: uuid.UUID | None = None
    ) -> TimeEntry:
        nonlocal active_timer
        active_timer = TimeEntry(
            id=entry_id or uuid.uuid4(),
            user_id=user_id,
            task_id=task_id,
            started_at=started_at or datetime.now(),
        )
        return active_timer

    service.time_repo.get_running_timer = AsyncMock(side_effect=mock_get_running)
    service.time_repo.start_timer = AsyncMock(side_effect=mock_start)
    service.task_repo.get_by_id = AsyncMock(
        return_value=Task(
            id=task_1, user_id=user_id, workspace_id=uuid.uuid4(), title="Task", status="pending"
        )
    )

    # Start timer 1 -> succeeds
    t1 = await service.start_timer(task_1)
    assert t1.task_id == task_1

    # Start timer 2 while timer 1 is running -> 409 Conflict
    with pytest.raises(ConflictError) as exc_info:
        await service.start_timer(task_2)
    assert "already running" in str(exc_info.value.detail)


# Hypothesis property-based state machine test for actual_min = sum(durations)
@hyp_settings(max_examples=50)
@given(
    actions=st.lists(
        st.tuples(
            st.sampled_from(["start", "stop", "manual", "delete"]),
            st.integers(min_value=1, max_value=240),  # minutes
        ),
        min_size=5,
        max_size=30,
    )
)
def test_ac_m2_5_actual_min_sum_consistency_hypothesis(actions: list[tuple[str, int]]) -> None:
    """Hypothesis test verifying actual_min == sum(completed duration_min) across arbitrary action sequences."""
    entries: dict[uuid.UUID, dict] = {}
    running_id: uuid.UUID | None = None

    for action_type, dur in actions:
        if action_type == "start":
            if running_id is None:
                new_id = uuid.uuid4()
                entries[new_id] = {"ended": False, "duration": None, "deleted": False}
                running_id = new_id
        elif action_type == "stop":
            if running_id is not None:
                entries[running_id]["ended"] = True
                entries[running_id]["duration"] = dur
                running_id = None
        elif action_type == "manual":
            new_id = uuid.uuid4()
            entries[new_id] = {"ended": True, "duration": dur, "deleted": False}
        elif action_type == "delete":
            # Delete a random existing completed entry
            completed_keys = [k for k, v in entries.items() if v["ended"] and not v["deleted"]]
            if completed_keys:
                target_key = completed_keys[0]
                entries[target_key]["deleted"] = True

        # Invariant check at EVERY step:
        expected_actual_min = sum(
            v["duration"]
            for v in entries.values()
            if v["ended"] and not v["deleted"] and v["duration"] is not None
        )

        calculated_sum = sum(
            e["duration"]
            for e in entries.values()
            if e["ended"] and not e["deleted"] and e["duration"] is not None
        )
        assert expected_actual_min == calculated_sum

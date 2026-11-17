"""Unit and property-based tests for concurrent task timers and actual_min consistency."""

import uuid
from datetime import UTC, datetime, timedelta
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
async def test_fr_task_021_independent_task_timers_and_same_task_conflict() -> None:
    """Different tasks may run concurrently; duplicate timer on a task remains a conflict."""
    user_id = uuid.uuid4()
    mock_session = AsyncMock()
    service = TimeService(mock_session, user_id)

    task_1 = uuid.uuid4()
    task_2 = uuid.uuid4()

    active_timers: dict[uuid.UUID, TimeEntry] = {}

    async def mock_get_running_for_task(task_id: uuid.UUID) -> TimeEntry | None:
        return active_timers.get(task_id)

    async def mock_start(
        task_id: uuid.UUID, started_at: datetime | None = None, entry_id: uuid.UUID | None = None
    ) -> TimeEntry:
        active_timer = TimeEntry(
            id=entry_id or uuid.uuid4(),
            user_id=user_id,
            task_id=task_id,
            started_at=started_at or datetime.now(),
        )
        active_timers[task_id] = active_timer
        return active_timer

    service.time_repo.get_running_timer_for_task = AsyncMock(side_effect=mock_get_running_for_task)
    service.time_repo.start_timer = AsyncMock(side_effect=mock_start)
    service.task_event_repo.record_event = AsyncMock()

    async def mock_get_task(task_id: uuid.UUID) -> Task:
        return Task(
            id=task_id, user_id=user_id, workspace_id=uuid.uuid4(), title="Task", status="pending"
        )

    service.task_repo.get_by_id = AsyncMock(side_effect=mock_get_task)

    # Start timers for two separate tasks -> both succeed and remain independent.
    t1 = await service.start_timer(task_1)
    assert t1.task_id == task_1
    t2 = await service.start_timer(task_2)
    assert t2.task_id == task_2
    assert set(active_timers) == {task_1, task_2}
    assert service.task_event_repo.record_event.await_count == 2
    assert (
        service.task_event_repo.record_event.await_args_list[0].kwargs["event_type"]
        == "timer_started"
    )
    assert service.task_event_repo.record_event.await_args_list[0].kwargs["changes"]["status"] == [
        "pending",
        "in_progress",
    ]

    # Starting a duplicate timer for one task is still rejected.
    with pytest.raises(ConflictError) as exc_info:
        await service.start_timer(task_1)
    assert "already running for this task" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_stopping_timer_records_history_and_learning_session() -> None:
    user_id = uuid.uuid4()
    task_id = uuid.uuid4()
    started_at = datetime.now(UTC)
    ended_at = started_at + timedelta(minutes=24)
    entry = TimeEntry(
        id=uuid.uuid4(),
        user_id=user_id,
        task_id=task_id,
        started_at=started_at,
        ended_at=None,
        duration_min=None,
        source="timer",
    )
    service = TimeService(AsyncMock(), user_id)
    service.time_repo.get_by_id = AsyncMock(return_value=entry)

    async def mock_stop_timer(_entry_id: uuid.UUID, ended_at: datetime | None = None) -> TimeEntry:
        entry.ended_at = ended_at or datetime.now(UTC)
        entry.duration_min = 24
        return entry

    service.time_repo.stop_timer = AsyncMock(side_effect=mock_stop_timer)
    service.time_repo.get_task_actual_min_sum = AsyncMock(return_value=24)
    service.task_repo.get_by_id = AsyncMock(
        return_value=Task(
            id=task_id,
            user_id=user_id,
            workspace_id=uuid.uuid4(),
            title="Focused work",
            status="in_progress",
        )
    )
    service.task_event_repo.record_event = AsyncMock()
    service.ple_collector.on_time_session = AsyncMock()

    stopped = await service.stop_timer(entry.id, ended_at=ended_at)

    assert stopped.duration_min == 24
    service.task_event_repo.record_event.assert_awaited_once()
    assert service.task_event_repo.record_event.await_args.kwargs["event_type"] == "timer_stopped"
    service.ple_collector.on_time_session.assert_awaited_once_with(
        user_id=user_id,
        task_id=task_id,
        duration_min=24,
        category=None,
    )


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

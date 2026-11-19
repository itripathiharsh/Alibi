"""Unit test for task state transition state machine (AC-M2-3).
Exhaustively tests all 16 state pairs across ('pending', 'in_progress', 'completed', 'cancelled').
"""

import uuid
from unittest.mock import AsyncMock, Mock

import pytest

from app.core.errors import ConflictError
from app.models.task import Task
from app.services.task_service import VALID_STATUS_TRANSITIONS, TaskService

STATUSES = ["pending", "in_progress", "completed", "cancelled"]


@pytest.mark.asyncio
async def test_ac_m2_3_status_transition_table_16_pairs() -> None:
    """AC-M2-3: All valid transitions succeed, all invalid -> 409 Conflict."""
    user_id = uuid.uuid4()
    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        return_value=Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=[]))))
    )

    service = TaskService(mock_session, user_id)

    tested_pairs = 0
    for from_status in STATUSES:
        for to_status in STATUSES:
            tested_pairs += 1
            is_valid = VALID_STATUS_TRANSITIONS.get((from_status, to_status), False)

            # Setup task with from_status
            task_id = uuid.uuid4()
            task = Task(
                id=task_id,
                user_id=user_id,
                workspace_id=uuid.uuid4(),
                title="Test Transition Task",
                status=from_status,
            )

            service.task_repo.get_by_id = AsyncMock(return_value=task)
            service.task_event_repo.record_event = AsyncMock()

            if is_valid:
                updated = await service.update_status(task_id, to_status)
                assert updated.status == to_status, (
                    f"Expected transition {from_status} -> {to_status} to succeed"
                )
                service.task_event_repo.record_event.assert_awaited()
            else:
                with pytest.raises(ConflictError) as exc_info:
                    await service.update_status(task_id, to_status)
                assert "Invalid status transition" in str(exc_info.value.detail)

    assert tested_pairs == 16, f"Expected exactly 16 pairs tested, got {tested_pairs}"

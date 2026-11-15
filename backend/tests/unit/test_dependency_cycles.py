"""Unit tests for dependency cycle prevention (AC-M2-7)."""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.core.errors import ConflictError
from app.models.task import Task
from app.services.dependency_service import DependencyService


@pytest.mark.asyncio
async def test_ac_m2_7_dependency_cycle_rejection() -> None:
    """AC-M2-7: Reject direct and transitive dependency cycles (A -> B -> C -> A)."""
    user_id = uuid.uuid4()
    mock_session = AsyncMock()

    service = DependencyService(mock_session, user_id)

    task_a = uuid.uuid4()
    task_b = uuid.uuid4()
    task_c = uuid.uuid4()

    # Mock tasks existence
    def mock_get_by_id(tid: uuid.UUID) -> Task:
        return Task(id=tid, user_id=user_id, workspace_id=uuid.uuid4(), title=f"Task {tid}")

    service.task_repo.get_by_id = AsyncMock(side_effect=mock_get_by_id)

    # In-memory edge graph: list of (task_id, depends_on_task_id)
    edges: list[tuple[uuid.UUID, uuid.UUID]] = []

    async def mock_get_all_edges() -> list[tuple[uuid.UUID, uuid.UUID]]:
        return list(edges)

    async def mock_list_deps(tid: uuid.UUID) -> list[uuid.UUID]:
        return [v for u, v in edges if u == tid]

    async def mock_add_dep(u: uuid.UUID, v: uuid.UUID) -> None:
        edges.append((u, v))

    service.dep_repo.get_all_edges = AsyncMock(side_effect=mock_get_all_edges)
    service.dep_repo.list_dependencies = AsyncMock(side_effect=mock_list_deps)
    service.dep_repo.add_dependency = AsyncMock(side_effect=mock_add_dep)

    # 1. Self-dependency A -> A must fail
    with pytest.raises(ConflictError) as exc_self:
        await service.add_dependency(task_a, task_a)
    assert "cannot depend on itself" in str(exc_self.value.detail)

    # 2. Add valid edge: A depends on B
    await service.add_dependency(task_a, task_b)
    assert (task_a, task_b) in edges

    # 3. Add valid edge: B depends on C
    await service.add_dependency(task_b, task_c)
    assert (task_b, task_c) in edges

    # Graph now: A -> B -> C (A depends on B, B depends on C)
    # Attempting to add C depends on A must be rejected as a cycle!
    with pytest.raises(ConflictError) as exc_cycle:
        await service.add_dependency(task_c, task_a)
    assert "Dependency cycle detected" in str(exc_cycle.value.detail)

    # Also direct 2-node cycle: B depends on A must fail
    with pytest.raises(ConflictError) as exc_cycle_2:
        await service.add_dependency(task_b, task_a)
    assert "Dependency cycle detected" in str(exc_cycle_2.value.detail)

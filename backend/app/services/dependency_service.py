"""Dependency service enforcing DAG constraints and DFS cycle prevention (AC-M2-7)."""

import uuid
from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.repositories.task_dependency_repo import TaskDependencyRepository
from app.repositories.task_repo import TaskRepository


class DependencyService:
    """Service managing task dependency edges and cycle detection."""

    def __init__(self, session: AsyncSession, user_id: uuid.UUID) -> None:
        self.session = session
        self.user_id = user_id
        self.dep_repo = TaskDependencyRepository(session, user_id)
        self.task_repo = TaskRepository(session, user_id)

    async def add_dependency(
        self,
        task_id: uuid.UUID,
        depends_on_task_id: uuid.UUID,
    ) -> None:
        """Add directed dependency edge (task_id depends on depends_on_task_id).
        Rejects self-dependencies and cycles with 409 Conflict.
        """
        if task_id == depends_on_task_id:
            raise ConflictError("A task cannot depend on itself.")

        # Ensure both tasks exist and belong to user
        task = await self.task_repo.get_by_id(task_id)
        blocker = await self.task_repo.get_by_id(depends_on_task_id)
        if not task or not blocker:
            raise NotFoundError("One or both tasks not found.")

        # Check for cycles: Can depends_on_task_id reach task_id via existing edges?
        existing_edges = await self.dep_repo.get_all_edges()
        adj: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
        for u, v in existing_edges:
            adj[u].append(v)

        # If depends_on_task_id can reach task_id, adding (task_id -> depends_on_task_id) creates a cycle
        if self._can_reach(depends_on_task_id, task_id, adj):
            raise ConflictError(
                f"Dependency cycle detected: task {task_id} cannot depend on {depends_on_task_id}."
            )

        # Check if edge already exists
        current_deps = await self.dep_repo.list_dependencies(task_id)
        if depends_on_task_id in current_deps:
            return  # Idempotent

        await self.dep_repo.add_dependency(task_id, depends_on_task_id)

    async def remove_dependency(
        self,
        task_id: uuid.UUID,
        depends_on_task_id: uuid.UUID,
    ) -> bool:
        """Remove a dependency edge."""
        return await self.dep_repo.remove_dependency(task_id, depends_on_task_id)

    async def list_dependencies(self, task_id: uuid.UUID) -> list[uuid.UUID]:
        """List tasks that task_id depends on."""
        return list(await self.dep_repo.list_dependencies(task_id))

    def _can_reach(
        self,
        start: uuid.UUID,
        target: uuid.UUID,
        adj: dict[uuid.UUID, list[uuid.UUID]],
    ) -> bool:
        """Depth-first search to check if target is reachable from start."""
        visited: set[uuid.UUID] = set()
        stack = [start]

        while stack:
            curr = stack.pop()
            if curr == target:
                return True
            if curr not in visited:
                visited.add(curr)
                for neighbor in adj.get(curr, []):
                    if neighbor not in visited:
                        stack.append(neighbor)

        return False

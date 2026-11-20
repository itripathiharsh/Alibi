"""Scheduling Solver Engine (doc 09 §3, §4, AC-SCH-7).

Dispatches to Google OR-Tools CP-SAT solver when available, falling back to
deterministic GreedyScheduler when OR-Tools is unavailable or snapshot is infeasible.
"""

import time as pytime
from typing import Any

from app.scheduling.greedy_solver import GreedyScheduler


class SchedulingSolver:
    """Dispatches to CP-SAT or deterministic Greedy scheduler."""

    def __init__(self, time_limit_s: float = 5.0, seed: int = 42) -> None:
        self.time_limit_s = time_limit_s
        self.seed = seed
        self.greedy = GreedyScheduler()

    def solve(self, snapshot: dict[str, Any]) -> dict[str, Any]:
        """Solve scheduling instance respecting all hard constraints."""
        t0 = pytime.perf_counter()

        # If greedy was explicitly requested, bypass CP-SAT
        if snapshot.get("solver") == "greedy":
            result = self.greedy.solve(snapshot)
            result["solve_ms"] = int((pytime.perf_counter() - t0) * 1000)
            return result

        # Try CP-SAT if installed
        try:
            from app.scheduling.cpsat_solver import CpSatScheduler

            cpsat = CpSatScheduler(time_limit_s=self.time_limit_s, seed=self.seed)
            result = cpsat.solve(snapshot)
            if result.get("solver_status") not in ("cpsat_optimal", "cpsat_feasible"):
                # Fallback to greedy if CP-SAT could not find a feasible solution
                result = self.greedy.solve(snapshot)
        except Exception:
            # Deterministic greedy fallback
            result = self.greedy.solve(snapshot)

        t1 = pytime.perf_counter()
        result["solve_ms"] = int((t1 - t0) * 1000)
        return result

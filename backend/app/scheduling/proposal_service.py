"""Scheduling Proposal Lifecycle and Decision Service (doc 09 §6, AC-SCH-3, AC-SCH-4).

Handles proposal creation, stale input detection (409), and atomic block creation.
"""

import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.learning.collector import PLECollector
from app.models.calendar import CalendarEvent, ScheduleRecommendation
from app.scheduling.input_builder import SchedulingInputBuilder
from app.scheduling.solver import SchedulingSolver


class SchedulingProposalService:
    """Manages life-cycle of AI scheduling proposals."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.input_builder = SchedulingInputBuilder(db)
        self.solver = SchedulingSolver()
        self.collector = PLECollector(db)

    async def generate_proposal(
        self,
        user_id: uuid.UUID,
        scope: str = "day",
        horizon_days: int = 1,
    ) -> ScheduleRecommendation:
        """Generate a new scheduling recommendation."""
        now = utc_now()
        # Round up to next 15-minute slot
        minute_round = (now.minute // 15 + 1) * 15
        horizon_start = now.replace(minute=0, second=0, microsecond=0) + timedelta(
            minutes=minute_round
        )
        horizon_end = horizon_start + timedelta(days=horizon_days)

        snapshot, input_hash = await self.input_builder.build_snapshot(
            user_id, horizon_start, horizon_end
        )
        solve_res = self.solver.solve(snapshot)

        rec = ScheduleRecommendation(
            user_id=user_id,
            scope=scope,
            horizon_start=horizon_start,
            horizon_end=horizon_end,
            status="proposed",
            input_snapshot=snapshot,
            input_hash=input_hash,
            proposals=solve_res.get("proposals", []),
            displacements=solve_res.get("displacements", []),
            unscheduled=solve_res.get("unscheduled", []),
            solver_status=solve_res.get("solver_status", "greedy"),
            objective=solve_res.get("objective", {}),
            solve_ms=solve_res.get("solve_ms", 0),
            created_at=utc_now(),
        )
        self.db.add(rec)
        await self.db.commit()
        await self.db.refresh(rec)
        return rec

    async def decide_proposal(
        self,
        recommendation_id: uuid.UUID,
        user_id: uuid.UUID,
        action: str,  # "accept" | "partially_accept" | "reject"
        accepted_indices: list[int] | None = None,
    ) -> ScheduleRecommendation:
        """Apply or reject proposal. Re-checks input_hash to prevent stale scheduling."""
        stmt = select(ScheduleRecommendation).where(
            ScheduleRecommendation.id == recommendation_id,
            ScheduleRecommendation.user_id == user_id,
        )
        res = await self.db.execute(stmt)
        rec = res.scalar_one_or_none()
        if not rec:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation not found"
            )

        if rec.status != "proposed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Recommendation already resolved with status '{rec.status}'",
            )

        # Stale Check: Recompute input_hash (AC-SCH-4)
        _, current_hash = await self.input_builder.build_snapshot(
            user_id, rec.horizon_start, rec.horizon_end
        )
        if current_hash != rec.input_hash:
            rec.status = "superseded"
            await self.db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Schedule input has changed since proposal was generated (proposal_stale). Please regenerate.",
            )

        # Apply decisions
        now = utc_now()
        proposals_list = rec.proposals or []
        accepted_blocks = []

        if action in ("accept", "partially_accept"):
            indices_to_add = (
                range(len(proposals_list))
                if action == "accept" or accepted_indices is None
                else [i for i in accepted_indices if 0 <= i < len(proposals_list)]
            )

            for idx in indices_to_add:
                prop = proposals_list[idx]
                task_id = uuid.UUID(prop["task_id"]) if prop.get("task_id") else None
                start_dt = datetime.fromisoformat(prop["start_at"])
                end_dt = datetime.fromisoformat(prop["end_at"])

                # Insert work block into calendar_events
                ev = CalendarEvent(
                    user_id=user_id,
                    task_id=task_id,
                    kind="work_block",
                    source="ai_accepted",
                    title=prop["title"],
                    start_at=start_dt,
                    end_at=end_dt,
                    is_all_day=False,
                )
                self.db.add(ev)
                accepted_blocks.append(prop)

            rec.status = (
                "accepted" if len(accepted_blocks) == len(proposals_list) else "partially_accepted"
            )
        else:
            rec.status = "rejected"

        rec.decided_at = now
        rec.decision = {
            "action": action,
            "accepted_count": len(accepted_blocks),
            "rejected_count": len(proposals_list) - len(accepted_blocks),
        }

        # Emit observation to PLE
        await self.collector.record(
            user_id=user_id,
            observation_type="proposal_decision",
            features={
                "action": action,
                "accepted_count": len(accepted_blocks),
                "rejected_count": len(proposals_list) - len(accepted_blocks),
                "solver_status": rec.solver_status,
            },
        )

        await self.db.commit()
        await self.db.refresh(rec)
        return rec

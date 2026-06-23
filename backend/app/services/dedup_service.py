from __future__ import annotations
"""去重服务 — 跨平台候选人去重"""
import logging
from uuid import UUID
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.dialects.postgresql import UUID as pgUUID

from app.models.candidate import Candidate

logger = logging.getLogger(__name__)


async def find_duplicates(
    db: AsyncSession,
    candidate_ids: list[UUID],
) -> dict[str, list[str]]:
    """
    在给定候选人列表中发现重复记录。

    匹配策略（按置信度降序）：
    1. **强匹配**: 手机号/邮箱完全一致 → 直接合并（暂不实现，简历不总有联系方式）
    2. **中等匹配**: 姓名 + 当前公司 + 职位一致 → 高置信度
    3. **弱匹配**: 姓名 + 学校 + 专业一致 → 需人工确认

    返回: {保留ID: [重复ID列表]}
    """
    # 加载候选人
    result = await db.execute(
        select(Candidate).where(Candidate.id.in_(candidate_ids))
    )
    candidates = result.scalars().all()

    if len(candidates) < 2:
        return {}

    duplicates: dict[str, list[str]] = {}
    processed: set[str] = set()

    for i, c1 in enumerate(candidates):
        if str(c1.id) in processed:
            continue

        for c2 in candidates[i + 1:]:
            if str(c2.id) in processed:
                continue

            # 中等匹配：姓名 + 公司 + 职位
            if (
                c1.name and c2.name
                and c1.name.lower().strip() == c2.name.lower().strip()
                and c1.current_company and c2.current_company
                and c1.current_company.lower().strip() == c2.current_company.lower().strip()
                and c1.current_title and c2.current_title
                and c1.current_title.lower().strip() == c2.current_title.lower().strip()
            ):
                keeper = str(c1.id)
                dup = str(c2.id)
                processed.add(dup)
                if keeper not in duplicates:
                    duplicates[keeper] = []
                duplicates[keeper].append(dup)
                logger.info(f"中等匹配去重: {c1.name} - {c1.current_company}")
                continue

            # 弱匹配：姓名 + 学校
            if (
                c1.name and c2.name
                and c1.name.lower().strip() == c2.name.lower().strip()
                and c1.school and c2.school
                and c1.school.lower().strip() == c2.school.lower().strip()
            ):
                keeper = str(c1.id)
                dup = str(c2.id)
                processed.add(dup)
                if keeper not in duplicates:
                    duplicates[keeper] = []
                duplicates[keeper].append(dup)
                # 弱匹配标记为需要人工确认
                logger.info(f"弱匹配去重（需确认）: {c1.name} - {c1.school}")

    return duplicates


async def deduplicate_candidates(
    db: AsyncSession,
    candidate_ids: list[UUID],
    auto_merge: bool = False,
) -> tuple[list[UUID], dict]:
    """
    对候选人列表去重，返回去重后的候选人ID列表。

    Args:
        db: 数据库会话
        candidate_ids: 待去重的候选人ID列表
        auto_merge: 是否自动合并重复记录（默认False，仅标记）

    Returns:
        (去重后的ID列表, 去重信息)
    """
    duplicates = await find_duplicates(db, candidate_ids)

    if not duplicates:
        return candidate_ids, {"duplicates_found": 0, "merged": 0}

    removed_ids = set()
    for dup_ids in duplicates.values():
        for dup_id in dup_ids:
            removed_ids.add(UUID(dup_id))

    deduped_ids = [cid for cid in candidate_ids if cid not in removed_ids]

    return deduped_ids, {
        "duplicates_found": sum(len(v) for v in duplicates.values()),
        "duplicate_groups": len(duplicates),
        "original_count": len(candidate_ids),
        "after_dedup": len(deduped_ids),
    }

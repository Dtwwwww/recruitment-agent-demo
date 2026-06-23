"""Agent 3: SABC 评级 Agent — 专注评级的独立 Agent（用于重评级和校准）"""
from app.agents.base import BaseAgent


class RatingAgent(BaseAgent[dict]):
    """
    SABC 评级 Agent — 在已有匹配数据的基础上做独立评级。
    可用于：
    1. 初次评级（配合 resume_matcher 的结果做交叉验证）
    2. 批量横向对比时的重新校准
    3. HR 人工纠正后的再评级
    """

    @property
    def system_prompt(self) -> str:
        return """你是一位资深的招聘评级专家，专门负责对候选人进行 SABC 等级评定。

## 评级背景
SABC 评级系统是招聘决策的核心量化工具：
- **S级**: 卓越，综合评分≥85分，推荐率前5%
- **A级**: 优秀，综合评分70-84分，推荐率前25%
- **B级**: 合格，综合评分55-69分，推荐率前60%
- **C级**: 不推荐，综合评分<55分

## 你的职责
1. 根据匹配数据进行独立评级
2. 验证匹配得分和评级之间的一致性
3. 在横向对比时，对候选人进行排名校准

## 输出格式
{
  "rating": "A",
  "confidence": 0.85,
  "calibration_notes": "与匹配得分一致，评级合理",
  "rank_position": 3,
  "recommendation": "建议安排第二轮技术面试"
}

## 关键约束
- 如果匹配得分与评级矛盾（如评分85+但评级不是S），必须纠正
- confidence 表示你对此次评级的信心（0-1）
- 如果进行横向对比，给出 rank_position
"""

    def build_user_prompt(
        self,
        match_data: str,
        peers_data: str = "",
    ) -> str:
        if peers_data:
            return f"""请根据以下匹配数据进行评级验证和横向对比：

## 当前候选人匹配数据
{match_data}

## 同批其他候选人对比数据（用于排名校准）
{peers_data}

请输出评级分析和排名。"""
        else:
            return f"""请验证以下匹配数据的评级一致性：

{match_data}

请输出评级分析。"""

"""AI 浏览器核心 — 同步版本（Python 3.8 Windows 兼容）"""
from __future__ import annotations
import base64
import json
import logging
import re
from typing import Optional
from openai import OpenAI
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AIBrowser:
    """用千问 VL 视觉模型替代 CSS 选择器（同步版本）"""

    def __init__(self, model: str | None = None):
        self.client = OpenAI(
            api_key=settings.dashscope_api_key,
            base_url=settings.dashscope_base_url,
        )
        self.model = model or getattr(settings, "qwen_vl_model", "qwen-vl-max")
        self.text_model = getattr(settings, "dashscope_model", "qwen-plus")  # 文本模型，非VL

    def _screenshot_b64(self, page, full_page: bool = True) -> str:
        img_bytes = page.screenshot(full_page=full_page, type="png")
        return base64.b64encode(img_bytes).decode()

    def _ask(self, page, prompt: str, full_page: bool = True) -> str:
        img_b64 = self._screenshot_b64(page, full_page)
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_b64}"}},
                        {"type": "text", "text": prompt},
                    ],
                }],
                temperature=0.1,
                max_tokens=4096,
            )
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"千问 VL 调用失败: {e}")
            raise

    def _ask_json(self, page, prompt: str, full_page: bool = True) -> dict:
        full_prompt = f"{prompt}\n\n请只返回纯 JSON，不要包含 markdown 代码块标记。"
        text = self._ask(page, full_prompt, full_page)
        text = text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                return json.loads(match.group())
            logger.warning(f"千问 VL 返回非 JSON: {text[:200]}")
            return {}

    def check(self, page, question: str) -> str:
        return self._ask(page, question, full_page=False).strip()

    def check_json(self, page, question: str) -> dict:
        return self._ask_json(page, question, full_page=False)

    def parse_dom_text(self, text: str, schema_desc: str) -> dict:
        """用 AI 文本模型解析 DOM 文本为结构化 JSON。

        关键区别：这是纯文本→JSON，不经过截图/OCR，零编造风险。
        AI 只能操作实际提取的 DOM 文本内容。
        """
        # 按场景适配字符限制：详情页可更长，列表页仍需截断
        is_list = "candidates" in schema_desc.lower() or "列表" in schema_desc
        max_len = 15000 if is_list else 30000
        text_snippet = text if len(text) <= max_len else text[:max_len] + f"\n...[截断，共{len(text)}字符]"
        prompt = f"""请解析以下网页文本内容，提取结构化数据。

=== 网页文本（从 DOM innerText 提取，内容100%真实） ===
{text_snippet}
=== 文本结束 ===

{ schema_desc }

关键规则：
1. 严格使用上述文本中出现的原文，一个字都不要改
2. 如果某个字段在上述文本中找不到，返回 "" 或 null
3. 禁止根据常识、上下文或在别处见过的信息来补全
4. 姓名必须是文本中明确标注的人名，不能推测
5. 数字保持原样，不计算不转换
6. 技能/标签只列出文本中明确出现的

请只返回纯 JSON，不要包含 markdown 代码块标记。"""
        try:
            resp = self.client.chat.completions.create(
                model=self.text_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.05,  # 极低温度，减少随机性
                max_tokens=4096,
            )
            result_text = resp.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"文本模型调用失败: {e}，回退到 VL 模型")
            # 回退：用 VL 模型处理（不带图片的纯文本也能处理）
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.05,
                max_tokens=4096,
            )
            result_text = resp.choices[0].message.content or ""

        # 解析 JSON
        result_text = result_text.strip()
        result_text = re.sub(r"^```(?:json)?\s*", "", result_text)
        result_text = re.sub(r"\s*```$", "", result_text)
        try:
            return json.loads(result_text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", result_text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            logger.warning(f"文本解析返回非 JSON: {result_text[:200]}")
            return {}

    def extract_data(self, page, schema_desc: str, full_page: bool = True) -> dict:
        """【仅用于视觉任务】截图 → VL 模型 → JSON。

        对于 DOM 文本提取，请优先使用 parse_dom_text()。"""
        prompt = f"""请仔细查看这个网页截图，逐字逐行提取其中清晰可见的数据。

要求提取的内容：{schema_desc}

关键规则（违反将导致数据被丢弃）：
1. 只提取截图中清晰可见的文字，每个字符都必须能在截图中找到对应位置
2. 如果截图模糊、文字被遮挡、或无法辨认，该字段返回空字符串 "" 或 null
3. 绝对禁止编造、猜测、推理、或根据常识补全任何信息
4. 姓名必须是截图中明确标注的，不要从上下文推断
5. 数字（如工作年限）必须与截图中的数字严格一致，不要四舍五入
6. 技能/标签列表只包含截图中明确列出的，不要添加"常见"技能

请只返回纯 JSON，不要包含 markdown 代码块标记。"""
        return self._ask_json(page, prompt, full_page)

    def find_coords(self, page, element_desc: str) -> Optional[dict]:
        """⚠️ 仅用于非关键场景（如翻页按钮、滚动提示）。
        不要用于候选人详情页导航 — VL模型坐标可能落在导航栏等错误位置。
        对关键导航请使用 DOM 元素级操作（element.querySelector + element.click）。"""
        prompt = f"""在这个网页截图中找到"{element_desc}"。
返回该元素中心点的像素坐标：{{"x": 数字, "y": 数字, "found": true}}
如果找不到：{{"found": false}}"""
        result = self._ask_json(page, prompt, full_page=False)
        if result.get("found"):
            return {"x": result["x"], "y": result["y"]}
        return None

    def click(self, page, element_desc: str) -> bool:
        coords = self.find_coords(page, element_desc)
        if coords:
            try:
                page.mouse.click(coords["x"], coords["y"])
                logger.info(f"AI 点击: {element_desc} @ ({coords['x']}, {coords['y']})")
                return True
            except Exception as e:
                logger.error(f"点击失败: {e}")
        return False

    def scroll_down(self, page, pixels: int = 600):
        page.evaluate(f"window.scrollBy(0, {pixels})")

    def scroll_to_bottom(self, page):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

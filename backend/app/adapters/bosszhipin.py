"""AI 版 BOSS 直聘适配器 — 同步版本"""
from __future__ import annotations
import json
import logging
import random
import time
from pathlib import Path
from typing import Iterator, Optional
from urllib.parse import urlencode

from app.adapters.base import BaseAdapter, CandidateRecord
from app.adapters.ai_browser import AIBrowser
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

class BosszhipinAdapter(BaseAdapter):
    platform = "bosszhipin"
    base_url = "https://www.zhipin.com"

    def __init__(self):
        self._cookie_file = Path(settings.bosszhipin_cookie_file)
        self.ai = AIBrowser()

    def _inject_stealth(self, page):
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => false});
            window.chrome = {runtime: {}};
            Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
        """)

    def _human_delay(self, lo=600, hi=2500):
        time.sleep(random.uniform(lo / 1000, hi / 1000))

    def _load_cookies(self, ctx) -> bool:
        if self._cookie_file.exists():
            try:
                ctx.add_cookies(json.loads(self._cookie_file.read_text(encoding="utf-8")))
                return True
            except Exception as e:
                logger.warning(f"Cookie 加载失败: {e}")
        return False

    def _save_cookies(self, ctx):
        try:
            self._cookie_file.parent.mkdir(parents=True, exist_ok=True)
            self._cookie_file.write_text(json.dumps(ctx.cookies(), ensure_ascii=False))
        except Exception as e:
            logger.warning(f"Cookie 保存失败: {e}")

    def check_login(self, page) -> dict:
        return self.ai.check_json(page, """
判断当前BOSS直聘页面是否已登录。
返回: {"is_logged_in": true/false, "user_name": "用户名"}
""")

    def ensure_login(self, page, context) -> bool:
        for i in range(30):
            if self.check_login(page).get("is_logged_in"):
                self._save_cookies(context)
                return True
            if i == 0:
                logger.warning("BOSS未登录，请在弹出的浏览器中扫码登录（最多等90秒）...")
            time.sleep(3)
        return False

    BOSS_CITY = {
        "北京": "101010100", "上海": "101020100", "广州": "101280100", "深圳": "101280600",
    }

    def _build_url(self, keyword: str, location: str = "", page: int = 1) -> str:
        params = {"query": keyword, "page": page}
        if location in self.BOSS_CITY:
            params["city"] = self.BOSS_CITY[location]
        return f"{self.base_url}/web/geek/job?{urlencode(params)}"

    def search(self, context, keywords: list[str], location: str = "",
               industry=None, experience_years=None, education=None,
               max_pages: int = 3, progress_cb=None) -> Iterator[list[CandidateRecord]]:
        page = context.new_page()
        self._inject_stealth(page)
        self._load_cookies(context)

        for keyword in keywords:
            for pg in range(1, max_pages + 1):
                page.goto(self._build_url(keyword, location, pg), wait_until="domcontentloaded", timeout=20000)
                self._human_delay(2000, 3500)
                if pg == 1 and not self.ensure_login(page, context):
                    break
                for _ in range(3):
                    self.ai.scroll_down(page, 600)
                    self._human_delay(600, 1200)
                candidates = self._extract_list(page)
                if candidates:
                    yield candidates
                else:
                    break
                if not self.ai.click(page, "下一页按钮"):
                    break
                self._human_delay(2000, 4000)

        self._save_cookies(context)
        page.close()

    def _extract_list(self, page) -> list[CandidateRecord]:
        data = self.ai.extract_data(page, """
提取当前页面所有候选人卡片：name, current_title, current_company,
experience_years(纯数字), education, school, source_url
返回 {"candidates": [...]}
""", full_page=True)
        items = data.get("candidates", []) if isinstance(data, dict) else []
        records = []
        for item in items:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            url = item.get("source_url", "")
            if url and url.startswith("/"):
                url = f"{self.base_url}{url}"
            records.append(CandidateRecord(
                name=item.get("name"), current_title=item.get("current_title"),
                current_company=item.get("current_company"),
                experience_years=self._safe_int(item.get("experience_years")),
                education=item.get("education"), school=item.get("school"),
                source_platform=self.platform, source_url=url or None, raw_data=item,
            ))
        return records

    def parse_detail(self, context, candidate_url: str) -> CandidateRecord:
        page = context.new_page()
        self._inject_stealth(page)
        try:
            page.goto(candidate_url, wait_until="domcontentloaded", timeout=20000)
            self._human_delay(1500, 3000)
            for _ in range(3):
                self.ai.scroll_down(page, 500)
                self._human_delay(500, 1000)
            data = self.ai.extract_data(page, """
提取完整简历：name, current_title, current_company, experience_years,
education, school, age, gender, expected_salary, job_status, skills, industry_tags
""", full_page=True)
            data["source_platform"] = self.platform
            data["source_url"] = candidate_url
            return self.normalize(data)
        finally:
            page.close()

    def normalize(self, raw: dict) -> CandidateRecord:
        skills = raw.get("skills", [])
        if isinstance(skills, str): skills = [s.strip() for s in skills.split(",")]
        industry = raw.get("industry_tags", [])
        if isinstance(industry, str): industry = [s.strip() for s in industry.split(",")]
        return CandidateRecord(
            name=raw.get("name"), current_title=raw.get("current_title") or raw.get("currentTitle"),
            current_company=raw.get("current_company") or raw.get("currentCompany"),
            experience_years=self._safe_int(raw.get("experience_years") or raw.get("experienceYears")),
            education=raw.get("education"), school=raw.get("school"),
            skills=skills, industry_tags=industry,
            source_platform=self.platform, source_url=raw.get("source_url") or raw.get("sourceUrl"),
            expected_salary=raw.get("expected_salary"), job_status=raw.get("job_status"),
            gender=raw.get("gender"), age=self._safe_int(raw.get("age")), raw_data=raw,
        )

    @staticmethod
    def _safe_int(val) -> Optional[int]:
        if val is None: return None
        try: return int(val)
        except (ValueError, TypeError): return None


try:
    from app.adapters.registry import AdapterRegistry
    AdapterRegistry.register(BosszhipinAdapter())
    logger.info("AI BOSS适配器已注册(sync)")
except ImportError: pass

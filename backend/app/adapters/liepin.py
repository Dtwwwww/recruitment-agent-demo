"""猎聘招聘官适配器 — Playwright原生操作 + AI内容提取"""
from __future__ import annotations
import json, logging, random, time
from pathlib import Path
from typing import Iterator, Optional

from app.adapters.base import BaseAdapter, CandidateRecord
from app.adapters.ai_browser import AIBrowser
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LiepinAdapter(BaseAdapter):
    platform = "liepin"
    base_url = "https://lpt.liepin.com"

    def __init__(self):
        self._cookie_file = Path(settings.liepin_cookie_file)
        self.ai = AIBrowser()

    def _stealth(self, page):
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => false});
            window.chrome = {runtime: {}};
            Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
        """)

    def _delay(self, lo=500, hi=2000):
        time.sleep(random.uniform(lo / 1000, hi / 1000))

    def _load_cookies(self, ctx) -> bool:
        if self._cookie_file.exists():
            try:
                ctx.add_cookies(json.loads(self._cookie_file.read_text(encoding="utf-8")))
                return True
            except Exception as e:
                logger.warning(f"Cookie load: {e}")
        return False

    def _save_cookies(self, ctx):
        try:
            self._cookie_file.parent.mkdir(parents=True, exist_ok=True)
            self._cookie_file.write_text(json.dumps(ctx.cookies(), ensure_ascii=False))
        except: pass

    def check_login(self, page) -> dict:
        return self.ai.check_json(page, '{"is_logged_in":bool,"user_name":"str"}')

    def ensure_login(self, page, context) -> bool:
        for i in range(30):
            if self.check_login(page).get("is_logged_in"):
                self._save_cookies(context)
                return True
            if i == 0:
                logger.warning("Not logged in, waiting for QR code scan...")
            time.sleep(3)
        return False

    # ═══════════════════════════════════════════════
    #  核心搜索 — Playwright原生操作 + AI提取
    # ═══════════════════════════════════════════════

    def search(self, context, keywords: list[str], location: str = "",
               industry=None, experience_years=None, education=None,
               max_pages: int = 5, progress_cb=None) -> Iterator[list[CandidateRecord]]:
        page = context.new_page()
        self._stealth(page)
        self._load_cookies(context)

        # 1. 打开搜索页
        page.goto(f"{self.base_url}/search", wait_until="networkidle", timeout=30000)
        self._delay(2000, 4000)

        # 2. 登录检测
        if not self.ensure_login(page, context):
            page.close()
            return

        # 3. 等用户在浏览器中手动搜索（输入关键词+设置筛选+点搜索）
        logger.info("Waiting 25s for user to manually search in browser...")
        time.sleep(25)

        # 4. 抓取当前列表页 — 全页DOM文本提取（不依赖特定链接选择器）
        self.ai.scroll_to_bottom(page)
        self._delay(500, 1000)

        # 提取候选人列表（纯DOM文本 + AI解析）+ 同时提取详情页链接供后续使用
        candidates, detail_links = self._extract_list(page)
        if not candidates:
            logger.info("当前列表页无候选人，停止")
            page.close()
            return

        # 单次最多12条
        candidates = candidates[:12]
        detail_links = detail_links[:12]
        logger.info(f"列表页发现 {len(candidates)} 位候选人, {len(detail_links)} 个详情链接")
        if progress_cb:
            progress_cb(1, len(candidates), f"发现{len(candidates)}人, 开始提取详细信息...")

        # 逐个打开候选人详情页 — 纯 new_page + goto，绝不触碰列表页
        enriched = []
        for i, c in enumerate(candidates):
            detail_page = None
            detail_url = None
            try:
                if progress_cb:
                    progress_cb(1, len(candidates),
                                f"正在提取第{i+1}/{len(candidates)}位候选人的详细简历...")

                # 只通过 detail_links 打开详情页，绝不 JS 点击列表页
                if detail_links and i < len(detail_links):
                    try:
                        detail_url = detail_links[i]
                        detail_page = context.new_page()
                        self._stealth(detail_page)
                        detail_page.bring_to_front()
                        detail_page.goto(detail_url, wait_until="networkidle", timeout=20000)
                    except Exception:
                        if detail_page:
                            try: detail_page.close()
                            except: pass
                        detail_page = None
                        detail_url = None

                if not detail_page:
                    enriched.append(c)
                    continue

                self._delay(1000, 2000)

                # —— DOM文本提取详情 ——
                try:
                    dom_text = detail_page.evaluate("() => document.body ? document.body.innerText : ''")
                except Exception:
                    dom_text = ""

                if dom_text and len(dom_text) > 100:
                    detail = self.ai.parse_dom_text(dom_text, """
Extract full resume:
- basic: name, gender, age(number), city
- job_pref: desired_title, desired_industry(array), expected_salary, job_status
- education: education, school, major, graduation_year
- work_experience(array): company, title, start_date, end_date, duration, responsibilities(array), achievements(array)
- skills: skills(array), certifications(array), languages(array)
- projects(array): name, role, tech_stack(array), highlights(array), duration
""")
                else:
                    detail = self.ai.extract_data(detail_page, """
Extract full resume: name, current_title, current_company,
work_experience(array), skills(array), education, school
""", full_page=True)

                if detail:
                    def _safe_str(v, max_len=200):
                        if v is None: return None
                        if isinstance(v, str): return v[:max_len]
                        if isinstance(v, dict):
                            for k in ("education", "degree", "school", "name", "value", "title"):
                                sv = v.get(k)
                                if isinstance(sv, str) and sv.strip(): return sv.strip()[:max_len]
                            for sv in v.values():
                                if isinstance(sv, str) and sv.strip(): return sv.strip()[:max_len]
                            return str(v)[:max_len]
                        return str(v)[:max_len]
                    def _safe_list(v):
                        if v is None: return []
                        if isinstance(v, list): return v
                        if isinstance(v, dict):
                            for k in ("skills", "expert", "proficient", "list", "items"):
                                lv = v.get(k)
                                if isinstance(lv, list): return lv
                            for lv in v.values():
                                if isinstance(lv, list): return lv
                            return list(v.values())
                        if isinstance(v, str): return [s.strip() for s in v.split(",") if s.strip()]
                        return []
                    c = CandidateRecord(
                        name=detail.get("name") or c.name,
                        current_title=detail.get("desired_title") or detail.get("current_title") or c.current_title,
                        current_company=detail.get("current_company") or c.current_company,
                        experience_years=self._safe_int(detail.get("experience_years")) or c.experience_years,
                        education=_safe_str(detail.get("education")) or c.education,
                        school=_safe_str(detail.get("school")) or c.school,
                        skills=_safe_list(detail.get("skills")) or c.skills,
                        industry_tags=_safe_list(detail.get("desired_industry")) or detail.get("industry_tags") or c.industry_tags,
                        source_platform=self.platform, source_url=detail_url or c.source_url,
                        expected_salary=_safe_str(detail.get("expected_salary")) or c.expected_salary,
                        job_status=_safe_str(detail.get("job_status")),
                        age=self._safe_int(detail.get("age")) or c.age,
                        gender=_safe_str(detail.get("gender")),
                        raw_data={
                            **c.raw_data, "detail": detail,
                            "work_experience": detail.get("work_experience", []),
                            "projects": detail.get("projects", []),
                            "certifications": detail.get("certifications", []),
                            "languages": detail.get("languages", []),
                        },
                    )
                    logger.info(f"Detail OK: {c.name} | {c.current_company} | "
                                f"URL: {(detail_url or '')[:80]}")
            except Exception as e:
                logger.warning(f"详情提取失败 第{i+1}人: {e}")
            finally:
                if detail_url:
                    c.source_url = detail_url
                if detail_page:
                    try: detail_page.close()
                    except: pass
            enriched.append(c)

        page.bring_to_front()
        yield enriched

        self._save_cookies(context)
        page.close()

    def _extract_list(self, page) -> tuple[list[CandidateRecord], list[str]]:
        """截图VL → 视觉提取候选人 + DOM链接提取。最可靠方案。"""
        # 1. 并行提取页面文本（用于回退）+ 详情链接
        try:
            dom_text = page.evaluate("() => document.body ? document.body.innerText : ''")
        except Exception:
            dom_text = ""
        logger.info(f"DOM text: {len(dom_text)} chars")

        # 直接从 data-resumeurl 属性提取详情URL（猎聘专用属性）
        try:
            detail_urls = page.evaluate("""() => {
                const els = document.querySelectorAll('[data-resumeurl]');
                const result = [];
                for (const el of els) {
                    const url = el.getAttribute('data-resumeurl');
                    if (url) result.push(url);
                }
                return result;
            }""")
            detail_links = list(detail_urls) if detail_urls else []
        except Exception:
            detail_links = []

        logger.info(f"Detail links from data-resumeurl: {len(detail_links)}")
        for dl in detail_links[:3]:
            logger.info(f"  {dl[:200]}")

        # 2. 截图 + VL 视觉提取候选人（不依赖DOM结构）
        data = self.ai.extract_data(page, """
从截图中逐个提取所有候选人卡片。每人提取：
name, current_title, current_company, experience_years(number), education, school

规则：
1. 只提取截图中清晰可见的文字
2. name 按页面实际显示的文字提取（可能是脱敏的单字姓，如实保存即可）
4. 找不到的字段留空 ""
5. 返回 {"candidates": [{"card_index": 0, "name": "完整姓名", ...}]}
""", full_page=True)
        items = data.get("candidates", []) if isinstance(data, dict) else []
        logger.info(f"VL extracted {len(items)} candidate items")

        # 3. VL失败 → 回退到DOM文本解析
        if not items:
            logger.info("VL返回空，回退DOM文本解析")
            if dom_text and len(dom_text) > 100:
                data = self.ai.parse_dom_text(dom_text, """
从招聘搜索页文本中找出每个候选人：
name, current_title, current_company, experience_years(number), education, school
返回 {"candidates":[{"card_index":0,"name":"...","current_title":"...","current_company":"...","experience_years":5,"education":"本科","school":"..."}]}
找不到返回 {"candidates":[]}
""")
                items = data.get("candidates", []) if isinstance(data, dict) else []

        # 4. 构建 CandidateRecord（清洗嵌套dict防止DB写入失败）
        def _s(v, max_len=200):
            if v is None: return None
            if isinstance(v, str): return v[:max_len]
            if isinstance(v, dict):
                for k in ("education", "degree", "school", "name"):
                    sv = v.get(k)
                    if isinstance(sv, str) and sv.strip(): return sv.strip()[:max_len]
                for sv in v.values():
                    if isinstance(sv, str) and sv.strip(): return sv.strip()[:max_len]
                return str(v)[:max_len]
            return str(v)[:max_len]
        records = []
        for idx, item in enumerate(items):
            if not isinstance(item, dict) or not item.get("name"):
                continue
            name = (item.get("name") or "").strip()
            if not any('一' <= ch <= '鿿' for ch in name):
                continue
            if len(name) > 10:
                continue
            # 按位置匹配URL
            url = detail_links[idx] if idx < len(detail_links) else None
            records.append(CandidateRecord(
                name=name, current_title=item.get("current_title"),
                current_company=item.get("current_company"),
                experience_years=self._safe_int(item.get("experience_years")),
                education=_s(item.get("education")), school=_s(item.get("school")),
                source_platform=self.platform, source_url=url,
                raw_data=item,
            ))

        logger.info(f"_extract_list: {len(items)} AI → {len(records)} valid (URLs:{len(detail_links)})")
        return records, detail_links

    def parse_detail(self, context, candidate_url: str) -> CandidateRecord:
        page = context.new_page()
        self._stealth(page)
        try:
            page.goto(candidate_url, wait_until="networkidle", timeout=30000)
            self._delay(1500, 3000)
            for _ in range(4):
                self.ai.scroll_down(page, 500)
                self._delay(400, 800)
            data = self.ai.extract_data(page, "extract full resume", full_page=True)
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
    AdapterRegistry.register(LiepinAdapter())
    logger.info("Liepin recruiter adapter registered")
except ImportError: pass

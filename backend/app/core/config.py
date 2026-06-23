"""应用配置管理 — 基于 Pydantic Settings"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── 千问 LLM ──
    dashscope_api_key: str = "sk-xxx"
    dashscope_model: str = "qwen-plus"
    dashscope_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    # ── 数据库 ──
    database_url: str = "postgresql+asyncpg://recruit:recruit123@localhost:5432/recruitment"
    database_url_sync: str = "postgresql://recruit:recruit123@localhost:5432/recruitment"
    redis_url: str = "redis://localhost:6379/0"

    # ── 平台凭证路径 ──
    liepin_cookie_file: str = "/data/cookies/liepin.json"
    liepin_enterprise_cookie_file: str = "/data/cookies/liepin_enterprise.json"

    # ── 浏览器 ──
    browser_channel: str = "msedge"  # 使用本机 Microsoft Edge
    browser_user_data_dir: str = "data/browser_profiles"

    # ── 应用 ──
    app_env: str = "development"
    debug: bool = True
    secret_key: str = "dev-secret-change-in-production"
    api_v1_prefix: str = "/api/v1"

    # ── Celery ──
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    model_config = {
        "env_file": [".env", "../.env"],  # backend/.env优先, 根.env兜底(API Key等)
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()

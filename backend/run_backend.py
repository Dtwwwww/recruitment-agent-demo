"""启动脚本 — Windows 兼容"""
import sys, asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
import uvicorn
uvicorn.run("app.main:app", host="0.0.0.0", port=8002)

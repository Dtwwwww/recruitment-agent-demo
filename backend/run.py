"""Windows 兼容启动入口：在导入任何模块前设置事件循环策略"""
import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import uvicorn
uvicorn.run("app.main:app", host="0.0.0.0", port=8001)

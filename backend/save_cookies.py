"""
Cookie 获取脚本 — 首次使用前运行一次
打开浏览器 → 你手动登录 → 自动保存 Cookie
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

# 保存目录
DATA_DIR = Path(__file__).parent.parent / "data" / "cookies"
DATA_DIR.mkdir(parents=True, exist_ok=True)

PLATFORMS = {
    "liepin": {
        "name": "猎聘",
        "url": "https://www.liepin.com/",
        "cookie_file": DATA_DIR / "liepin.json",
    },
    "bosszhipin": {
        "name": "BOSS直聘",
        "url": "https://www.zhipin.com/web/user/?ka=header-login",
        "cookie_file": DATA_DIR / "bosszhipin.json",
    },
}


async def save_cookies(platform_key: str):
    cfg = PLATFORMS[platform_key]
    print(f"\n{'='*50}")
    print(f"  打开 {cfg['name']} 登录页面")
    print(f"{'='*50}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # 有头模式，你能看到浏览器
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="zh-CN",
        )
        page = await context.new_page()
        await page.goto(cfg["url"], wait_until="domcontentloaded")
        print(f"\n  请在浏览器中手动登录 {cfg['name']}")
        print(f"  登录成功后，回到这个终端按 Enter...")
        input()

        # 保存 Cookie
        cookies = await context.cookies()
        cfg["cookie_file"].write_text(json.dumps(cookies, ensure_ascii=False, indent=2))
        print(f"  ✅ 已保存 {len(cookies)} 条 Cookie → {cfg['cookie_file']}")

        await browser.close()


async def main():
    print("=" * 50)
    print("  招聘平台 Cookie 获取工具")
    print("=" * 50)
    print()
    print("  这个脚本只需要运行一次。")
    print("  它会打开浏览器，你手动登录后，自动保存 Cookie。")
    print("  之后搜索功能就能正常使用了。")
    print()

    for key, cfg in PLATFORMS.items():
        print(f"  [{key}] {cfg['name']}")
    print("  [all] 两个都登录")
    print()

    choice = input("  选哪个？(liepin/bosszhipin/all，默认 all): ").strip() or "all"

    if choice == "all":
        for key in PLATFORMS:
            try:
                await save_cookies(key)
            except Exception as e:
                print(f"  ❌ {key} 失败: {e}")
    elif choice in PLATFORMS:
        await save_cookies(choice)
    else:
        print("  无效选择")

    print("\n  全部完成！现在可以正常使用搜索功能了。")


if __name__ == "__main__":
    asyncio.run(main())

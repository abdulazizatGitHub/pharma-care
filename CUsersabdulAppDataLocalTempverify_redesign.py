import asyncio, os, sys
from playwright.async_api import async_playwright

SHOTS = r"C:\Users\abdul\AppData\Local\Temp\pharmacare_screenshots"
os.makedirs(SHOTS, exist_ok=True)

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # 1. Login page
        await page.goto("http://localhost:3000/login", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SHOTS, "1_login.png"))
        print("login page done")

        # 2. Sign in as superuser
        await page.fill('input[name="email"]', 'superuser@pharmacare.dev')
        await page.fill('input[name="password"]', 'SuperAdmin@123')
        await page.click('button[type="submit"]')
        try:
            await page.wait_for_url("**/dashboard/**", timeout=10000)
        except Exception:
            pass
        await page.wait_for_load_state("networkidle")
        await page.screenshot(path=os.path.join(SHOTS, "2_owner_dashboard.png"))
        print("owner dashboard done")

        # 3. Hover sidebar
        sidebar = page.locator("aside").first
        await sidebar.hover()
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(SHOTS, "3_sidebar_expanded.png"))
        print("sidebar expanded done")

        # 4. Collapse sidebar
        await page.mouse.move(800, 400)
        await page.wait_for_timeout(400)

        # 5. User management
        await page.goto("http://localhost:3000/users", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SHOTS, "4_users.png"))
        print("user management done")

        # 6. Unauthorized
        await page.goto("http://localhost:3000/unauthorized", wait_until="networkidle")
        await page.screenshot(path=os.path.join(SHOTS, "5_unauthorized.png"))
        print("unauthorized done")

        await browser.close()
    print("all done:" + SHOTS)

asyncio.run(run())

"""OG 썸네일(assets/og.png, 1200x630)을 assets/og.html로부터 다시 렌더한다.

사용법: python3 tools/render_og.py   (repo 루트 기준 경로 자동 해석)
필요: playwright + chromium (headless shell)
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "og.html"
OUT = ROOT / "assets" / "og.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
    page.goto(SRC.as_uri())
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
    browser.close()

print("saved", OUT)

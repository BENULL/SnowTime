import os
import sys

# 使用 Playwright 截图
try:
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1200, "height": 900})
        page.goto("http://localhost:3333/preview.html", wait_until="networkidle")
        page.screenshot(path="preview.png", full_page=True)
        browser.close()
        print("Screenshot saved to preview.png")
except ImportError:
    print("Playwright not installed. Trying alternative...")
    
# 尝试使用 requests + html2image
try:
    import requests
    from html2image import Html2Image
    
    # 读取 HTML 文件
    with open("public/preview.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    
    hti = Html2Image(output_path=".")
    hti.screenshot(html_str=html_content, save_as="preview.png", size=(1200, 900))
    print("Screenshot saved to preview.png")
except ImportError:
    print("html2image not installed either.")
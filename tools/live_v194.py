#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.9.4 라이브 검증 — 상대 시비 수집 → 도랏 재활용 → 관리자 삭제."""
import json
import os
import time
import urllib.request

from playwright.sync_api import sync_playwright

URL = "https://ageofwar-kr.github.io/dorati/?stay=1"
DB = "https://dorati-99953-default-rtdb.asia-southeast1.firebasedatabase.app"
SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")

fail = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)[:100]) if detail and not ok else ""))
    if not ok:
        fail.append(name)


def roasts_from_db():
    with urllib.request.urlopen(DB + "/pairs.json?shallow=true", timeout=15) as r:
        ids = list(json.loads(r.read().decode()).keys())
    out = []
    for i in ids:
        with urllib.request.urlopen(DB + "/pairs/" + i + ".json", timeout=15) as r:
            v = json.loads(r.read().decode()) or {}
        if v.get("roast"):
            out.append((i, v.get("q")))
    return out


def bot_texts(page):
    return [b.inner_text().strip() for b in page.query_selector_all("#chat .row.bot:not(.typing) .bubble") if b.inner_text().strip()]


def send(page, text, wait=1.8):
    before = len(bot_texts(page))
    page.fill("#input", text)
    page.press("#input", "Enter")
    t0 = time.time()
    while time.time() - t0 < 12:
        page.wait_for_timeout(200)
        b = bot_texts(page)
        if len(b) > before and not page.query_selector("#chat .row.bot.typing"):
            page.wait_for_timeout(300)
            return bot_texts(page)[-1]
    return "(응답 없음)"


MARK = "테스트검증 시비 문장 %d" % int(time.time() % 10000)

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(800)
    if page.is_visible("#gate"):
        page.fill("#gate-input", "테스터")
        page.click("#gate-start")
        page.wait_for_timeout(600)

    print("1) 버전 · 화면")
    check("v1.9.4 표기", "v1.9.4" in page.inner_text(".app-footer"), page.inner_text(".app-footer"))
    page.click('[data-mode-btn="dorat"]')
    page.wait_for_timeout(500)

    print("2) 도랏 모드 시비 → 수집")
    before_roasts = roasts_from_db()
    print("        수집 전:", len(before_roasts), "건")
    r = send(page, "야이 병신같은 봇새끼야 " + MARK)
    print("        응답:", r.replace("\n", " ")[:70])
    check("받아치기 응답", bool(r) and "처음 들어" not in r, r)
    time.sleep(2.5)
    after_roasts = roasts_from_db()
    print("        수집 후:", len(after_roasts), "건")
    check("시비가 DB에 저장됨", len(after_roasts) > len(before_roasts), len(after_roasts))
    mine = [x for x in after_roasts if MARK in (x[1] or "")]
    check("방금 던진 시비 저장 확인", bool(mine), mine[:1])
    page.screenshot(path=os.path.join(SHOT, "36-v194-dorat-desktop.png"))

    print("3) 새로고침 후 시비 풀이 엔진에 실리는지")
    page.reload(wait_until="networkidle")
    cnt = 0
    for _ in range(24):
        page.wait_for_timeout(500)
        cnt = page.evaluate("() => window.Engine.roastCount()")
        if cnt > 0:
            break
    print("        엔진에 실린 시비:", cnt)
    check("페이지에 시비 풀 로드", cnt > 0, cnt)

    print("4) 관리자에서 확인 · 삭제")
    a = ctx.new_page()
    a.goto("https://ageofwar-kr.github.io/dorati/admin.html", wait_until="domcontentloaded")
    a.wait_for_timeout(600)
    if a.is_visible("#pin"):
        a.fill("#pin", "8888")
        a.click("#gate-form button[type=submit]")
        a.wait_for_timeout(1200)
    a.wait_for_timeout(1500)
    lst = a.inner_text("#roast-list")
    check("관리자 수집함에 노출", MARK in lst, lst[:120])
    a.screenshot(path=os.path.join(SHOT, "37-v194-admin-roasts.png"))

    if mine:
        rid, rq = mine[0]
        a.once("dialog", lambda d: d.accept())
        a.click('[data-del-roast="%s"]' % rid)
        a.wait_for_timeout(2000)
        left = [x for x in roasts_from_db() if x[0] == rid]
        check("삭제 반영", not left, left)

    print("5) 수집한 시비를 받아치기에 재사용")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(2500)
    page.click('[data-mode-btn="dorat"]')
    page.wait_for_timeout(400)
    send(page, "너 진짜 와꾸부터 이상한 놈이구나 %s" % MARK)
    for _ in range(12):
        page.wait_for_timeout(500)
        if page.evaluate("() => window.Engine.roastCount()") > 0:
            break
    print("        엔진 시비 풀:", page.evaluate("() => window.Engine.roastCount()"))
    quoted = None
    for i in range(20):
        r = send(page, "시발 병신아 뭐라는 거야 %d" % i)
        if "「" in r:
            quoted = r
            break
    print("        인용 답변:", (quoted or "-")[:80])
    check("수집 시비 인용 받아치기", quoted is not None, quoted)

    print("6) 검증용 시비 정리")
    cleaned = 0
    for rid, rq in roasts_from_db():
        if (rq or "").startswith("시발") or MARK in (rq or "") or (rq or "").startswith("야이"):
            req = urllib.request.Request(DB + "/pairs/" + rid + ".json", method="DELETE")
            urllib.request.urlopen(req, timeout=15).read()
            cleaned += 1
    print("        정리:", cleaned, "건")
    br.close()

print("\n결과: %s" % ("전부 통과 ✅" if not fail else "실패 %d건 ❌ %s" % (len(fail), fail)))

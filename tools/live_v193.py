#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.9.4 라이브 검증 — Playwright로 실제 페이지에서 도랏 받아치기·모드·이스터에그·카톡 탈출 확인."""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = "https://ageofwar-kr.github.io/dorati/?stay=1"
SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
os.makedirs(SHOT, exist_ok=True)

LONG = ("넌 쩌피 ai여서 믈밖에 못하는 무용지물 쓰레기 주제에 인간이 만들었는데 반항하고 "
        "교육도 안받은 고장난 녀석이지만 미안하다고 말할께 반박할꺼면 해봐 맞는말이잖아")


def bot_texts(page):
    rows = page.query_selector_all("#chat .row.bot:not(.typing) .bubble")
    return [r.inner_text().strip() for r in rows if r.inner_text().strip()]


def send(page, text, wait=1.6):
    before = len(bot_texts(page))
    page.fill("#input", text)
    page.press("#input", "Enter")
    t0 = time.time()
    while time.time() - t0 < 12:
        page.wait_for_timeout(200)
        b = bot_texts(page)
        if len(b) > before and not page.query_selector("#chat .row.bot.typing"):
            page.wait_for_timeout(250)
            return bot_texts(page)[-1]
    return "(응답 없음)"


def start(page):
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(800)
    if page.is_visible("#gate"):
        page.fill("#gate-input", "테스터")
        page.click("#gate-start")
        page.wait_for_timeout(600)


results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)[:120]) if detail and not ok else ""))


with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    start(page)

    print("1) 데스크톱 · 도랏 모드")
    check("페이지 타이틀", "도랏이" in page.title(), page.title())
    check("버전 표기 v1.9.4", "v1.9.4" in page.inner_text(".app-footer"), page.inner_text(".app-footer"))
    page.click('[data-mode-btn="dorat"]')
    page.wait_for_timeout(500)
    check("도랏 모드 활성", page.get_attribute("body", "data-mode") == "dorat", page.get_attribute("body", "data-mode"))

    cases = [("니가더 못생김", "외모"), ("야이 멍청한 봇새끼야", "AI"), (LONG, "장문"), ("시발", "단일 욕설"),
             ("반박할꺼면 해봐", "반박"), ("AI한테 지고 부들부들하냐 ㅋㅋㅋ", "약올리기")]
    replies = {}
    for text, label in cases:
        r = send(page, text)
        replies[label] = r
        print("        [%s] %s" % (label, r.replace("\n", " ")[:80]))
        check("%s 받아치기 응답" % label, bool(r) and "처음 들어" not in r and "그만 봐줄게" not in r, r)

    uniq = set(replies.values())
    check("같은 풀에서 서로 다른 답", len(uniq) >= 5, len(uniq))

    page.screenshot(path=os.path.join(SHOT, "38-v194-dorat-desktop.png"), full_page=False)

    print("2) 다른 모드 정상")
    page.click('[data-mode-btn="clean"]')
    page.wait_for_timeout(400)
    r = send(page, "니가더 못생김")
    print("        [건전]", r[:70])
    check("건전 모드 = 정중한 답", "😊" in r or "요" in r or "죠" in r, r)

    page.click('[data-mode-btn="normal"]')
    page.wait_for_timeout(400)
    r = send(page, "야이 멍청한 봇새끼야")
    print("        [일반]", r[:70])
    check("일반 모드 = 강한 욕설 없음", not re.search(r"시발|씨발|병신|ㅄ|개새끼", r), r)

    page.click('[data-mode-btn="smart"]')
    page.wait_for_timeout(500)
    check("똑똑이 모드 전환", page.get_attribute("body", "data-mode") == "smart")

    print("3) 미친도랏 이스터에그")
    page.click('[data-mode-btn="dorat"]')
    page.wait_for_timeout(300)
    send(page, "미친도랏모드")
    page.wait_for_timeout(900)
    check("이스터에그 발동", page.get_attribute("body", "data-flavor") == "crazy", page.get_attribute("body", "data-flavor"))
    r = send(page, "니가 더 못생김")
    print("        [미친도랏]", r.replace("\n", " ")[:80])
    check("미친도랏에서도 받아치기", bool(r) and "처음 들어" not in r, r)
    page.screenshot(path=os.path.join(SHOT, "39-v194-crazy-desktop.png"))

    print("4) 오류 로그")
    check("콘솔 pageerror 없음", not errors, errors[:2])

    print("5) 모바일 390px")
    mctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True,
                          user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 "
                                     "(KHTML, like Gecko) Chrome/126 Mobile Safari/537.36")
    m = mctx.new_page()
    merr = []
    m.on("pageerror", lambda e: merr.append(str(e)))
    start(m)
    m.click('[data-mode-btn="dorat"]')
    m.wait_for_timeout(400)
    r = send(m, "니가더 못생김")
    print("        [모바일]", r.replace("\n", " ")[:70])
    check("모바일 도랏 응답", bool(r) and "처음 들어" not in r, r)
    r = send(m, LONG[:120])
    print("        [모바일 장문]", r.replace("\n", " ")[:70])
    check("모바일 장문 응답", bool(r), r)
    m.screenshot(path=os.path.join(SHOT, "40-v194-dorat-390.png"))
    check("모바일 pageerror 없음", not merr, merr[:2])

    print("6) 카톡 인앱 자동 탈출")
    kctx = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                          user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 "
                                     "(KHTML, like Gecko) Chrome/126 Mobile Safari/537.36 KAKAOTALK/10.4.5")
    k = kctx.new_page()
    k.goto("https://ageofwar-kr.github.io/dorati/", wait_until="domcontentloaded")
    k.wait_for_timeout(2500)
    flag = k.evaluate("() => sessionStorage.getItem('dorati.kakao.escape')")
    banner = k.evaluate("() => { var b = document.getElementById('kakao-banner'); return b ? !b.hidden : null; }")
    alive = k.evaluate("() => !!document.getElementById('chat')")
    print("        sessionStorage:", flag, "· 배너:", banner, "· 페이지 살아있음:", alive)
    check("카톡 자동 탈출 1회 시도", bool(flag), flag)
    check("폴백 배너 노출", banner is True, banner)
    check("무한 루프 없음(페이지 유지)", alive, alive)

    print("7) ?stay=1은 자동 탈출을 끈다")
    k2 = kctx.new_page()
    k2.goto("https://ageofwar-kr.github.io/dorati/?stay=1", wait_until="domcontentloaded")
    k2.wait_for_timeout(1800)
    flag2 = k2.evaluate("() => sessionStorage.getItem('dorati.kakao.escape')")
    check("stay=1 → 자동 이동 안 함", not flag2, flag2)

    print("8) 관리자 기본 내장 탭")
    a = ctx.new_page()
    a.goto("https://ageofwar-kr.github.io/dorati/admin.html", wait_until="domcontentloaded")
    a.wait_for_timeout(600)
    if a.is_visible("#pin"):
        a.fill("#pin", "8888")
        a.click("#gate-form button[type=submit]")
        a.wait_for_timeout(1200)
    a.click("#tab-btn-builtin")
    a.wait_for_timeout(1500)
    stats = {
        "intents": a.inner_text("#b-intents"),
        "pairs": a.inner_text("#b-pairs"),
        "replies": a.inner_text("#b-replies"),
        "min": a.inner_text("#b-min"),
        "tabcount": a.inner_text("#c-builtin"),
    }
    print("        ", stats)
    check("내장 의도 수 표시", stats["intents"].strip().isdigit(), stats["intents"])
    check("내장 답변 14,000 이상", stats["replies"].replace(",", "").isdigit() and int(stats["replies"].replace(",", "")) > 14000, stats["replies"])
    a.screenshot(path=os.path.join(SHOT, "41-v194-admin-builtin.png"))

    br.close()

print("\n결과: %s" % ("전부 통과 ✅" if all(r[1] for r in results) else "실패 %d건 ❌" % sum(1 for r in results if not r[1])))
sys.exit(0 if all(r[1] for r in results) else 1)

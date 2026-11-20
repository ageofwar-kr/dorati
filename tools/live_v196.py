#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.9.6 라이브 검증 — 도랏·미친도랏은 닉네임에 '님'을 붙이지 않는다.

  · 건전·일반·똑똑이: '자비스님' 유지(배지·대사)
  · 도랏·미친도랏: '자비스야' — 첫인사·배지·대사 어디에도 '자비스님' 0건
  · 390px 모바일 배지 · pageerror 0

로컬 파일로도 돌릴 수 있다: DORATI_URL=file:///.../index.html python3 tools/live_v196.py
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = os.environ.get("DORATI_URL", "https://ageofwar-kr.github.io/dorati/?stay=1")
SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
NICK = os.environ.get("DORATI_NICK", "자비스")

fail = []
errors = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)[:130]) if detail and not ok else ""))
    if not ok:
        fail.append(name)


def bot_texts(page):
    return [b.inner_text().strip() for b in page.query_selector_all("#chat .row.bot:not(.typing) .bubble") if b.inner_text().strip()]


def chat_text(page):
    el = page.query_selector("#chat")
    return el.inner_text() if el else ""


def send(page, text, wait=12):
    before = len(bot_texts(page))
    page.fill("#input", text)
    page.press("#input", "Enter")
    t0 = time.time()
    while time.time() - t0 < wait:
        page.wait_for_timeout(180)
        b = bot_texts(page)
        if len(b) > before and not page.query_selector("#chat .row.bot.typing"):
            page.wait_for_timeout(200)
            return bot_texts(page)[-1]
    return "(응답 없음)"


def set_mode(page, mode):
    page.click('[data-mode-btn="%s"]' % mode)
    page.wait_for_timeout(500)


def badge(page):
    el = page.query_selector("#nick-badge")
    return (el.inner_text().strip() if el else "") or ""


def enter(page):
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    if page.is_visible("#gate"):
        page.fill("#gate-input", NICK)
        page.click("#gate-start")
        page.wait_for_timeout(800)


# 도랏 모드에서 부를 때가 많은(질문이 아닌) 말들 — 개인화 확률 22%를 여러 번 밟는다
PLAIN = ["ㅋㅋㅋ", "안녕", "심심해", "고마워", "잘자", "오늘 힘들었어", "배고파", "ㅇㅇ",
         "좋아", "그래", "졸려", "심심하다", "ㅎㅎ", "잘가", "오케이", "굿"]


with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    enter(page)

    print("1) 버전 · 로딩")
    foot = page.inner_text(".app-footer")
    check("v1.9.6 표기", "v1.9.6" in foot, foot[:60])
    ev = page.evaluate("() => window.Engine.version")
    check("Engine 1.9.6", ev == "1.9.6", ev)
    check("nickCall 노출", page.evaluate("() => typeof window.Engine.nickCall") == "function")
    q = page.evaluate("""() => ['clean','normal','smart','dorat','dorat_pure','dorat_crazy']
        .map(function (m) { return m + '=' + window.Engine.nickCall(%s, m); }).join(' ')"""
        % __import__("json").dumps(NICK))
    print("        " + q)
    for m in ("clean", "normal", "smart"):
        check("%s = %s님" % (m, NICK), page.evaluate("window.Engine.nickCall(%s,'%s')" % (__import__("json").dumps(NICK), m)) == NICK + "님")
    for m in ("dorat", "dorat_pure", "dorat_crazy"):
        got = page.evaluate("window.Engine.nickCall(%s,'%s')" % (__import__("json").dumps(NICK), m))
        check("%s = %s야" % (m, NICK), got == NICK + "야", got)

    print("\n2) 도랏 모드 — 첫인사 · 배지 · 대사")
    set_mode(page, "dorat")
    page.wait_for_timeout(900)
    greet = bot_texts(page)[-1] if bot_texts(page) else ""
    print("        첫인사:", greet[:70])
    check("도랏 첫인사에 '%s야'" % NICK, (NICK + "야") in greet, greet)
    b = badge(page)
    print("        배지:", b)
    check("도랏 배지에 '님' 없음", "님" not in b and NICK + "야" in b, b)
    for t in PLAIN[:10]:
        send(page, t)
    txt = chat_text(page)
    hits = txt.count(NICK + "님")
    print("        대사 %d개 · '%s님' %d건" % (len(bot_texts(page)), NICK, hits))
    check("도랏 대사에 '%s님' 0건" % NICK, hits == 0, [l for l in txt.split("\n") if NICK + "님" in l][:3])
    called = [l for l in txt.split("\n") if NICK + "야" in l]
    print("        이름으로 부른 줄: %d개" % len(called))
    check("도랏은 '%s야'로 부름" % NICK, len(called) >= 1, called[:2])
    page.screenshot(path=os.path.join(SHOT, "42-v196-dorat-nick.png"))

    print("\n3) 미친도랏(이스터에그) — 첫인사 · 대사")
    send(page, "미친도랏모드")
    page.wait_for_timeout(900)
    egg = bot_texts(page)[-1] if bot_texts(page) else ""
    print("        인사:", egg[:70])
    check("미친도랏 인사 '%s님' 없음" % NICK, (NICK + "님") not in egg, egg)
    check("미친도랏 인사에 '%s야'" % NICK, (NICK + "야") in egg, egg)
    b = badge(page)
    check("미친도랏 배지에 '님' 없음", "님" not in b, b)
    for t in PLAIN[10:] + PLAIN[:6]:
        send(page, t)
    txt = chat_text(page)
    check("미친도랏 대사에 '%s님' 0건" % NICK, txt.count(NICK + "님") == 0,
          [l for l in txt.split("\n") if NICK + "님" in l][:3])
    page.screenshot(path=os.path.join(SHOT, "43-v196-crazy-nick.png"))

    print("\n4) 건전 · 일반 — '님' 유지")
    for mode, label in (("clean", "건전"), ("normal", "일반")):
        set_mode(page, mode)
        page.wait_for_timeout(500)
        b = badge(page)
        check("%s 배지 '%s님'" % (label, NICK), NICK + "님" in b, b)
        found = []
        for t in PLAIN:
            r = send(page, t)
            if NICK + "님" in r:
                found.append(r[:60])
                break
        print("        %s '%s님' 대사: %s" % (label, NICK, (found[0] if found else "-")[:60]))
        check("%s 대사에 '%s님' 나옴" % (label, NICK), bool(found))
        check("%s '%s야' 0건" % (label, NICK), not any((NICK + "야") in x for x in bot_texts(page)), None)
    page.screenshot(path=os.path.join(SHOT, "44-v196-clean-nick.png"))

    print("\n5) 똑똑이 — '님' 유지")
    set_mode(page, "smart")
    page.wait_for_timeout(600)
    b = badge(page)
    print("        배지:", b)
    check("똑똑이 배지 '%s님'" % NICK, NICK + "님" in b, b)
    r = send(page, "안녕 인사해줘", wait=25)
    print("        똑똑이 답:", r.replace("\n", " ")[:80])
    check("똑똑이 답에 '%s야' 없음" % NICK, (NICK + "야") not in r, r)
    page.screenshot(path=os.path.join(SHOT, "45-v196-smart-nick.png"))

    print("\n6) 390px 모바일")
    m = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                       user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36")
    mp = m.new_page()
    mp.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
    mp.goto(URL, wait_until="domcontentloaded")
    mp.wait_for_timeout(1200)
    if mp.is_visible("#gate"):
        mp.fill("#gate-input", NICK)
        mp.click("#gate-start")
        mp.wait_for_timeout(700)
    mp.click('[data-mode-btn="dorat"]')
    mp.wait_for_timeout(900)
    mb = badge(mp)
    print("        모바일 배지:", mb)
    check("모바일 도랏 배지에 '님' 없음", "님" not in mb, mb)
    send(mp, "ㅋㅋㅋ")
    send(mp, "심심해")
    check("모바일 도랏 '%s님' 0건" % NICK, chat_text(mp).count(NICK + "님") == 0,
          [l for l in chat_text(mp).split("\n") if NICK + "님" in l][:2])
    over = mp.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    check("가로 스크롤 없음", over <= 1, over)
    mp.screenshot(path=os.path.join(SHOT, "46-v196-mobile-nick.png"))

    print("\n7) JS 오류")
    print("        pageerror:", errors[:3])
    check("pageerror 0", not errors, errors[:2])
    br.close()

print("\n결과: %s" % ("전부 통과 ✅" if not fail else "실패 %d건 ❌ %s" % (len(fail), fail)))
sys.exit(0 if not fail else 1)

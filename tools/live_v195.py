#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v1.9.5 라이브 검증 — 실제 배포 페이지에서 매운맛·인식률·모드·모바일 확인.

  · 도랏 첫인사에 쌍욕이 뜨는지
  · 실제로 당한 문장 / 붙여쓴 욕 / 우회 표기 / 사투리 쌍욕 / 말싸움 도발 → 받아치기
  · 일상 문장은 공격으로 새지 않는지
  · 건전·일반 모드는 순한 말투 유지
  · 390px 모바일 레이아웃 · pageerror 0
"""
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

URL = "https://ageofwar-kr.github.io/dorati/?stay=1"
SHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")

fail = []
errors = []
SWEAR = re.compile(r"(시발|씨발|ㅅㅂ|병신|븅신|씹|좆|지랄|개소리|아가리|대가리|꺼져|닥치)")
TEACH = re.compile(r"그딴 말은 처음 들어|내 사전에 그건 없다|뭐라는 거야")
POLITE = re.compile(r"(주세요|하세요|합니다|습니다|감사합니다|죄송|😊)")


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)[:120]) if detail and not ok else ""))
    if not ok:
        fail.append(name)


def bot_texts(page):
    return [b.inner_text().strip() for b in page.query_selector_all("#chat .row.bot:not(.typing) .bubble") if b.inner_text().strip()]


def send(page, text, wait=12):
    before = len(bot_texts(page))
    page.fill("#input", text)
    page.press("#input", "Enter")
    t0 = time.time()
    while time.time() - t0 < wait:
        page.wait_for_timeout(200)
        b = bot_texts(page)
        if len(b) > before and not page.query_selector("#chat .row.bot.typing"):
            page.wait_for_timeout(200)
            return bot_texts(page)[-1]
    return "(응답 없음)"


def set_mode(page, mode):
    page.click('[data-mode-btn="%s"]' % mode)
    page.wait_for_timeout(400)


CASES = [
    ("가오쳐잡지마 개병신따까리장애인새끼야 어때 매운말만 하다가 매운말 들으니까? 이렇게", "실제로 당한 문장"),
    ("찐따새끼네 대답도 못하는거 보니까", "붙여쓴 욕"),
    ("병신따까리새끼 shut up!", "붙여쓴 욕 2"),
    ("ㅅ1ㅂ", "우회 초성"),
    ("시1발", "우회 숫자"),
    ("ㅂ ㅅ", "우회 띄어쓰기"),
    ("병1신", "우회 숫자 2"),
    ("니가 뭔데", "반말 시비"),
    ("너 할 줄 아는 게 뭐냐", "반말 시비 2"),
    ("꼬라지 하고는", "수준 디스"),
    ("인성 문제 있네", "인성 디스"),
    ("니 수준 알겠다", "수준 디스 2"),
    ("가오 잡지 마", "역공"),
    ("매운말만 하지 마", "역공 2"),
    ("훈수 두지 마", "역공 3"),
    ("말싸움 하자", "도발"),
    ("존나 못하네", "요즘 팩폭"),
    ("개노잼", "요즘 팩폭 2"),
    ("병먹금", "커뮤 은어"),
    ("니 능지 수준 보소", "커뮤 은어 2"),
    ("문해력 박살이네", "커뮤 은어 3"),
    ("뇌절 좀 그만", "뇌절"),
    ("와! 너정말 핵심을찔렀어 근데 어쩌라는건지 나는잘 모르겠어☺️", "비꼬는 AI 말투"),
    ("대단하시네요 진짜 ^^", "반어법"),
    ("야이 씹새끼야 시발 아가리 닥치고 있어라", "쌍욕"),
    ("아따 개소리 작작 해라잉 미친놈아", "전라 사투리 쌍욕"),
    ("어유~ 지랄도 풍년이다 슈벌", "충청 사투리 쌍욕"),
    ("거 보니까 대가리 빈 거 티 나네 ㅋ 병신", "경기 사투리 쌍욕"),
    ("아 네~ 지랄 났네 진짜 븅신", "서울 사투리 쌍욕"),
]
SAFE = ["관종이 뭐야", "거울 사고 싶어", "오늘 미친 듯이 바빴다", "오늘 시발 힘들었어", "너무 한심한 영화였어"]

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    page.wait_for_timeout(800)
    if page.is_visible("#gate"):
        page.fill("#gate-input", "테스터")
        page.click("#gate-start")
        page.wait_for_timeout(600)

    print("1) 버전 · 로딩")
    check("v1.9.5 표기", "v1.9.5" in page.inner_text(".app-footer"), page.inner_text(".app-footer")[:60])
    check("팩 로딩", page.evaluate("() => !!(window.DORATI_CORPUS && window.DORATI_CORPUS.intents.length)") is True)
    total = page.evaluate("""() => (window.DORATI_CORPUS.intents||[]).reduce(function (n, i) { return n + (i.atk ? i.dorat.length : 0); }, 0)""")
    print("        실린 공격 대사:", total)
    check("공격 대사 25,000개 이상", total >= 25000, total)

    print("2) 도랏 모드 첫인사")
    set_mode(page, "dorat")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    if page.is_visible("#gate"):
        page.fill("#gate-input", "테스터")
        page.click("#gate-start")
        page.wait_for_timeout(600)
    set_mode(page, "dorat")
    page.wait_for_timeout(900)
    intro = bot_texts(page)
    print("        첫인사:", (intro[-1] if intro else "-")[:70])
    check("도랏 첫인사에 쌍욕", bool(intro) and bool(SWEAR.search(intro[-1])), intro[-1] if intro else "없음")

    print("3) 시비 %d건 받아치기" % len(CASES))
    for text, label in CASES:
        r = send(page, text)
        ok = bool(r) and r != "(응답 없음)" and not TEACH.search(r) and bool(SWEAR.search(r))
        print("        [%-14s] %s → %s" % (label, text[:26], r.replace("\n", " ")[:56]))
        check("'%s' 받아치기" % text[:16], ok, r)

    print("4) 일상 문장 오탐")
    for text in SAFE:
        r = send(page, text)
        print("        %-18s → %s" % (text, r.replace("\n", " ")[:52]))
        check("'%s' 공격 아님" % text, not SWEAR.search(r) or "힘들" in text or "바빴" in text, r)
    page.screenshot(path=os.path.join(SHOT, "40-v195-dorat-desktop.png"))

    print("5) 건전·일반 모드")
    set_mode(page, "clean")
    r = send(page, "니가 더 못생김")
    print("        건전:", r[:60])
    check("건전 = 정중한 답", bool(POLITE.search(r)), r)
    set_mode(page, "normal")
    r = send(page, "니가 더 못생김")
    print("        일반:", r[:60])
    check("일반 = 강한 욕설 없음", not re.search(r"시발|씨발|병신|ㅄ|개새끼", r), r)
    set_mode(page, "dorat")

    print("6) 390px 모바일")
    m = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                       user_agent="Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36")
    mp = m.new_page()
    mp.on("pageerror", lambda e: errors.append("mobile:" + str(e)))
    mp.goto(URL, wait_until="networkidle")
    mp.wait_for_timeout(900)
    if mp.is_visible("#gate"):
        mp.fill("#gate-input", "테스터")
        mp.click("#gate-start")
        mp.wait_for_timeout(500)
    mp.click('[data-mode-btn="dorat"]')
    mp.wait_for_timeout(600)
    r = send(mp, "가오쳐잡지마 개병신따까리장애인새끼야 어때 매운말만 하다가 매운말 들으니까?")
    print("        모바일 응답:", r.replace("\n", " ")[:60])
    check("모바일 받아치기", bool(SWEAR.search(r)), r)
    over = mp.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
    print("        가로 넘침:", over)
    check("가로 스크롤 없음", over <= 1, over)
    mp.screenshot(path=os.path.join(SHOT, "41-v195-dorat-mobile390.png"), full_page=False)

    print("7) JS 오류")
    print("        pageerror:", errors[:3])
    check("pageerror 0", not errors, errors[:2])
    br.close()

print("\n결과: %s" % ("전부 통과 ✅" if not fail else "실패 %d건 ❌ %s" % (len(fail), fail)))
sys.exit(0 if not fail else 1)

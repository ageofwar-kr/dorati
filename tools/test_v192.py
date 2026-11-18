#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도랏이 v1.9.2 자체 검사 — 똑똑이(제미나이) 응답 속도 개선.

검사 항목 (코드 계약)
 1) index.html이 v1.9.2 표기 + 캐시버스트 ?v=4.6 + 중계 서버 preconnect를 쓴다
 2) config.js: version 1.9.2 · smartDefaultModel gemini-3.5-flash-lite · smartWarmTtl·smartContextMsgs 존재
 3) smart.js: ask()가 history를 trimHistory로 줄이고 model을 명시한다 · warm()을 밖으로 노출한다
 4) app.js: 똑똑이 모드 진입/입력 시작 때 Smart.warm()을 부르고, smartHistory는 8메시지 이하
 5) 중계 서버(Code.gs): PRIMARY가 gemini-3.5-flash-lite, MAX_TURNS 4, 채팅 maxOutputTokens 400
 6) thinkingBudget:0을 쓰지 않는다 (gemini-3.5-flash-lite는 400으로 거부하는 파라미터)
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PROXY = os.path.join(os.path.dirname(ROOT), "dorati-smart-proxy", "Code.gs")

fail = []


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def check(ok, msg):
    print(("  ok   " if ok else "  FAIL ") + msg)
    if not ok:
        fail.append(msg)


html = read("index.html")
cfg = read("js/config.js")
smart = read("js/smart.js")
app = read("js/app.js")

print("=== 1) 버전·캐시버스트 ===")
check("<span class=\"ver\">v1.9.2</span>" in html, "index.html 버전 표기 v1.9.2")
check("?v=4.6" in html and "?v=4.5" not in html, "index.html 캐시버스트 ?v=4.6")
check("v1.9.1" not in html and "v1.9.1" not in cfg, "v1.9.1 표기 잔존 없음")

print("\n=== 2) config ===")
check('version: "v1.9.2"' in cfg, 'config.version v1.9.2')
check('smartDefaultModel: "gemini-3.5-flash-lite"' in cfg, "기본 모델 gemini-3.5-flash-lite")
check(re.search(r"smartWarmTtl:\s*\d+", cfg) is not None, "smartWarmTtl 존재")
check(re.search(r"smartContextMsgs:\s*8", cfg) is not None, "smartContextMsgs 8")
check(html.count("preconnect") >= 2, "중계 서버 preconnect 힌트")

print("\n=== 3) smart.js ===")
check("function trimHistory(" in smart, "trimHistory 구현")
check("history: trimHistory(history)" in smart, "ask()가 문맥을 줄여 보냄")
check("model: modelName()" in smart, "ask()가 모델을 명시")
check("warm: warm," in smart, "warm() 노출")
check("slice(-(Number(cfg.smartContextMsgs) || 8))" in smart, "문맥 상한 8메시지")
check("slice(0, 200)" in smart, "문맥 200자 컷")

print("\n=== 4) app.js ===")
check('if (mode === "smart" && window.Smart && window.Smart.warm) window.Smart.warm();' in app,
      "똑똑이 모드 진입 시 사전 예열")
check("function warmSmart()" in app and app.count('input.addEventListener("focus", warmSmart)') == 1,
      "입력 시작 시 사전 예열")
check(app.count("warmSmart") >= 4, "입력 이벤트 3종 연결")
check("state.history.slice(-9, -1)" in app and "return out.slice(-8);" in app,
      "smartHistory 4턴(8메시지)")
check("t.slice(0, 200)" in app, "smartHistory 200자 컷")
check(re.search(r"if \(state\.mode === \"smart\"\) \{ sendSmart", app) is not None,
      "똑똑이 경로에 인위적 setTimeout 없음")
seg = app.split("function sendSmart(")[1].split("function fallbackToEngine(")[0]
check("setTimeout" not in seg, "sendSmart 안에 setTimeout 없음")

print("\n=== 5) 중계 서버 Code.gs ===")
if os.path.exists(PROXY):
    gs = open(PROXY, encoding="utf-8").read()
    check("var PRIMARY_MODEL = 'gemini-3.5-flash-lite';" in gs, "PRIMARY gemini-3.5-flash-lite")
    check("var MAX_TURNS = 4;" in gs, "MAX_TURNS 4")
    check("maxOutputTokens: 400" in gs, "채팅 maxOutputTokens 400")
    check("version: '1.9.2'" in gs, "프록시 version 1.9.2")
    print("\n=== 6) thinking 설정 ===")
    check("thinkingBudget: 0" not in gs, "thinkingBudget:0 미사용(3.5-flash-lite는 400 거부)")
else:
    print("  (건너뜀) dorati-smart-proxy/Code.gs 없음")

print("\nRESULT: " + ("PASS" if not fail else "FAIL (" + ", ".join(fail) + ")"))
sys.exit(0 if not fail else 1)

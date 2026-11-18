#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도랏이 v1.9.3 자체 검사 — 쌍욕·받아치기 8,500+ 팩 + 카톡 자동 탈출.

검사 항목
 1) kb-dorat-extra.js 로딩 · 풀별 대사 수 · 총합 8,600 이상 · 중복 0
 2) 공격 감지: 외모 / AI 비하 / 반박 도발 / 단일 욕설 / 장문 / 약올리기
 3) 일반 대화가 공격으로 오인되지 않는다
 4) 도랏·미친도랏·건전·일반 모드 응답이 각 모드 말투를 지킨다
 5) 이스터에그(미친도랏) 힌트 정상
 6) 공격 답변은 학습 대상(kind=attack)에서 빠진다
 7) index.html/config/admin 버전·캐시버스트·스크립트 연결
 8) 카톡 자동 탈출 코드 계약
"""
import os
import re
import sys

import quickjs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FILES = ["js/safety.js", "js/kb-dialogues.js", "js/kb-corpus.js",
         "js/kb-dorat-extra.js", "js/engine.js"]

ctx = quickjs.Context()
ctx.eval("globalThis.window = globalThis;")
for f in FILES:
    ctx.eval(open(os.path.join(ROOT, f), encoding="utf-8").read())

fail = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)) if detail and not ok else ""))
    if not ok:
        fail.append(name)


def ask(text, mode="dorat", snap=None):
    ctx.eval("globalThis.__q = %s; globalThis.__m = %s;" % (
        __import__("json").dumps(text), __import__("json").dumps(mode)))
    ctx.eval("globalThis.__r = window.Engine.answerSync(__q, __m, {pairs: [], byNorm: {}});")
    return ctx.eval("JSON.stringify(window.Engine.answerSync(window.__q, window.__m, {pairs: [], byNorm: {}}))")


import json

print("1) 팩 로딩 · 대사 수")
counts = json.loads(ctx.eval("""
(function () {
  var out = {}, total = 0, all = [];
  (window.DORATI_CORPUS.intents || []).forEach(function (it) {
    if (!it.atk) return;
    out[it.id] = it.dorat.length;
    total += it.dorat.length;
    all = all.concat(it.dorat);
  });
  var uniq = {}; all.forEach(function (s) { uniq[s] = 1; });
  return JSON.stringify({ pools: out, total: total, unique: Object.keys(uniq).length });
})()
"""))
for k, v in counts["pools"].items():
    print("        %-12s %5d" % (k, v))
print("        total %d · unique %d" % (counts["total"], counts["unique"]))
check("공격 팩이 11개 풀 이상", len(counts["pools"]) >= 11, list(counts["pools"]))
check("고유 대사 8,600개 이상", counts["unique"] >= 8600, counts["unique"])
check("중복 없음", counts["unique"] == counts["total"], counts["total"] - counts["unique"])

print("\n2) 공격 감지 · 받아치기")
cases = [
    ("니가더 못생김", "atk_face"),
    ("야이 멍청한 봇새끼야", "atk_ai"),
    ("넌 쩌피 ai여서 믈밖에 못하는 무용지물 쓰레기 주제에 인간이 만들었는데 반항하고 교육도 안받은 고장난 녀석이지만 미안하다고 말할께 반박할꺼면 해봐 맞는말이잖아", "atk_long"),
    ("반박해봐 어쩔", "atk_taunt"),
    ("시발", "atk_solo"),
    ("병신아", "atk_solo"),
    ("개새끼야", "atk_solo"),
    ("닥쳐", "atk_solo"),
    ("AI한테 지고 부들부들하냐 ㅋㅋㅋ", "atk_"),
]
for text, want in cases:
    r = json.loads(ask(text))
    got = r.get("intent", "")
    ok = r.get("kind") == "attack" and got.startswith(want)
    print("        %-30s → %-18s %s" % (text[:28], got, ("✅ " + r.get("text", "")[:46])))
    check("'%s' 받아치기" % text[:18], ok, got)

print("\n3) 일반 대화는 공격으로 오인하지 않는다")
for text in ["안녕", "심심해", "오늘 너무 힘들었어", "나 오늘 시발 힘들었어",
             "치킨 vs 피자", "블루투스 뜻이 뭐야", "점심 뭐 먹지", "고마워"]:
    r = json.loads(ask(text))
    print("        %-22s → %s" % (text, r.get("intent", r.get("type"))))
    check("'%s' 오인 없음" % text, r.get("kind") != "attack", r.get("intent"))

print("\n4) 모드별 말투")
r = json.loads(ask("니가 더 못생김", "clean"))
check("건전 모드 = 정중한 답", "😊" in r["text"] or "요" in r["text"] or "죠" in r["text"], r["text"])
r = json.loads(ask("니가 더 못생김", "normal"))
import re as _re
check("일반 모드 = 강한 욕설 없음", not _re.search(r"시발|씨발|병신|ㅄ|개새끼", r["text"]), r["text"])
r = json.loads(ask("니가 더 못생김", "dorat_crazy"))
check("미친도랏 = 받아치기", r.get("kind") == "attack", r.get("intent"))
r = json.loads(ask("심심해", "clean"))
check("건전 모드 일반 대화 정상", r.get("type") == "text" and r.get("kind") != "attack", r.get("intent"))

print("\n5) 이스터에그")
r = json.loads(ask("미친도랏", "dorat"))
check("미친도랏 = 힌트만", r.get("kind") == "eggHint", r.get("intent"))

print("\n6) 공격 답변은 학습 제외")
r = json.loads(ask("니가더 못생김"))
check("kind=attack", r.get("kind") == "attack", r.get("kind"))
check("askTeachFor 없음", not r.get("askTeachFor"), r.get("askTeachFor"))

print("\n7) 버전 · 연결")
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
cfg = open(os.path.join(ROOT, "js", "config.js"), encoding="utf-8").read()
admin = open(os.path.join(ROOT, "admin.html"), encoding="utf-8").read()
app = open(os.path.join(ROOT, "js", "app.js"), encoding="utf-8").read()
check("index.html v1.9.3", '<span class="ver">v1.9.3</span>' in html)
check("index.html kb-dorat-extra 로딩", "kb-dorat-extra.js" in html)
check("index.html 캐시버스트 4.7", "?v=4.7" in html and "?v=4.6" not in html)
check("config v1.9.3", 'version: "v1.9.3"' in cfg)
check("admin kb-dorat-extra 로딩", "kb-dorat-extra.js" in admin)
check("app.js 학습 제외", 'res.kind !== "attack"' in app)
check("engine 1.9.3", ctx.eval("window.Engine.version") == "1.9.3", ctx.eval("window.Engine.version"))

print("\n8) 카톡 자동 탈출")
check("카톡 UA 감지", 'indexOf("kakaotalk")' in app)
check("openExternal 스킴", "kakaotalk://web/openExternal" in app)
check("안드로이드 intent", "intent://" in app)
check("무한 루프 방지 sessionStorage", "sessionStorage" in app and "KAKAO_COOL" in app)
check("수동 정지 스위치 stay=1", "stay=1" in app)
check("수동 배너 유지", "kakao-banner" in app and "goExternal" in app)

print("\n결과: %s" % ("전부 통과 ✅" if not fail else "실패 %d건 ❌ %s" % (len(fail), fail)))
sys.exit(0 if not fail else 1)

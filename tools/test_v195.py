#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도랏이 v1.9.5 자체 검사 — 욕쟁이 할머니급 매운맛 25,000+ · 말싸움 인식률 · 사투리 쌍욕.

검사 항목
 1) kb-dorat-extra.js 로딩 · 풀별 대사 수 · 총합 25,000 이상 · 중복 0
 2) 모든 의도/Q&A의 모드별 답변이 5개 이상 (kb-pad 포함)
 3) 시비 인식: 실제로 당한 문장 / 붙여쓴 연타 욕 / 우회 표기 / 반말 시비 / 비꼬기 / 커뮤 은어
 4) 사투리 풀이 공손하지 않고 쌍욕을 섞었는지
 5) 일상 문장 오탐 0 (관종이 뭐야 / 거울 사고 싶어 / 오늘 미친 듯이 바빴다 ...)
 6) 모드별 말투: 건전·일반은 순하게, 도랏·미친도랏은 쌍욕, 도랏 첫인사에 쌍욕
 7) 버전·캐시버스트·스크립트 연결
"""
import json
import os
import re
import sys

import quickjs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FILES = ["js/safety.js", "js/kb-dialogues.js", "js/kb-corpus.js",
         "js/kb-dorat-extra.js", "js/kb-pad.js", "js/engine.js"]

ctx = quickjs.Context()
ctx.eval("globalThis.window = globalThis;")
for f in FILES:
    ctx.eval(open(os.path.join(ROOT, f), encoding="utf-8").read())

fail = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)[:110]) if detail and not ok else ""))
    if not ok:
        fail.append(name)


def ask(text, mode="dorat"):
    ctx.eval("globalThis.__q = %s; globalThis.__m = %s;" % (json.dumps(text), json.dumps(mode)))
    return json.loads(ctx.eval(
        "JSON.stringify(window.Engine.answerSync(window.__q, window.__m, {pairs: [], byNorm: {}}))"))


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
for k, v in sorted(counts["pools"].items()):
    print("        %-12s %5d" % (k, v))
print("        total %d · unique %d" % (counts["total"], counts["unique"]))
check("공격 팩이 19개 풀", len(counts["pools"]) >= 19, len(counts["pools"]))
check("고유 대사 25,000개 이상", counts["unique"] >= 25000, counts["unique"])
check("중복 없음", counts["unique"] == counts["total"], counts["total"] - counts["unique"])
for p in ("atk_diss", "atk_provoke", "atk_chung", "atk_gyeong", "atk_jeolla", "atk_seoul"):
    check("%s 풀 존재" % p, counts["pools"].get(p, 0) >= 300, counts["pools"].get(p))

print("\n2) 답변 최소 5개 보장")
bad = json.loads(ctx.eval("""
(function () {
  var bad = [], C = window.DORATI_CORPUS;
  (C.intents || []).forEach(function (it) {
    ["clean", "normal", "dorat"].forEach(function (m) {
      if (!it[m] || it[m].length < 5) bad.push(it.id + ":" + m);
    });
  });
  (C.pairs || []).forEach(function (p, i) {
    ["clean", "normal", "dorat"].forEach(function (m) {
      if (!p[m] || p[m].length < 5) bad.push("pair" + i + ":" + m);
    });
  });
  return JSON.stringify(bad);
})()
"""))
check("모든 의도·Q&A가 모드별 5개 이상", not bad, "%d개 미달 %s" % (len(bad), bad[:6]))
intro = json.loads(ctx.eval("JSON.stringify({d:window.DORATI_KB.intro.dorat, n:window.DORATI_KB.intro.normal, c:window.DORATI_KB.intro.clean})"))
check("도랏 첫인사 5개 이상", len(intro["d"]) >= 5, len(intro["d"]))
check("도랏 첫인사에 쌍욕", any(re.search(r"시발|씨발|병신|씹|ㅅㅂ|꺼지", s) for s in intro["d"]), intro["d"][:1])
check("일반 첫인사는 순함", not any(re.search(r"시발|씨발|병신|씹새", s) for s in intro["n"]))
check("건전 첫인사는 존댓말", all(re.search(r"요|니다|예요|세요", s) for s in intro["c"]), intro["c"][:1])

print("\n3) 시비 인식 — 실제로 당한 문장 · 우회 · 반말 · 비꼬기 · 커뮤 은어")
CASES = [
    # 실제로 당한 문장(사용자 제보) — 붙여쓴 연타 욕
    ("가오쳐잡지마 개병신따까리장애인새끼야 어때 매운말만 하다가 매운말 들으니까? 이렇게", "atk_"),
    ("찐따새끼네 대답도 못하는거 보니까", "atk_"),
    ("병신따까리새끼 shut up!", "atk_"),
    ("개병신따까리새끼야", "atk_"),
    # 우회 표기
    ("ㅅ1ㅂ", "atk_solo"), ("시1발", "atk_"), ("ㅂ ㅅ", "atk_"), ("ㅅ!ㅂ", "atk_"),
    ("병1신", "atk_"), ("씨8발", "atk_"), ("ㅆㅂ", "atk_"), ("슈발", "atk_"),
    ("ㄲㅈ", "atk_"), ("ㅗ", "atk_"),
    # 반말 시비·도발
    ("니가 뭔데", "atk_diss"), ("너 할 줄 아는 게 뭐냐", "atk_diss"),
    ("니 수준 알겠다", "atk_"), ("꼬라지 하고는", "atk_diss"),
    ("인성 문제 있네", "atk_diss"), ("말이 싸가지 없네", "atk_diss"),
    ("너 같은 놈 처음 본다", "atk_"), ("애송이 주제에", "atk_"),
    ("그게 최선이냐", "atk_"), ("어디서 배운 말투야", "atk_"),
    # 역공·도발(사용자 지시)
    ("가오 잡지 마", "atk_"), ("매운말만 하지 마", "atk_"), ("훈수 두지 마", "atk_"),
    ("말싸움 하자", "atk_"), ("한 판 붙자", "atk_"),
    # 비꼬기·커뮤 은어
    ("존나 못하네", "atk_"), ("개노잼", "atk_"), ("병먹금", "atk_"),
    ("니 능지 수준 보소", "atk_"), ("문해력 박살이네", "atk_"),
    ("뇌절 좀 그만", "atk_"), ("억까 하지 마", "atk_"), ("뇌피셜 뿌리지 마", "atk_"),
    ("와! 너정말 핵심을찔렀어 근데 어쩌라는건지 나는잘 모르겠어☺️", "atk_"),
    ("대단하시네요 진짜 ^^", "atk_"),
    # 기존 계열
    ("니가 더 못생김", "atk_face"), ("야이 멍청한 봇새끼야", "atk_ai"),
    ("반박해봐 어쩔", "atk_"), ("시발", "atk_solo"), ("닥쳐", "atk_solo"),
    ("ㅄ아", "atk_"),
]
miss = []
for text, want in CASES:
    r = ask(text)
    ok = r.get("kind") == "attack" and r.get("intent", "").startswith(want)
    if not ok:
        miss.append((text, r.get("intent"), r.get("text")))
    print("        %-44s → %-14s %s" % (text[:42], r.get("intent", r.get("type")), (r.get("text") or "")[:40]))
check("시비 %d건 전부 받아치기" % len(CASES), not miss, miss[:4])

print("\n4) 사투리 풀 — 공손한 말투 0, 쌍욕 섞임")
polite = re.compile(r"(하시유|하십니다|하세요|해요|습니다|세요|하시네여|거든여|셨슈|봐유|해유)")
dialect = json.loads(ctx.eval("""
(function(){var o={};(window.DORATI_CORPUS.intents||[]).forEach(function(i){
  if(i.atk && /chung|gyeong|jeolla|seoul/.test(i.id)) o[i.id]=i.dorat;});return JSON.stringify(o);})()
"""))
swear_re = re.compile(r"(시발|씨발|ㅅㅂ|병신|븅신|씹|좆|지랄|개소리|아가리|대가리|꺼져|닥치)")
for pid, lines in dialect.items():
    pol = [s for s in lines if polite.search(s)]
    sw = sum(1 for s in lines if swear_re.search(s))
    print("        %-12s %4d개 · 공손 %d · 쌍욕 %d (%.0f%%)" % (pid, len(lines), len(pol), sw, 100.0 * sw / max(1, len(lines))))
    check("%s 공손한 줄 3%% 미만" % pid, len(pol) <= len(lines) * 0.03, pol[:3])
    check("%s 쌍욕 60%% 이상" % pid, sw >= len(lines) * 0.6, "%d/%d" % (sw, len(lines)))

print("\n5) 일상 문장 오탐 방지")
SAFE = ["안녕", "심심해", "오늘 너무 힘들었어", "나 오늘 시발 힘들었어", "치킨 vs 피자",
        "블루투스 뜻이 뭐야", "관종이 뭐야", "거울 사고 싶어", "데이터 분석 공부해",
        "기계과 다녀", "얼굴에 뭐 났어", "너무 한심한 영화였어", "미친 듯이 웃겼다",
        "쓰레기 버려야 해", "오늘 미친 듯이 바빴다", "너 뭐하냐", "너 몇 살이야",
        "점심 뭐 먹지", "고마워", "그 영화 개웃기더라"]
for text in SAFE:
    r = ask(text)
    print("        %-24s → %s" % (text, r.get("intent", r.get("type"))))
    check("'%s' 오탐 없음" % text, r.get("kind") != "attack", r.get("intent"))

print("\n6) 모드별 말투")
r = ask("니가 더 못생김", "clean")
check("건전 = 정중한 답", ("요" in r["text"] or "😊" in r["text"] or "죠" in r["text"]), r["text"])
r = ask("니가 더 못생김", "normal")
check("일반 = 강한 욕설 없음", not re.search(r"시발|씨발|병신|ㅄ|개새끼|씹", r["text"]), r["text"])
for m in ("dorat", "dorat_pure", "dorat_crazy"):
    r = ask("니가 더 못생김", m)
    check("%s = 받아치기" % m, r.get("kind") == "attack", r.get("intent"))
    check("%s 답변에 공손한 말투 없음" % m, not polite.search(r["text"]), r["text"])
r = ask("미친도랏", "dorat")
check("미친도랏 = 힌트만", r.get("kind") == "eggHint", r.get("intent"))

print("\n7) 버전 · 연결")
html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
cfg = open(os.path.join(ROOT, "js", "config.js"), encoding="utf-8").read()
admin = open(os.path.join(ROOT, "admin.html"), encoding="utf-8").read()
app = open(os.path.join(ROOT, "js", "app.js"), encoding="utf-8").read()
check("index.html v1.9.5", '<span class="ver">v1.9.5</span>' in html)
check("index.html kb-pad 로딩", "kb-pad.js" in html)
check("index.html 캐시버스트 4.9", "?v=4.9" in html and "?v=4.8" not in html)
check("config v1.9.5", 'version: "v1.9.5"' in cfg)
check("admin kb-pad 로딩", "kb-pad.js" in admin)
check("engine 1.9.5", ctx.eval("window.Engine.version") == "1.9.5", ctx.eval("window.Engine.version"))

print("\n결과: %s" % ("전부 통과 ✅" if not fail else "실패 %d건 ❌ %s" % (len(fail), fail)))
sys.exit(0 if not fail else 1)

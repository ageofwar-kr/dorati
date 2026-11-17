#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""도랏이 v1.9 자체 검사 — 미친도랏 이스터에그화.

검사 항목
 1) UI 문구에서 '순수도랏' 이름이 완전히 사라졌다(내부 키 dorat_pure 제외)
 2) 도랏 모드 안내 문구에 '순수도랏'·'19금' 같은 이스터에그 힌트가 없다
 3) 순수도랏 받아치기에 '위에 버튼 눌러라' 류 안내가 남아 있지 않다
 4) '미친도랏'이라는 말만으로는 미친도랏이 켜지지 않는다(engine이 hint만 준다)
 5) '도랏'이라고 하면 도랏 모드로만 간다(flavor 없음)
 6) 이스터에그 배너·인사말·힌트 데이터가 채워져 있다
 7) 주문 문자열 매칭(띄어쓰기 변형)이 app.js 규칙과 같게 동작한다
"""
import os
import re
import sys

import quickjs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FILES = ["js/safety.js", "js/kb-dialogues.js", "js/kb-corpus.js", "js/engine.js"]

ctx = quickjs.Context()
ctx.eval("globalThis.window = globalThis; window.localStorage = { getItem: function(){return null;}, setItem: function(){} };")
for f in FILES:
    ctx.eval(open(os.path.join(ROOT, f), encoding="utf-8").read())

fail = []


def check(name, ok, detail=""):
    print(("  ok   " if ok else "  FAIL ") + name + ((" — " + str(detail)) if detail and not ok else ""))
    if not ok:
        fail.append(name)


print("1) 사용자에게 보이는 문구에 '순수도랏' 잔존 여부")
visible = ctx.eval("""
(function(){
  var out = [];
  function grab(o, path) {
    if (typeof o === "string") { out.push(o); return; }
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) grab(o[i], path + "[" + i + "]"); return; }
    if (o && typeof o === "object") {
      for (var k in o) { if (Object.prototype.hasOwnProperty.call(o, k)) grab(o[k], path + "." + k); }
    }
  }
  grab(DORATI_KB.modeNotice, "modeNotice");
  grab(DORATI_KB.flavorNotice, "flavorNotice");
  grab(DORATI_KB.intro, "intro");
  grab(DORATI_KB.doratPureDeflect, "doratPureDeflect");
  grab(DORATI_KB.eggGreeting, "eggGreeting");
  grab(DORATI_KB.eggHint, "eggHint");
  grab(DORATI_KB.eggBanner, "eggBanner");
  return JSON.stringify(out);
})()
""")
import json
strings = json.loads(visible)
bad = [s for s in strings if "순수도랏" in s]
check("KB 문구에 '순수도랏' 0건", not bad, bad)

print("2) 도랏 모드 안내에 이스터에그 힌트가 없는지")
notice = ctx.eval("JSON.stringify([DORATI_KB.modeNotice.dorat, DORATI_KB.flavorNotice.pure])")
check("도랏 안내에 '19금' 없음", "19금" not in notice, notice)
check("도랏 안내에 '순수' 없음", "순수" not in notice, notice)
check("도랏 안내에 '미친도랏' 없음", "미친" not in notice, notice)
print("     → " + json.loads(notice)[0])

print("3) 받아치기 문구에 사라진 버튼 안내가 남았는지")
deflect = json.loads(ctx.eval("JSON.stringify(DORATI_KB.doratPureDeflect)"))
check("도랏 받아치기 %d줄" % len(deflect), len(deflect) >= 12, len(deflect))
stale = [s for s in deflect if re.search(r"위에|위로|버튼 눌러", s)]
check("'위에 버튼' 류 안내 0건", not stale, stale)
check("'옆집 미친도랏' 조크는 유지", any("옆집 미친도랏" in s for s in deflect))

print("4~5) 엔진 — 주문/이름만 던졌을 때")
r = json.loads(ctx.eval('JSON.stringify(Engine.answerSync("미친도랏", "dorat", {pairs:[],byNorm:{},count:0}))'))
check("'미친도랏'은 모드 전환이 아니라 힌트", r.get("type") == "text" and r.get("kind") == "eggHint", r)
r2 = json.loads(ctx.eval('JSON.stringify(Engine.answerSync("미친 도랏", "normal", {pairs:[],byNorm:{},count:0}))'))
check("'미친 도랏'(띄어쓰기)도 힌트", r2.get("kind") == "eggHint", r2)
r3 = json.loads(ctx.eval('JSON.stringify(Engine.answerSync("도랏", "normal", {pairs:[],byNorm:{},count:0}))'))
check("'도랏'은 flavor 없는 도랏 모드", r3.get("mode") == "dorat" and not r3.get("flavor"), r3)
r4 = json.loads(ctx.eval('JSON.stringify(Engine.answerSync("미친도랏이커몬", "normal", {pairs:[],byNorm:{},count:0}))'))
check("주문 문자열은 엔진이 모드를 바꾸지 않는다(app.js 담당)", r4.get("type") != "mode", r4)

print("6) 이스터에그 데이터")
eg = json.loads(ctx.eval("JSON.stringify(DORATI_KB.eggGreeting)"))
bn = json.loads(ctx.eval("JSON.stringify(DORATI_KB.eggBanner)"))
eh = json.loads(ctx.eval("JSON.stringify(DORATI_KB.eggHint)"))
check("eggGreeting 5개 이상", len(eg) >= 5, len(eg))
check("eggBanner 제목·부제 있음", bool(bn.get("title")) and bool(bn.get("sub")), bn)
check("eggHint 2개 이상", len(eh) >= 2, len(eh))
check("eggHint가 주문을 그대로 알려주지 않음", not any("커몬" in s for s in eh), eh)

print("7) 주문 매칭(앱 규칙) 재현 — 두 가지 주문")
INCANT = re.compile(r"미친\s*도랏이?\s*커\s*몬")
MODEALIAS = re.compile(r"미친\s*도랏\s*모드")
def trig(t):
    if INCANT.search(t) or MODEALIAS.search(t):
        return True
    return re.search(r"미친도랏이?커몬|미친도랏모드", re.sub(r"\s+", "", t)) is not None
cases = {
    "미친도랏이커몬": True,
    "미친 도랏 이 커몬": True,
    "미친도랏 커몬": True,
    "미친도랏이 커몬!": True,
    "미친도랏 커몬해줘": True,
    "미친도랏모드": True,
    "미친 도랏 모드": True,
    "미친도랏모드 가자": True,
    "미친도랏이커": False,
    "커몬": False,
    "미친도랏": False,
    "미친도랏모": False,
}
for t, want in cases.items():
    check("trigger(%r) == %s" % (t, want), trig(t) == want, trig(t))

print()
if fail:
    print("RESULT: FAIL (%d)" % len(fail))
    sys.exit(1)
print("RESULT: PASS")

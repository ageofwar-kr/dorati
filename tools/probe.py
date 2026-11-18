#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""detectAttack 인식률 탐침 — 입력 목록을 엔진에 던져 intent/kind/답변을 본다(개발용)."""
import json
import os
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


def ask(text, mode="dorat"):
    ctx.eval("globalThis.__q = %s; globalThis.__m = %s;" % (json.dumps(text), json.dumps(mode)))
    return json.loads(ctx.eval(
        "JSON.stringify(window.Engine.answerSync(window.__q, window.__m, {pairs: [], byNorm: {}}))"))


if __name__ == "__main__":
    cases = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else []
    mode = sys.argv[2] if len(sys.argv) > 2 else "dorat"
    for c in cases:
        r = ask(c, mode)
        print("%-46s | %-10s | %-14s | %s" % (c[:44], r.get("kind", r.get("type", "")),
                                              r.get("intent", "")[:14], r.get("text", "")[:62]))

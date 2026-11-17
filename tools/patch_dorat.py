#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""지정한 의도의 dorat 배열만 통째로 교체한다 (안전한 괄호 파서 사용).
사용법: python3 tools/patch_dorat.py patch.json
  patch.json = {"intentId": ["대사1", ...], ...}
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "..", "js", "kb-corpus.js")


def split_args(s, start, end):
    spans, depth, in_str, esc, arg_start, k = [], 0, None, False, start, start
    while k < end:
        ch = s[k]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_str:
                in_str = None
        else:
            if ch in "\"'":
                in_str = ch
            elif ch in "([{":
                depth += 1
            elif ch in ")]}":
                depth -= 1
            elif ch == "," and depth == 0:
                spans.append((arg_start, k))
                arg_start = k + 1
        k += 1
    spans.append((arg_start, end))
    return spans


def lead_ws(s):
    n = 0
    while n < len(s) and s[n] in " \t\r\n":
        n += 1
    return s[:n]


def render(lines, n=5):
    return "[" + (",\n" + " " * n).join(json.dumps(x, ensure_ascii=False) for x in lines) + "]"


def main():
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    s = open(CORPUS, encoding="utf-8").read()
    for iid, lines in data.items():
        needle = 'it("%s",' % iid
        i = s.index(needle)
        j = s.index("(", i) + 1
        depth, k, in_str, esc = 1, j, None, False
        while k < len(s):
            ch = s[k]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == in_str:
                    in_str = None
            else:
                if ch in "\"'":
                    in_str = ch
                elif ch in "([{":
                    depth += 1
                elif ch in ")]}":
                    depth -= 1
                    if depth == 0:
                        break
            k += 1
        spans = split_args(s, j, k)
        assert len(spans) == 5, (iid, len(spans))
        a, b = spans[4]
        seg = s[a:b]
        s = s[:a] + lead_ws(seg) + render(lines) + s[b:]
        print(iid, "->", len(lines))
    open(CORPUS, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    main()

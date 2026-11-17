#!/usr/bin/env python3
"""Harvest Korean proverbs / idioms / short common words with Korean definitions
from Korean Wiktionary (ko.wiktionary.org) via the public MediaWiki API.

Output: dorati/js/kb-wiktionary.js  (window.DORATI_KB_WIKI = {...})
License note: Wiktionary text is CC BY-SA 4.0 — attribution is shown in the app footer.
"""
import json, re, time, urllib.parse, urllib.request, os, sys

UA = {"User-Agent": "dorati-kb/1.0 (Korean learning chatbot)"}
API = "https://ko.wiktionary.org/w/api.php"


def api(**params):
    params.setdefault("format", "json")
    params.setdefault("origin", "*")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(6):
        try:
            return json.load(urllib.request.urlopen(req, timeout=40))
        except Exception as e:
            if attempt == 5:
                return {"query": {"pages": {}}}
            time.sleep(4 * (attempt + 1) + 2)


def category_members(cat, limit=None):
    out, cont = [], {}
    while True:
        p = dict(action="query", list="categorymembers", cmtitle="분류:" + cat, cmlimit="500", **cont)
        r = api(**p)
        out += [m["title"] for m in r["query"]["categorymembers"]]
        if "continue" in r and (limit is None or len(out) < limit):
            cont = r["continue"]
            time.sleep(1.0)
        else:
            return out


def definitions(titles):
    """Fetch wikitext in batches and extract '# ' lines of the 한국어 section."""
    result = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        r = api(action="query", prop="revisions", rvprop="content", rvslots="main",
                titles="|".join(batch))
        pages = r["query"]["pages"]
        for pid, page in pages.items():
            if "revisions" not in page:
                continue
            wt = page["revisions"][0]["slots"]["main"]["*"]
            defs = extract(wt)
            if defs:
                result[page["title"]] = defs
        time.sleep(1.2)
        print(f"  fetched {min(i+40,len(titles))}/{len(titles)}", file=sys.stderr)
    return result


def extract(wt):
    ko = wt.split("== 한국어 ==")
    if len(ko) < 2:
        return []
    body = ko[1].split("\n==", 1)[0]
    out = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("#") or line.startswith("#:") or line.startswith("#*"):
            continue
        text = line.lstrip("#").strip()
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)      # templates
        text = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", text)  # links
        text = re.sub(r"''+", "", text)
        text = re.sub(r"<[^>]+>", "", text)
        text = re.sub(r"\s+", " ", text).strip(" .,")
        if 8 <= len(text) <= 220 and not text.startswith("(") :
            out.append(text)
    return out[:3]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(here, "..", "js", "kb-wiktionary.js")

    print("proverbs...", file=sys.stderr)
    proverbs = category_members("한국어 속담")
    print("idioms...", file=sys.stderr)
    idioms = category_members("한국어 관용구")
    print("short nouns...", file=sys.stderr)
    nouns = category_members("한국어 명사", limit=1400)
    # common words are short: keep 2~3 syllable titles, no spaces
    words = [w for w in nouns if re.fullmatch(r"[가-힣]{2,3}", w)]
    words = words[:1200]

    print(f"proverbs={len(proverbs)} idioms={len(idioms)} words={len(words)}", file=sys.stderr)

    pv = definitions([p for p in proverbs if " " in p or len(p) >= 4])
    idm = definitions(idioms)
    wd = definitions(words)

    data = {"proverbs": pv, "idioms": idm, "words": wd}
    js = "window.DORATI_KB_WIKI = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)
    print("wrote", out_path, len(js), "bytes", file=sys.stderr)
    print(json.dumps({k: len(v) for k, v in data.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()

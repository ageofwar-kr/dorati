#!/usr/bin/env python3
"""도랏이 사전 중계 워커.

브라우저는 CORS 때문에 국립국어원 OpenAPI를 직접 부를 수 없다.
그래서 앱은 공용 DB의 /dictreq/{단어} 에 조회 요청을 남기고,
이 워커가 그 요청을 읽어 국립국어원 표준국어대사전 OpenAPI를 대신 호출한 뒤
/dict/{단어} 에 결과를 써준다. 앱은 /dict/{단어} 를 폴링해 결과를 받는다.

환경변수: STDICT_KEY (GitHub Actions secret), DB_URL
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

KEY = os.environ.get("STDICT_KEY", "")
DB = os.environ.get("DB_URL", "https://dorati-99953-default-rtdb.asia-southeast1.firebasedatabase.app").rstrip("/")
API = "https://stdict.korean.go.kr/api/search.do"
RUN_FOR = int(os.environ.get("RUN_FOR", "280"))       # 초
POLL_EVERY = float(os.environ.get("POLL_EVERY", "2"))
UA = {"User-Agent": "dorati-dict-relay/1.0"}


def http(url, method="GET", body=None, timeout=25):
    data = None
    headers = dict(UA)
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    return json.loads(raw) if raw.strip() else None


def stdict(q, num=12):
    p = {"key": KEY, "req_type": "json", "q": q, "num": max(10, min(100, num))}
    url = API + "?" + urllib.parse.urlencode(p)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                data = json.loads(r.read().decode("utf-8", "replace"))
            ch = data.get("channel") or {}
            items = ch.get("item") or []
            if isinstance(items, dict):
                items = [items]
            out = []
            for it in items:
                s = it.get("sense") or []
                if not isinstance(s, list):
                    s = [s]
                first = s[0] if s else {}
                link = first.get("link") or ""
                if isinstance(link, dict):
                    link = link.get("url", "")
                out.append({
                    "word": it.get("word") or "",
                    "pos": it.get("pos") or "",
                    "origin": it.get("origin") or "",
                    "link": link,
                    "senses": [x.get("definition") for x in s if x.get("definition")][:3],
                })
            return {"ok": True, "word": q, "total": ch.get("total") or len(out),
                    "items": out[:8], "source": "stdict", "ts": int(time.time() * 1000)}
        except Exception as e:
            if attempt == 2:
                return {"ok": False, "error": "upstream", "detail": str(e)[:120]}
            time.sleep(1.5 * (attempt + 1))


def handle(reqs):
    if not reqs:
        return 0
    done = 0
    for key, val in reqs.items():
        safe_key = urllib.parse.quote(key, safe="")
        word = (val or {}).get("q") or urllib.parse.unquote(key)
        word = str(word).strip()[:60]
        if not word:
            http(f"{DB}/dictreq/{safe_key}.json", "DELETE")
            continue
        res = stdict(word)
        if res and res.get("ok") and res.get("items"):
            http(f"{DB}/dict/{safe_key}.json", "PUT", res)
            done += 1
        else:
            # 못 찾은 것도 캐시해 같은 요청을 반복하지 않게 한다
            http(f"{DB}/dict/{safe_key}.json", "PUT",
                 {"ok": False, "word": word, "items": [], "ts": int(time.time() * 1000)})
        http(f"{DB}/dictreq/{safe_key}.json", "DELETE")
    return done


def main():
    if not KEY:
        print("STDICT_KEY 없음", file=sys.stderr)
        return 1
    deadline = time.time() + RUN_FOR
    total = 0
    print(f"relay start · {RUN_FOR}s", flush=True)
    while time.time() < deadline:
        try:
            reqs = http(f"{DB}/dictreq.json")
        except Exception as e:
            print("read fail", e, flush=True)
            time.sleep(POLL_EVERY)
            continue
        if reqs:
            n = handle(reqs)
            total += n
            print(f"handled {n} ({total} total)", flush=True)
        time.sleep(POLL_EVERY)
    print(f"relay done · {total} answered", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

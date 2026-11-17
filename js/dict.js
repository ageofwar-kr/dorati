/* 사전 연결 — 국립국어원 표준국어대사전
   1) 내장 번들(공식 API에서 미리 받아둔 데이터)  2) 공용 DB 캐시
   3) 중계 프록시(있을 때)  4) 공용 DB 요청 큐(중계 워커가 채워줌) */
window.Dict = (function () {
  "use strict";
  var cfg = window.DORATI_CONFIG;
  var DB = cfg.dbUrl.replace(/\/$/, "");
  var index = null, indexP = null;
  var shards = Object.create(null);
  var LS = "dorati.dictcache.v1";
  var memCache = Object.create(null);
  var COOLDOWN = 6 * 60 * 1000; /* 실패한 조회는 6분간 재요청하지 않음 */
  var failUntil = Object.create(null);

  function shardKey(word) {
    var c = String(word || "").charAt(0);
    if (!c) return "기타";
    if (c >= "가" && c <= "힣") {
      var table = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ",
                   "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
      var idx = Math.floor((c.charCodeAt(0) - 0xAC00) / 588);
      return table[idx] || "기타";
    }
    if (/[a-zA-Z]/.test(c)) return "abc";
    if (/[0-9]/.test(c)) return "num";
    return "기타";
  }

  function loadIndex() {
    if (indexP) return indexP;
    indexP = fetch("data/index.json", { cache: "force-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { index = j; return j; })
      .catch(function () { return null; });
    return indexP;
  }

  function loadShard(kind, key) {
    var id = kind + ":" + key;
    if (shards[id]) return Promise.resolve(shards[id]);
    return loadIndex().then(function (idx) {
      var meta = idx && idx[kind] && idx[kind][key];
      if (!meta) { shards[id] = {}; return {}; }
      return fetch(meta.file, { cache: "force-cache" })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (j) { shards[id] = j || {}; return shards[id]; })
        .catch(function () { shards[id] = {}; return {}; });
    });
  }

  function localCacheGet(key) {
    if (memCache[key]) return memCache[key];
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj[key]) { memCache[key] = obj[key]; return obj[key]; }
    } catch (e) { /* noop */ }
    return null;
  }

  function localCachePut(key, val) {
    memCache[key] = val;
    try {
      var raw = localStorage.getItem(LS);
      var obj = raw ? JSON.parse(raw) : {};
      obj[key] = val;
      var keys = Object.keys(obj);
      if (keys.length > 400) {
        keys.slice(0, keys.length - 400).forEach(function (k) { delete obj[k]; });
      }
      localStorage.setItem(LS, JSON.stringify(obj));
    } catch (e) { /* noop */ }
  }

  function pack(word, pos, senses, source, link) {
    return { word: word, pos: pos || "", senses: senses || [], source: source || "", link: link || "" };
  }

  /* 내장 번들에서 찾기 */
  function findBundled(word, kind) {
    kind = kind || "words";
    return loadShard(kind, shardKey(word)).then(function (table) {
      var hit = table[word];
      if (!hit) {
        /* 공백 제거/붙여쓰기 변형도 시도 */
        var w2 = word.replace(/\s+/g, "");
        hit = table[w2] || table[w2.replace(/(은|는|이|가|을|를|의)$/, "")];
      }
      if (!hit) return null;
      var senses = [hit.d, hit.d2, hit.d3].filter(function (x) { return !!x; });
      return pack(hit.w, hit.p, senses, "국립국어원 표준국어대사전", "");
    });
  }

  /* 공용 DB 캐시 + 요청 큐 */
  function fromShared(word) {
    var key = encodeURIComponent(word);
    return fetch(DB + "/dict/" + key + ".json?print=silent", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (v && v.items && v.items.length) {
          var it = v.items[0];
          return pack(it.word || word, it.pos, it.senses, "국립국어원 표준국어대사전", it.link);
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function askProxy(word) {
    if (!cfg.dictProxy) return Promise.resolve(null);
    var url = cfg.dictProxy + (cfg.dictProxy.indexOf("?") >= 0 ? "&" : "?") + "q=" + encodeURIComponent(word);
    return fetch(url, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || !j.items || !j.items.length) return null;
        var it = j.items[0];
        return pack(it.word || word, it.pos, it.senses, "국립국어원 표준국어대사전", it.link);
      })
      .catch(function () { return null; });
  }

  /* 공용 DB에 조회 요청을 남기고, 중계 워커가 채워줄 때까지 잠깐 기다린다 */
  function askRelay(word, waitMs) {
    if (!cfg.dictRelay) return Promise.resolve(null);
    var now = Date.now();
    if (failUntil[word] && now < failUntil[word]) return Promise.resolve(null);
    var key = encodeURIComponent(word);
    return fetch(DB + "/dictreq/" + key + ".json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: word, t: now })
    }).catch(function () { return null; }).then(function () {
      var deadline = Date.now() + (waitMs || cfg.dictRelayWaitMs || 9000);
      return new Promise(function (resolve) {
        (function loop() {
          fromShared(word).then(function (res) {
            if (res) return resolve(res);
            if (Date.now() > deadline) {
              failUntil[word] = Date.now() + COOLDOWN;
              return resolve(null);
            }
            setTimeout(loop, 1200);
          });
        })();
      });
    });
  }

  function lookup(word) {
    word = String(word || "").trim();
    if (!word) return Promise.resolve(null);
    var cached = localCacheGet("w:" + word);
    if (cached) return Promise.resolve(cached);
    return findBundled(word, "words").then(function (b) {
      if (b) { localCachePut("w:" + word, b); return b; }
      return fromShared(word).then(function (s) {
        if (s) { localCachePut("w:" + word, s); return s; }
        return askProxy(word).then(function (p) {
          if (p) { localCachePut("w:" + word, p); return p; }
          return askRelay(word).then(function (r) {
            if (r) localCachePut("w:" + word, r);
            return r;
          });
        });
      });
    });
  }

  /* 속담/관용구: 사전 API에서는 구·속담으로 검색한다 */
  function lookupProverb(phrase) {
    var cached = localCacheGet("p:" + phrase);
    if (cached) return Promise.resolve(cached);
    return findBundled(phrase, "proverbs").then(function (b) {
      if (b) { localCachePut("p:" + phrase, b); return b; }
      return askProxy(phrase + " 속담").then(function (p) {
        if (p) { localCachePut("p:" + phrase, p); return p; }
        return null;
      });
    });
  }

  return {
    lookup: lookup,
    lookupProverb: lookupProverb,
    loadIndex: loadIndex,
    shardKey: shardKey
  };
})();

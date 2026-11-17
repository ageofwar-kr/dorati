/* 공용 학습 저장소 — Firebase Realtime Database(REST) + 실시간 스트림
   원칙: 진짜 저장소는 서버(공용 DB). localStorage는 첫 화면용 캐시일 뿐이다. */
window.Store = (function () {
  "use strict";
  var cfg = window.DORATI_CONFIG;
  var DB = cfg.dbUrl.replace(/\/$/, "");
  var LS = "dorati.pairs.v2";
  var pairs = [];
  var byNorm = Object.create(null);
  var subs = [];
  var es = null;
  var readyResolve, ready = new Promise(function (r) { readyResolve = r; });

  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\s\u00a0]+/g, "")
      .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ]/g, "")
      .replace(/[ㅋㅎ]{2,}/g, "ㅋㅋ");
  }

  function index() {
    byNorm = Object.create(null);
    for (var i = 0; i < pairs.length; i++) {
      var e = pairs[i];
      var k = e.qn || normalize(e.q);
      e.qn = k;
      (byNorm[k] || (byNorm[k] = [])).push(e);
    }
  }

  function snapshot() {
    return { pairs: pairs, byNorm: byNorm, count: pairs.length };
  }

  function emit() {
    var s = snapshot();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](s); } catch (e) { /* noop */ }
    }
  }

  function fromFirebase(obj) {
    var out = [];
    if (!obj) return out;
    for (var id in obj) {
      var v = obj[id];
      if (!v || typeof v !== "object" || !v.q || !v.a) continue;
      out.push({
        id: id,
        q: String(v.q).slice(0, 200),
        qn: v.qn ? String(v.qn) : normalize(v.q),
        a: String(v.a).slice(0, 400),
        m: v.m === "clean" || v.m === "dorat" ? v.m : "normal",
        t: Number(v.t || 0),
        up: Number((v.v && v.v.up) || 0),
        down: Number((v.v && v.v.down) || 0),
        r: Number(v.r || 0)
      });
    }
    out.sort(function (a, b) { return b.t - a.t; });
    return out;
  }

  function cacheSave() {
    try {
      localStorage.setItem(LS, JSON.stringify(pairs.slice(0, 3000)));
    } catch (e) { /* 용량 초과 등 무시 */ }
  }

  function cacheLoad() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return false;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr) || !arr.length) return false;
      pairs = arr;
      index();
      return true;
    } catch (e) { return false; }
  }

  function fetchAll() {
    return fetch(DB + "/pairs.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (obj) {
        var list = fromFirebase(obj);
        if (list.length) {
          pairs = list;
          index();
          cacheSave();
          emit();
        }
        return list.length;
      })
      .catch(function () { return -1; });
  }

  function startStream() {
    if (typeof EventSource === "undefined") return;
    try {
      es = new EventSource(DB + "/pairs.json");
      es.addEventListener("put", function (ev) {
        try { handleStream(JSON.parse(ev.data)); } catch (e) { /* noop */ }
      });
      es.addEventListener("patch", function (ev) {
        try { handleStream(JSON.parse(ev.data)); } catch (e) { /* noop */ }
      });
      es.onerror = function () { /* 자동 재접속, 폴링이 백업 */ };
    } catch (e) { /* noop */ }
  }

  /* 스트림 이벤트: {path:"/", data:{...}} 전체 또는 {path:"/-abc", data:{...}} 단건 */
  function handleStream(msg) {
    if (!msg || msg.data === undefined) return;
    if (msg.path === "/" && msg.data && typeof msg.data === "object" && !msg.data.q) {
      pairs = fromFirebase(msg.data);
      index(); cacheSave(); emit();
      return;
    }
    var id = String(msg.path || "").replace(/^\//, "");
    if (!id) return;
    var idx = -1;
    for (var i = 0; i < pairs.length; i++) { if (pairs[i].id === id) { idx = i; break; } }
    if (msg.data === null) {
      if (idx >= 0) pairs.splice(idx, 1);
    } else {
      var v = msg.data;
      if (!v.q || !v.a) return;
      var e = {
        id: id, q: String(v.q).slice(0, 200), qn: v.qn ? String(v.qn) : normalize(v.q),
        a: String(v.a).slice(0, 400),
        m: v.m === "clean" || v.m === "dorat" ? v.m : "normal",
        t: Number(v.t || 0), up: Number((v.v && v.v.up) || 0),
        down: Number((v.v && v.v.down) || 0), r: Number(v.r || 0)
      };
      if (idx >= 0) pairs[idx] = e; else pairs.unshift(e);
    }
    index(); cacheSave(); emit();
  }

  function init() {
    cacheLoad();
    emit();
    fetchAll().then(function () { readyResolve(snapshot()); });
    startStream();
    setInterval(fetchAll, cfg.pollMs || 45000);
    return ready;
  }

  /* 새 말 배우기 — 공용 DB에 저장(모든 사용자에게 즉시 공유) */
  function learn(q, a, mode) {
    q = String(q || "").trim().slice(0, 200);
    a = String(a || "").trim().slice(0, 400);
    if (!q || !a) return Promise.resolve(null);
    var qn = normalize(q);
    /* 같은 모드에 완전히 같은 (말, 대답)이 이미 있으면 중복 저장하지 않는다 */
    var ex = (byNorm[qn] || []);
    for (var i = 0; i < ex.length; i++) {
      if (ex[i].m === mode && normalize(ex[i].a) === normalize(a)) return Promise.resolve(null);
    }
    var body = { q: q, qn: qn, a: a, m: mode, t: Date.now() };
    return fetch(DB + "/pairs.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.name) {
        var e = {
          id: res.name, q: body.q, qn: qn, a: body.a, m: mode, t: body.t,
          up: 0, down: 0, r: 0
        };
        pairs.unshift(e);
        index(); cacheSave(); emit();
        return e;
      }
      return null;
    }).catch(function () { return null; });
  }

  function vote(id, dir) {
    var ent = null;
    for (var i = 0; i < pairs.length; i++) { if (pairs[i].id === id) { ent = pairs[i]; break; } }
    if (!ent) return Promise.resolve(null);
    var value = (dir === "up" ? ent.up : ent.down) + 1;
    return fetch(DB + "/pairs/" + id + ".json", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v: dir === "up" ? { up: value } : { down: value } })
    }).then(function () {
      if (dir === "up") ent.up = value; else ent.down = value;
      emit();
      return value;
    }).catch(function () { return null; });
  }

  /* 신고: 3회 이상이면 앱에서 숨긴다 */
  function report(id) {
    var ent = null;
    for (var i = 0; i < pairs.length; i++) { if (pairs[i].id === id) { ent = pairs[i]; break; } }
    if (!ent) return Promise.resolve(null);
    var value = ent.r + 1;
    return fetch(DB + "/pairs/" + id + ".json", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r: value })
    }).then(function () { ent.r = value; emit(); return value; })
      .catch(function () { return null; });
  }

  function subscribe(cb) { subs.push(cb); return function () { subs = subs.filter(function (f) { return f !== cb; }); }; }

  return {
    init: init,
    subscribe: subscribe,
    learn: learn,
    vote: vote,
    report: report,
    snapshot: snapshot,
    normalize: normalize,
    dbUrl: DB
  };
})();

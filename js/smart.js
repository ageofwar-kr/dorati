/* 똑똑이 모드 — Gemini 중계 서버(Google Apps Script) 호출
   · API 키는 서버에만 있고, 여기서는 공개 URL만 쓴다.
   · 실패하면 app.js가 내장 엔진으로 조용히 폴백한다. */
window.Smart = (function () {
  "use strict";
  var cfg = window.DORATI_CONFIG || {};
  var proxy = String(cfg.smartProxy || "").trim();
  var fallbackModel = String(cfg.smartDefaultModel || "gemini-3.5-flash-lite");
  var lastModel = "";

  function enabled() { return !!proxy; }

  function modelName() { return lastModel || fallbackModel; }

  /* 사람이 읽기 좋은 표기: gemini-3.5-flash-lite -> Gemini 3.5 Flash Lite */
  function pretty(name) {
    var m = String(name || "").replace(/^gemini-/i, "").split("-");
    var out = ["Gemini"];
    m.forEach(function (p) {
      if (!p) return;
      if (/^\d/.test(p)) out.push(p);
      else out.push(p.charAt(0).toUpperCase() + p.slice(1));
    });
    return out.join(" ");
  }

  function post(body, timeoutMs) {
    if (!proxy) return Promise.reject(new Error("no_proxy"));
    var ctrl = null, timer = null;
    try { ctrl = new AbortController(); } catch (e) { /* noop */ }
    var opt = {
      method: "POST",
      /* text/plain 이면 CORS preflight 없이 Apps Script로 바로 간다 */
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      cache: "no-store"
    };
    if (ctrl) {
      opt.signal = ctrl.signal;
      timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 25000);
    }
    return fetch(proxy, opt)
      .then(function (r) {
        if (!r.ok) throw new Error("http_" + r.status);
        return r.text();
      })
      .then(function (t) {
        if (timer) clearTimeout(timer);
        var j;
        try { j = JSON.parse(t); } catch (e) { throw new Error("bad_json"); }
        return j;
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        throw e;
      });
  }

  function setModel(m) {
    if (!m) return;
    lastModel = String(m);
    var el = document.getElementById("mode-model");
    if (el) el.textContent = pretty(lastModel);
  }

  /* 문맥은 최근 4턴(8메시지)·200자까지만 보낸다 — 페이로드와 모델 처리 시간을 줄인다. */
  function trimHistory(history) {
    var src = history || [];
    var out = [];
    for (var i = 0; i < src.length; i++) {
      var m = src[i] || {};
      var t = String(m.t || "").slice(0, 200);
      if (!t) continue;
      out.push({ r: m.r === "b" ? "b" : "u", t: t });
    }
    return out.slice(-(Number(cfg.smartContextMsgs) || 8));
  }

  /* 사전 예열 — 콜드 스타트를 사용자가 입력하는 시간에 미리 끝낸다.
     ping 은 모델을 호출하지 않고 Apps Script 인스턴스만 깨우므로 무료·빠르다. */
  var warmAt = 0, warmPending = null;
  function warm(force) {
    if (!proxy) return Promise.resolve(false);
    var ttl = Number(cfg.smartWarmTtl || 120000);
    if (!force && Date.now() - warmAt < ttl) return Promise.resolve(false);
    if (warmPending) return warmPending;
    warmAt = Date.now();
    warmPending = ping().then(function () {
      warmPending = null;
      warmAt = Date.now();
      return true;
    }).catch(function () {
      warmPending = null;
      warmAt = 0;
      return false;
    });
    return warmPending;
  }

  function ask(text, nick, history) {
    /* 모델을 명시해서 보낸다 — 서버가 느린 gemini-3.8-flash를 먼저 시도하며 15~20초를 버리지 않게. */
    return post({ action: "chat", text: text, nick: nick || "", history: trimHistory(history), model: modelName() }, 25000)
      .then(function (j) {
        if (!j || !j.ok || !j.reply) throw new Error((j && j.error) || "empty");
        setModel(j.model);
        return j;
      });
  }

  /* 관리자 화면에서 쓰는 '가르치기' */
  function teach(target, instruction) {
    return post({ action: "teach", target: target || "auto", instruction: instruction || "" }, 45000)
      .then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || "empty");
        setModel(j.model);
        return j;
      });
  }

  function ping() {
    if (!proxy) return Promise.reject(new Error("no_proxy"));
    return fetch(proxy, { cache: "no-store" }).then(function (r) { return r.json(); });
  }

  return {
    enabled: enabled,
    ask: ask,
    teach: teach,
    ping: ping,
    warm: warm,
    pretty: pretty,
    model: modelName,
    setModel: setModel,
    url: proxy
  };
})();

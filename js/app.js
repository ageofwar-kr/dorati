/* 도랏이 UI — 심플이즈베스트: 채팅 + 3모드 + 자동학습 */
(function () {
  "use strict";
  var cfg = window.DORATI_CONFIG;
  var chat = document.getElementById("chat");
  var form = document.getElementById("composer");
  var input = document.getElementById("input");
  var toast = document.getElementById("toast");
  var countEl = document.getElementById("learned-count");
  var mascotEl = document.getElementById("mascot");
  var state = {
    mode: "normal",
    lastBot: null,
    pendingAsk: null,
    busy: false,
    snap: { pairs: [], byNorm: {}, count: 0 }
  };

  /* ── 도랏이 마스코트 ─────────────────────────────────── */
  function mascotSVG(mode) {
    var g = {
      clean: { body1: "#8fe3c4", body2: "#3e9e7a", line: "#1f6b51" },
      normal: { body1: "#ffd08a", body2: "#ff8a3d", line: "#b2560f" },
      dorat: { body1: "#c9a3ff", body2: "#7b3fe4", line: "#4b1f9c" }
    }[mode] || { body1: "#ffd08a", body2: "#ff8a3d", line: "#b2560f" };

    var face = "";
    if (mode === "clean") {
      face =
        '<ellipse cx="36" cy="55" rx="7.2" ry="8.4" fill="#fff"/><ellipse cx="64" cy="55" rx="7.2" ry="8.4" fill="#fff"/>' +
        '<circle cx="37" cy="56" r="3.6" fill="' + g.line + '"/><circle cx="63" cy="56" r="3.6" fill="' + g.line + '"/>' +
        '<circle cx="38.2" cy="54.4" r="1.3" fill="#fff"/><circle cx="64.2" cy="54.4" r="1.3" fill="#fff"/>' +
        '<path d="M44 68q6 4.6 12 0" stroke="' + g.line + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="27" cy="64" rx="5" ry="3.2" fill="#ff9aa8" opacity=".55"/>' +
        '<ellipse cx="73" cy="64" rx="5" ry="3.2" fill="#ff9aa8" opacity=".55"/>' +
        '<ellipse cx="50" cy="17" rx="13" ry="4" fill="none" stroke="#ffd76b" stroke-width="3.4"/>';
    } else if (mode === "normal") {
      face =
        '<ellipse cx="37" cy="56" rx="6.4" ry="7.6" fill="#fff"/><ellipse cx="63" cy="56" rx="6.4" ry="7.6" fill="#fff"/>' +
        '<circle cx="38" cy="57" r="3.2" fill="' + g.line + '"/><circle cx="64" cy="57" r="3.2" fill="' + g.line + '"/>' +
        '<path d="M28 44q7-4 13-1" stroke="' + g.line + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M59 43q7-3 13 1" stroke="' + g.line + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path d="M42 67q8 6 16-1" stroke="' + g.line + '" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
        '<ellipse cx="26" cy="64" rx="5" ry="3" fill="#ff9aa8" opacity=".45"/>' +
        '<ellipse cx="74" cy="64" rx="5" ry="3" fill="#ff9aa8" opacity=".45"/>';
    } else {
      face =
        '<path d="M30 52c4-6 12-6 14 0 2 6-6 10-10 6-4 4-6 0-4-6z" fill="#fff"/>' +
        '<path d="M56 52c4-6 12-6 14 0 2 6-6 10-10 6-4 4-6 0-4-6z" fill="#fff"/>' +
        '<circle cx="37" cy="55" r="3" fill="' + g.line + '"/><circle cx="63" cy="55" r="3" fill="' + g.line + '"/>' +
        '<path d="M40 66q10 12 20 0z" fill="#7a2b2b"/>' +
        '<path d="M50 70q6 2 9-2q-3 8-9 2z" fill="#ff8fa3"/>' +
        '<path d="M18 26l6-10 4 8 7-5-3 10z" fill="#ff5d3d"/>' +
        '<path d="M82 26l-6-10-4 8-7-5 3 10z" fill="#ff5d3d"/>';
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="dg' + mode + '" cx="35%" cy="28%" r="80%">' +
      '<stop offset="0" stop-color="' + g.body1 + '"/><stop offset="1" stop-color="' + g.body2 + '"/></radialGradient></defs>' +
      '<ellipse cx="50" cy="88" rx="26" ry="4" fill="#000" opacity=".08"/>' +
      '<path d="M50 20c19 0 33 14 33 32 0 16-13 26-33 26S17 68 17 52c0-18 14-32 33-32z" fill="url(#dg' + mode + ')" stroke="' + g.line + '" stroke-width="2.2"/>' +
      '<path d="M22 40q6-12 18-15" stroke="#fff" stroke-width="3" fill="none" opacity=".5" stroke-linecap="round"/>' +
      face +
      '</svg>';
  }

  function renderMascot() {
    mascotEl.innerHTML = mascotSVG(state.mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", { clean: "#3e9e7a", normal: "#ff8a3d", dorat: "#7b3fe4" }[state.mode]);
  }

  /* ── 말풍선 ───────────────────────────────────────────── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function scrollDown() {
    requestAnimationFrame(function () { chat.scrollTop = chat.scrollHeight; });
  }

  function addUser(text) {
    var row = el("div", "row user");
    row.appendChild(el("div", "bubble", escapeHtml(text)));
    chat.appendChild(row);
    scrollDown();
  }

  function addBot(html, opts) {
    opts = opts || {};
    var row = el("div", "row bot");
    var av = el("div", "avatar");
    av.innerHTML = mascotSVG(state.mode);
    var wrap = el("div");
    wrap.style.maxWidth = "100%";
    var b = el("div", "bubble" + (opts.card ? " card" : ""), html);
    wrap.appendChild(b);
    if (opts.entry) {
      var fb = el("div", "fb");
      fb.innerHTML =
        '<button type="button" data-vote="up" aria-label="좋아요">👍</button>' +
        '<span class="cnt">' + (opts.entry.up || 0) + "</span>" +
        '<button type="button" data-vote="down" aria-label="별로예요">👎</button>';
      fb.addEventListener("click", function (ev) {
        var btn = ev.target.closest("[data-vote]");
        if (!btn) return;
        var dir = btn.dataset.vote;
        btn.dataset.on = "1";
        window.Store.vote(opts.entry.id, dir).then(function () {
          if (dir === "down") window.Store.report(opts.entry.id);
          var cnt = fb.querySelector(".cnt");
          if (cnt) cnt.textContent = (opts.entry.up || 0);
        });
      });
      wrap.appendChild(fb);
    }
    row.appendChild(av);
    row.appendChild(wrap);
    chat.appendChild(row);
    scrollDown();
    return row;
  }

  function addSystem(text) {
    chat.appendChild(el("div", "sys", escapeHtml(text)));
    scrollDown();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function typingRow() {
    var row = el("div", "row bot");
    var av = el("div", "avatar");
    av.innerHTML = mascotSVG(state.mode);
    var b = el("div", "bubble", '<span class="typing"><i></i><i></i><i></i></span>');
    row.appendChild(av); row.appendChild(b);
    chat.appendChild(row);
    scrollDown();
    return row;
  }

  /* ── 토스트 ───────────────────────────────────────────── */
  var toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 1900);
  }

  function updateCount(n) {
    countEl.textContent = n.toLocaleString("ko-KR");
  }

  /* ── 모드 ─────────────────────────────────────────────── */
  function setMode(mode, silent) {
    if (["clean", "normal", "dorat"].indexOf(mode) < 0) return;
    state.mode = mode;
    document.body.dataset.mode = mode;
    document.querySelectorAll("[data-mode-btn]").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.modeBtn === mode));
    });
    renderMascot();
    try { localStorage.setItem("dorati.mode", mode); } catch (e) { /* noop */ }
    if (!silent) addSystem(window.DORATI_KB.modeNotice[mode]);
  }

  document.querySelectorAll("[data-mode-btn]").forEach(function (b) {
    b.addEventListener("click", function () { setMode(b.dataset.modeBtn); });
  });

  /* ── 사전 카드 ────────────────────────────────────────── */
  function cardHTML(card, intro) {
    var senses = (card.senses || []).slice(0, 3).map(function (s) { return "<li>" + escapeHtml(s) + "</li>"; }).join("");
    var head = '<div class="card-head"><span class="w">' + escapeHtml(card.word) + "</span>" +
      (card.pos ? '<span class="pos">' + escapeHtml(card.pos) + "</span>" : "") + "</div>";
    var body = '<div class="card-body"><ol>' + senses + "</ol>" +
      '<div class="card-src">출처: ' + escapeHtml(card.source || "국립국어원 표준국어대사전") +
      (card.link ? ' · <a href="' + escapeHtml(card.link) + '" target="_blank" rel="noopener">사전에서 보기</a>' : "") +
      "</div></div>";
    return '<div style="font-size:14px;margin-bottom:6px">' + escapeHtml(intro) + "</div>" + head + body;
  }

  /* ── 자동학습 ─────────────────────────────────────────── */
  var lastLearnAt = 0;

  function shouldLearn(userText) {
    var n = window.Engine.normalize(userText);
    if (n.length < 2) return false;
    if (/^(ㅋ|ㅎ|ㅇㅇ|네|넵|응|어|아니|몰라|그래|굿|오케이|ok)/.test(n) && n.length < 4) return false;
    if (!window.Safety.canLearn(userText)) return false;
    if (Date.now() - lastLearnAt < 400) return false;
    return true;
  }

  function autoLearn(q, a) {
    if (!shouldLearn(a) || !q) return Promise.resolve(null);
    var qn = window.Engine.normalize(q);
    if (!qn || qn.length < 2) return Promise.resolve(null);
    return window.Store.learn(q, window.Safety.censor(a, "dorat"), state.mode).then(function (e) {
      if (e) {
        lastLearnAt = Date.now();
        showToast(window.DORATI_KB.learnToasts[Math.floor(Math.random() * window.DORATI_KB.learnToasts.length)]);
      }
      return e;
    });
  }

  /* ── 메시지 전송 ──────────────────────────────────────── */
  function send(text) {
    text = String(text || "").trim();
    if (!text || state.busy) return;
    input.value = "";
    addUser(text);

    var prevBot = state.lastBot;
    var pending = state.pendingAsk;

    state.busy = true;
    var trow = typingRow();

    Promise.resolve(window.Engine.answer(text, state.mode, state.snap)).then(function (res) {
      setTimeout(function () {
        trow.remove();
        handleResult(res);
        state.busy = false;

        /* 자동학습: 도랏이 말 → 사용자 답 / 모르는 말 → 가르친 답 */
        if (pending) {
          autoLearn(pending, text);
        } else if (prevBot && prevBot.learnable) {
          autoLearn(prevBot.text, text);
        }
      }, 350 + Math.random() * 350);
    }).catch(function () {
      trow.remove();
      state.busy = false;
      addBot("앗, 뭔가 꼬였어. 다시 말 걸어줘!");
    });
  }

  function handleResult(res) {
    if (!res) return;
    if (res.type === "mode") {
      setMode(res.mode);
      state.lastBot = { text: window.DORATI_KB.modeNotice[res.mode], learnable: false };
      return;
    }
    if (res.type === "card") {
      addBot(escapeHtml(res.intro) + cardHTML(res.card, ""), { card: false });
      state.lastBot = { text: res.intro, learnable: false };
      state.pendingAsk = null;
      return;
    }
    if (res.type === "empty") return;

    addBot(escapeHtml(res.text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"), { entry: res.entry });
    state.lastBot = {
      text: res.text,
      learnable: res.kind === "safety" ? false : true
    };
    if (res.askTeachFor) {
      state.pendingAsk = res.askTeachFor;
    } else {
      state.pendingAsk = null;
    }
  }

  /* ── 초기화 ───────────────────────────────────────────── */
  function kakao() {
    var ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf("kakaotalk") < 0) return;
    var box = document.getElementById("kakao-banner");
    var btn = document.getElementById("kakao-open");
    box.hidden = false;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    });
  }

  function boot() {
    var saved = null;
    try { saved = localStorage.getItem("dorati.mode"); } catch (e) { /* noop */ }
    setMode(saved || "normal", true);
    kakao();

    window.Store.init();
    window.Store.subscribe(function (snap) {
      state.snap = snap;
      updateCount(snap.count);
    });
    state.snap = window.Store.snapshot();
    updateCount(state.snap.count);

    var intro = window.DORATI_KB.intro[state.mode];
    setTimeout(function () {
      addBot(escapeHtml(intro[Math.floor(Math.random() * intro.length)]));
      state.lastBot = { text: intro, learnable: false };
    }, 300);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });

  boot();
})();

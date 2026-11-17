/* 도랏이 UI v1.1 — 채팅 + 3모드 + 자동학습 + 닉네임 + 대화저장 */
(function () {
  "use strict";
  var cfg = window.DORATI_CONFIG;
  var chat = document.getElementById("chat");
  var form = document.getElementById("composer");
  var input = document.getElementById("input");
  var toast = document.getElementById("toast");
  var mascotEl = document.getElementById("mascot");
  var nickBadge = document.getElementById("nick-badge");
  var gate = document.getElementById("gate");
  var gateForm = document.getElementById("gate-form");
  var gateInput = document.getElementById("gate-input");
  var gateStart = document.getElementById("gate-start");
  var gateHint = document.getElementById("gate-hint");
  var menu = document.getElementById("menu");
  var menuBtn = document.getElementById("menu-btn");

  var NICK_KEY = "dorati.nick.v1";
  var HIST_KEY = "dorati.hist.v1";
  var state = {
    mode: "normal",
    nick: "",
    lastBot: null,
    pendingAsk: null,
    busy: false,
    snap: { pairs: [], byNorm: {}, count: 0 },
    history: []
  };

  /* ── 저장/불러오기 ─────────────────────────────────────── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } }

  function saveHistory() {
    try {
      lsSet(HIST_KEY, JSON.stringify(state.history.slice(-300)));
    } catch (e) { /* noop */ }
  }
  function loadHistory() {
    try {
      var raw = lsGet(HIST_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  /* ── 마스코트 ─────────────────────────────────────────── */
  /* 아주 단순한 납작 얼굴: 동그라미 하나 + 눈·입만. 그라데이션/광택/그림자/불꽃 없음. */
  function mascotSVG(mode) {
    var g = {
      clean: { body: "#46c39b", ink: "#12523f" },
      normal: { body: "#ff8a3d", ink: "#6d2f08" },
      dorat: { body: "#7b3fe4", ink: "#2a0f63" },
      smart: { body: "#3a6df0", ink: "#0c2457" }
    }[mode] || { body: "#ff8a3d", ink: "#6d2f08" };

    var eyes, mouth;
    if (mode === "smart") {
      /* 똑똑이: 반짝이는 눈 + 자신만만한 미소 */
      eyes =
        '<circle cx="38" cy="47" r="5.8" fill="' + g.ink + '"/>' +
        '<circle cx="62" cy="47" r="5.8" fill="' + g.ink + '"/>' +
        '<circle cx="39.8" cy="45.2" r="1.9" fill="#ffffff"/>' +
        '<circle cx="63.8" cy="45.2" r="1.9" fill="#ffffff"/>';
      mouth = '<path d="M41 61q9 8 18 0" stroke="' + g.ink + '" stroke-width="5.2" fill="none" stroke-linecap="round"/>';
    } else if (mode === "dorat") {
      /* 도랏: 게슴츠레한 눈 + 일자 입 */
      eyes =
        '<path d="M32 47h12" stroke="' + g.ink + '" stroke-width="6" stroke-linecap="round"/>' +
        '<path d="M56 47h12" stroke="' + g.ink + '" stroke-width="6" stroke-linecap="round"/>';
      mouth = '<path d="M42 63h16" stroke="' + g.ink + '" stroke-width="6" stroke-linecap="round"/>';
    } else {
      eyes =
        '<circle cx="38" cy="47" r="5.6" fill="' + g.ink + '"/>' +
        '<circle cx="62" cy="47" r="5.6" fill="' + g.ink + '"/>';
      mouth = mode === "clean"
        ? '<path d="M42 61q8 7 16 0" stroke="' + g.ink + '" stroke-width="5.4" fill="none" stroke-linecap="round"/>'
        : '<path d="M42 62q8 5 16 0" stroke="' + g.ink + '" stroke-width="5.4" fill="none" stroke-linecap="round"/>';
    }

    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="37" fill="' + g.body + '"/>' +
      eyes + mouth + '</svg>';
  }

  function renderMascot() {
    mascotEl.innerHTML = mascotSVG(state.mode);
    var gm = document.getElementById("gate-mascot");
    if (gm) gm.innerHTML = mascotSVG(state.mode);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", { clean: "#3e9e7a", normal: "#ff8a3d", dorat: "#7b3fe4", smart: "#3a6df0" }[state.mode] || "#ff8a3d");
  }

  /* 똑똑이 모드일 때만 모드 버튼 위에 실제 제미나이 모델명을 아주 작게 띄운다 */
  function updateModelLabel() {
    var el = document.getElementById("mode-model");
    if (!el) return;
    var on = state.mode === "smart";
    el.hidden = !on;
    if (!on) return;
    var name = (window.Smart && window.Smart.model()) || "gemini-3.8-flash";
    el.textContent = window.Smart && window.Smart.pretty ? window.Smart.pretty(name) : name;
  }

  /* ── 말풍선 ───────────────────────────────────────────── */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function scrollDown() { requestAnimationFrame(function () { chat.scrollTop = chat.scrollHeight; }); }

  function addUser(text, record) {
    var row = el("div", "row user");
    row.appendChild(el("div", "bubble", escapeHtml(text)));
    chat.appendChild(row);
    scrollDown();
    if (record !== false) { state.history.push({ r: "u", t: text, ts: Date.now() }); saveHistory(); }
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
    if (opts.record !== false) {
      state.history.push({ r: "b", h: html, ts: Date.now() });
      saveHistory();
    }
    return row;
  }

  function addSystem(text, record) {
    chat.appendChild(el("div", "sys", escapeHtml(text)));
    scrollDown();
    if (record !== false) { state.history.push({ r: "s", t: text, ts: Date.now() }); saveHistory(); }
  }

  function typingRow(label) {
    var row = el("div", "row bot");
    var av = el("div", "avatar");
    av.innerHTML = mascotSVG(state.mode);
    row.appendChild(av);
    var inner = '<span class="typing-wrap">' +
      (label ? '<span class="typing-label">' + escapeHtml(label) + '</span>' : '') +
      '<span class="typing"><i></i><i></i><i></i></span></span>';
    row.appendChild(el("div", "bubble", inner));
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


  /* ── 닉네임 ───────────────────────────────────────────── */
  function setNick(nick) {
    state.nick = nick || "";
    lsSet(NICK_KEY, state.nick);
    if (state.nick) {
      nickBadge.hidden = false;
      nickBadge.textContent = " · " + state.nick;
    } else {
      nickBadge.hidden = true;
    }
  }

  function openGate() {
    gate.hidden = false;
    document.body.classList.add("gated");
    gateInput.value = "";
    gateStart.disabled = true;
    gateHint.textContent = "";
    setTimeout(function () { gateInput.focus(); }, 120);
  }
  function closeGate() {
    gate.hidden = true;
    document.body.classList.remove("gated");
  }

  gateInput.addEventListener("input", function () {
    var v = gateInput.value.trim();
    gateStart.disabled = v.length < 2;
    gateHint.textContent = v.length && v.length < 2 ? "2자 이상 입력해줘!" : "";
  });

  gateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = gateInput.value.trim().slice(0, 12);
    if (v.length < 2) { gateHint.textContent = "2자 이상 입력해줘!"; return; }
    setNick(v);
    closeGate();
    greet();
    input.focus();
  });

  /* ── 모드 ─────────────────────────────────────────────── */
  function setMode(mode, silent) {
    if (["clean", "normal", "dorat", "smart"].indexOf(mode) < 0) return;
    state.mode = mode;
    document.body.dataset.mode = mode;
    document.querySelectorAll("[data-mode-btn]").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.modeBtn === mode));
    });
    renderMascot();
    updateModelLabel();
    lsSet("dorati.mode", mode);
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

  /* ── 닉네임으로 부르기 ────────────────────────────────── */
  /* 닉네임 뒤에는 어떤 글자도 붙이지 않는다(아/야/님 금지). 이름은 입력한 그대로, 뒤에는 쉼표만. */
  function callName(nick, text) {
    return nick + ", " + text;
  }

  function personalize(text) {
    if (!state.nick || Math.random() > 0.22) return text;
    if (/[?？]$/.test(text)) return text;
    return callName(state.nick, text);
  }

  /* ── 전송 ─────────────────────────────────────────────── */
  function send(text) {
    text = String(text || "").trim();
    if (!state.nick) { openGate(); return; }
    if (!text || state.busy) return;
    input.value = "";
    addUser(text);

    var prevBot = state.lastBot;
    var pending = state.pendingAsk;

    if (state.mode === "smart") { sendSmart(text, prevBot, pending); return; }

    state.busy = true;
    var trow = typingRow();

    Promise.resolve(window.Engine.answer(text, state.mode, state.snap)).then(function (res) {
      setTimeout(function () {
        trow.remove();
        handleResult(res);
        state.busy = false;
        if (pending) autoLearn(pending, text);
        else if (prevBot && prevBot.learnable) autoLearn(prevBot.text, text);
      }, 350 + Math.random() * 350);
    }).catch(function () {
      trow.remove();
      state.busy = false;
      addBot("앗, 뭔가 꼬였어. 다시 말 걸어줘!");
    });
  }

  /* ── 똑똑이 모드(제미나이) ─────────────────────────────── */
  /* 제미나이 답변용 가벼운 마크다운: 코드블록·인라인코드·굵게·줄바꿈만 */
  function mdRender(text) {
    var codes = [];
    var s = String(text || "");
    s = s.replace(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g, function (_, code) {
      codes.push(code.replace(/^\n+|\n+$/g, ""));
      return "\u0000C" + (codes.length - 1) + "\u0000";
    });
    s = escapeHtml(s);
    s = s.replace(/`([^`\n]+)`/g, '<code class="inline">$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/^\s*[-•*]\s+/gm, "· ");
    s = s.replace(/\n{3,}/g, "\n\n").replace(/\n/g, "<br>");
    s = s.replace(/\u0000C(\d+)\u0000/g, function (_, i) {
      return '<pre class="code">' + escapeHtml(codes[Number(i)] || "") + "</pre>";
    });
    return s;
  }

  function smartHistory() {
    /* 방금 넣은 사용자 말은 빼고, 직전 대화 최대 12개만 문맥으로 보낸다 */
    var out = [];
    var src = state.history.slice(-13, -1);
    for (var i = 0; i < src.length; i++) {
      var m = src[i];
      var t = m.r === "u" ? m.t : String(m.h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!t) continue;
      out.push({ r: m.r === "u" ? "u" : "b", t: t.slice(0, 300) });
    }
    return out.slice(-12);
  }

  function sendSmart(text, prevBot, pending) {
    state.busy = true;

    /* 1) 로컬 하드 필터가 언제나 최우선 — 자살·자해 / 범죄 / 개인정보는 API로 보내지 않는다 */
    var scan = window.Safety.scan(text);
    if (!scan.safe) {
      var notice = window.Safety.notice(scan.kind);
      addBot(escapeHtml(notice).replace(/\n/g, "<br>"));
      state.lastBot = { text: notice, learnable: false };
      state.pendingAsk = null;
      state.busy = false;
      return;
    }

    if (!window.Smart || !window.Smart.enabled()) {
      /* 중계 주소가 설정되지 않은 경우 */
      fallbackToEngine(text, prevBot, pending, "제미나이 연결이 아직 준비 중이라 내장 답변으로 답했어요.");
      return;
    }

    var trow = typingRow("도랏이가 생각 중");

    window.Smart.ask(text, state.nick, smartHistory()).then(function (j) {
      trow.remove();
      addBot(mdRender(j.reply));
      state.lastBot = { text: j.reply, learnable: false };
      state.pendingAsk = null;
      updateModelLabel();
      state.busy = false;
    }).catch(function () {
      trow.remove();
      fallbackToEngine(text, prevBot, pending, "제미나이 응답이 잠깐 막혀서 내장 답변으로 답했어요.");
    });
  }

  function fallbackToEngine(text, prevBot, pending, note) {
    Promise.resolve(window.Engine.answer(text, "normal", state.snap)).then(function (res) {
      handleResult(res);
      addSystem(note);
      state.busy = false;
      if (pending) autoLearn(pending, text);
      else if (prevBot && prevBot.learnable) autoLearn(prevBot.text, text);
    }).catch(function () {
      addBot("앗, 뭔가 꼬였어. 다시 말 걸어줘!");
      state.busy = false;
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
      addBot(escapeHtml(res.intro) + cardHTML(res.card, ""));
      state.lastBot = { text: res.intro || "사전", learnable: false };
      state.pendingAsk = null;
      return;
    }
    if (res.type === "empty") return;

    var html = escapeHtml(personalize(res.text))
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
    addBot(html, { entry: res.entry });
    state.lastBot = { text: res.text, learnable: res.kind !== "safety" };
    state.pendingAsk = res.askTeachFor || null;
  }

  /* ── 첫 인사 / 복원 ───────────────────────────────────── */
  function greet() {
    var intro = window.DORATI_KB.intro[state.mode];
    var text = intro[Math.floor(Math.random() * intro.length)];
    var msg = state.nick && Math.random() > 0.5
      ? callName(state.nick, text)
      : text;
    setTimeout(function () {
      addBot(escapeHtml(msg));
      state.lastBot = { text: msg, learnable: false };
    }, 260);
  }

  function restore() {
    if (!state.history.length) return false;
    state.history.forEach(function (m) {
      if (m.r === "u") addUser(m.t, false);
      else if (m.r === "b") addBot(m.h, { record: false });
      else if (m.r === "s") addSystem(m.t, false);
    });
    return true;
  }

  /* ── 메뉴 ─────────────────────────────────────────────── */
  function toggleMenu(open) {
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
  }
  menuBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleMenu(menu.hidden);
  });
  document.addEventListener("click", function () { toggleMenu(false); });

  document.getElementById("menu-nick").addEventListener("click", function () {
    toggleMenu(false);
    openGate();
  });

  document.getElementById("menu-export").addEventListener("click", function () {
    toggleMenu(false);
    var lines = state.history.map(function (m) {
      var who = m.r === "u" ? (state.nick || "나") : (m.r === "b" ? "도랏이" : "안내");
      var body = m.t || String(m.h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      var d = new Date(m.ts || Date.now());
      var stamp = d.toLocaleString("ko-KR");
      return "[" + stamp + "] " + who + ": " + body;
    }).join("\n");
    var blob = new Blob([lines || "(대화 없음)"], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "도랏이-대화-" + new Date().toISOString().slice(0, 10) + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("📄 대화를 내보냈어요");
  });

  document.getElementById("menu-clear").addEventListener("click", function () {
    toggleMenu(false);
    if (!confirm("이 기기의 대화 기록을 지울까? (배운 말은 그대로 남아)")) return;
    state.history = [];
    saveHistory();
    chat.innerHTML = "";
    state.lastBot = null;
    state.pendingAsk = null;
    greet();
  });

  /* ── 카톡 ─────────────────────────────────────────────── */
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

  /* ── 시작 ─────────────────────────────────────────────── */
  function boot() {
    var savedMode = lsGet("dorati.mode");
    setMode(savedMode || "normal", true);
    var savedNick = lsGet(NICK_KEY) || "";
    if (savedNick) setNick(savedNick);
    kakao();

    window.Store.init();
    window.Store.subscribe(function (snap) { state.snap = snap; });
    state.snap = window.Store.snapshot();

    state.history = loadHistory();
    if (!restore()) {
      if (savedNick) greet();
    }
    if (!state.nick) openGate();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });

  boot();
})();

/* 도랏이 UI v1.9 — 채팅 + 4모드 + 자동학습 + 닉네임 + 대화저장 + 미친도랏 이스터에그 */
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
    flavor: "pure",       /* 도랏 모드 갈래: pure(순수도랏) / crazy(미친도랏) */
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
    updateThemeColor();
  }

  /* ── 화이트 / 다크 테마 ───────────────────────────────── */
  var THEME_KEY = "dorati.theme";

  function updateThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var dark = document.body.dataset.theme === "dark";
    var map = {
      clean: ["#3e9e7a", "#12181a"],
      normal: ["#ff8a3d", "#191512"],
      dorat: ["#7b3fe4", "#1a1425"],
      smart: ["#3a6df0", "#141a29"]
    };
    var pair = map[state.mode] || map.normal;
    meta.setAttribute("content", dark ? pair[1] : pair[0]);
  }

  function applyTheme(name) {
    var t = name === "dark" ? "dark" : "light";
    document.body.dataset.theme = t;
    var b = document.getElementById("theme-btn");
    if (b) {
      b.textContent = t === "dark" ? "다크" : "화이트";
      b.setAttribute("aria-pressed", String(t === "dark"));
    }
    lsSet(THEME_KEY, t);
    updateThemeColor();
  }

  function toggleTheme() {
    applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  }

  /* 똑똑이 모드일 때만 모드 버튼 위에 실제 제미나이 모델명을 아주 작게 띄운다 */
  function updateModelLabel() {
    var el = document.getElementById("mode-model");
    if (!el) return;
    var on = state.mode === "smart";
    el.hidden = !on;
    if (!on) return;
    var name = (window.Smart && window.Smart.model()) || "gemini-3.5-flash-lite";
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
    if (record !== false) row.classList.add("in");
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
    if (opts.record !== false) row.classList.add("in");
    chat.appendChild(row);
    scrollDown();
    if (opts.record !== false) {
      state.history.push({ r: "b", h: html, ts: Date.now() });
      saveHistory();
    }
    return row;
  }

  function addSystem(text, record) {
    var n = el("div", "sys", escapeHtml(text));
    if (record !== false) n.classList.add("in");
    chat.appendChild(n);
    scrollDown();
    if (record !== false) { state.history.push({ r: "s", t: text, ts: Date.now() }); saveHistory(); }
  }

  function typingRow(label) {
    var row = el("div", "row bot typing");
    var av = el("div", "avatar");
    av.innerHTML = mascotSVG(state.mode);
    row.appendChild(av);
    var inner = '<span class="typing-wrap">' +
      (label ? '<span class="typing-label">' + escapeHtml(label) + '</span>' : '') +
      '<span class="typing"><i></i><i></i><i></i></span></span>';
    row.appendChild(el("div", "bubble", inner));
    row.classList.add("in");
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
      nickBadge.textContent = " · " + withNim(state.nick);
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
  /* 실제 엔진에 넘기는 모드 — 도랏은 갈래에 따라 dorat_pure / dorat_crazy 로 갈린다 */
  function engineMode() {
    if (state.mode !== "dorat") return state.mode;
    return state.flavor === "crazy" ? "dorat_crazy" : "dorat_pure";
  }

  /* ── 이스터에그(v1.9) ─────────────────────────────────
     미친도랏은 화면에 버튼이 없다. 정해진 주문을넣으면 켜지고,
     켜져 있는 동안에만 헤더 아래에 끄기 필이 조용히 나타난다. */
  var eggOffBtn = document.getElementById("egg-off");
  /* 주문 두 가지: "미친도랏이커몬" / "미친도랏모드" — 띄어쓰기는 어디에 있어도 좋다 */
  var EGG_RES = [/미친\s*도랏이?\s*커\s*몬/, /미친\s*도랏\s*모드/];

  function isEggTrigger(text) {
    var raw = String(text || "");
    for (var i = 0; i < EGG_RES.length; i++) {
      if (EGG_RES[i].test(raw)) return true;
    }
    return /미친도랏이?커몬|미친도랏모드/.test(raw.replace(/\s+/g, ""));
  }

  function renderFlavor() {
    document.body.dataset.flavor = state.flavor;
    if (eggOffBtn) eggOffBtn.hidden = !(state.mode === "dorat" && state.flavor === "crazy");
  }

  function setFlavor(flavor, silent) {
    state.flavor = flavor === "crazy" ? "crazy" : "pure";
    renderFlavor();
    if (!silent && state.flavor === "crazy") addSystem(window.DORATI_KB.flavorNotice.crazy);
  }

  function addEggBanner() {
    var kb = window.DORATI_KB.eggBanner || {};
    var title = kb.title || "🔞 이스터에그 발동 · 미친도랏 입장 완료";
    chat.appendChild(el("div", "egg-banner",
      '<span class="t1">' + escapeHtml(title) + "</span>" +
      '<span class="t2">' + escapeHtml(kb.sub || "이 문은 아는 새끼만 여는 거다") + "</span>"));
    scrollDown();
    state.history.push({ r: "s", t: title, ts: Date.now() });
    saveHistory();
  }

  /* 주문 발동 — 모드·테마를 바로 미친도랏으로 바꾸고 배너+인사 한 번. 학습(공용 DB)에는 남기지 않는다. */
  function enterEgg() {
    setMode("dorat", true);
    state.flavor = "crazy";
    renderFlavor();
    addEggBanner();
    var pool = window.DORATI_KB.eggGreeting || [];
    var msg = pool.length ? pool[Math.floor(Math.random() * pool.length)] : "🔞 미친도랏 입장 완료.";
    var n = withNim(state.nick);
    addBot(escapeHtml(n ? n + ", " + msg : msg));
    state.lastBot = { text: msg, learnable: false };
    state.pendingAsk = null;
    showToast("🔞 이스터에그 발동");
  }

  /* 끄기 필 — 미친도랏이 켜져 있을 때만 보이고, 누르면 바로 도랏으로 돌아간다 */
  if (eggOffBtn) {
    eggOffBtn.addEventListener("click", function () {
      setFlavor("pure");
      addBot(escapeHtml("도랏으로 돌아왔다 ㅋㅋ 방금 그 문 열었던 건 못 본 걸로 하자."));
      state.lastBot = { text: "도랏", learnable: false };
      if (input) input.focus();
    });
  }

  function setMode(mode, silent) {
    if (["clean", "normal", "dorat", "smart"].indexOf(mode) < 0) return;
    state.mode = mode;
    document.body.dataset.mode = mode;
    document.querySelectorAll("[data-mode-btn]").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.modeBtn === mode));
    });
    renderMascot();
    updateModelLabel();
    renderFlavor();
    lsSet("dorati.mode", mode);
    /* 똑똑이 모드로 들어오는 순간 중계 서버를 미리 데운다(입력하는 동안 콜드 스타트 종료) */
    if (mode === "smart" && window.Smart && window.Smart.warm) window.Smart.warm();
    requestAnimationFrame(function () { placeGlider(); });
    if (!silent) {
      addSystem(window.DORATI_KB.modeNotice[mode]);
      if (mode === "dorat" && state.flavor === "crazy") addSystem(window.DORATI_KB.flavorNotice.crazy);
    }
  }

  document.querySelectorAll("[data-mode-btn]").forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.dataset.modeBtn;
      /* 도랏 버튼은 언제나 도랏으로 들어간다 — 미친도랏은 이스터에그로만 */
      if (m === "dorat" && state.flavor === "crazy") setFlavor("pure", true);
      setMode(m);
    });
  });

  /* ── 모드 선택 판(glider) ─────────────────────────────
     선택 표시를 버튼 배경이 아니라 '미끄러지는 판' 하나로 그린다(iOS 세그먼트 컨트로르). */
  var modesBar = document.querySelector(".modes");
  var modeGlider = document.querySelector(".mode-glider");

  function placeGlider(animate) {
    if (!modesBar || !modeGlider) return;
    var btn = modesBar.querySelector('[data-mode-btn][aria-checked="true"]');
    if (!btn) return;
    var br = modesBar.getBoundingClientRect();
    var r = btn.getBoundingClientRect();
    if (!r.width) return;
    if (animate === false) modeGlider.classList.add("no-anim");
    modeGlider.style.width = r.width + "px";
    modeGlider.style.transform = "translate3d(" + (r.left - br.left) + "px,0,0)";
    if (animate === false) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { modeGlider.classList.remove("no-anim"); });
      });
    }
  }

  window.addEventListener("resize", function () { placeGlider(true); });
  window.addEventListener("load", function () { placeGlider(false); });

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

  /* ── 상대가 던진 욕·시비 수집 (v1.9.4) ───────────────────
     도랏 모드에서 시비·욕설로 판정된 말을 공용 DB에 쌓아 두고,
     나중에 다른 사람이 시비 걸 때 그 말을 인용해 되받아치는 데 쓴다.
     하드 필터(자살·범죄·개인정보)를 통과한 2~160자만 저장된다. */
  var roastAt = 0;

  function collectRoast(text) {
    if (!window.Store || !window.Store.roast) return;
    var t = String(text || "").trim();
    if (t.length < 2 || t.length > 160) return;
    if (Date.now() - roastAt < 1500) return;
    roastAt = Date.now();
    window.Store.roast(t);
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
    /* 저장 모드는 세 갈래(건전/일반/도랏) 그대로 — 도랏 갈래는 DB에 'dorat'으로 쌓인다 */
    return window.Store.learn(q, window.Safety.censor(a, "dorat"), state.mode).then(function (e) {
      if (e) {
        lastLearnAt = Date.now();
        showToast(window.DORATI_KB.learnToasts[Math.floor(Math.random() * window.DORATI_KB.learnToasts.length)]);
      }
      return e;
    });
  }

  /* ── 닉네임으로 부르기 ────────────────────────────────── */
  /* 닉네임 뒤에는 항상 '님'을 붙인다(v1.7). 이미 '님'으로 끝나면 겹쳐 붙이지 않는다. 뒤에는 쉼표. */
  function withNim(nick) {
    var n = String(nick || "").trim();
    if (!n) return "";
    return /님$/.test(n) ? n : n + "님";
  }

  function callName(nick, text) {
    var n = withNim(nick);
    return n ? n + ", " + text : text;
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

    /* 이스터에그 주문: 엔진·학습을 거치지 않고 바로 발동(공용 DB에 새지 않게) */
    if (isEggTrigger(text)) {
      input.value = "";
      addUser(text);
      enterEgg();
      return;
    }

    input.value = "";
    addUser(text);

    var prevBot = state.lastBot;
    var pending = state.pendingAsk;

    if (state.mode === "smart") { sendSmart(text, prevBot, pending); return; }

    state.busy = true;
    var trow = typingRow();

    Promise.resolve(window.Engine.answer(text, engineMode(), state.snap)).then(function (res) {
      setTimeout(function () {
        trow.remove();
        handleResult(res);
        state.busy = false;
        if (res && res.kind === "attack") collectRoast(text);
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
    /* 방금 넣은 사용자 말은 빼고, 직전 대화 최근 4턴(8메시지)·200자만 문맥으로 보낸다.
       문맥이 길면 페이로드가 커지고 모델이 느려진다. */
    var out = [];
    var src = state.history.slice(-9, -1);
    for (var i = 0; i < src.length; i++) {
      var m = src[i];
      var t = m.r === "u" ? m.t : String(m.h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!t) continue;
      out.push({ r: m.r === "u" ? "u" : "b", t: t.slice(0, 200) });
    }
    return out.slice(-8);
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
    Promise.resolve(window.Engine.answer(text, engineMode(), state.snap)).then(function (res) {
      handleResult(res);
      if (res && res.kind === "attack") collectRoast(text);
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
      if (res.mode === "dorat" && res.flavor) setFlavor(res.flavor, true);
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
    state.lastBot = {
      text: res.text,
      learnable: res.kind !== "safety" && res.kind !== "pureBlock" && res.kind !== "eggHint" && res.kind !== "attack"
    };
    state.pendingAsk = res.askTeachFor || null;
  }

  /* ── 첫 인사 / 복원 ───────────────────────────────────── */
  function greet() {
    var byMode = (window.DORATI_KB && window.DORATI_KB.intro) || {};
    var intro = byMode[state.mode] || byMode.normal || [];
    if (!intro.length) return;
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

  document.getElementById("theme-btn").addEventListener("click", toggleTheme);
  document.getElementById("menu-theme").addEventListener("click", function () {
    toggleMenu(false);
    toggleTheme();
  });

  document.getElementById("menu-export").addEventListener("click", function () {
    toggleMenu(false);
    var lines = state.history.map(function (m) {
      var who = m.r === "u" ? (withNim(state.nick) || "나") : (m.r === "b" ? "도랏이" : "안내");
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

  /* ── 카톡 인앱 브라우저 → 크롬·기본 브라우저 자동 이동 (v1.9.3) ──────────
     · 카카오톡 UA에서만 동작한다. PC·크롬·삼성인터넷에서는 절대 건드리지 않는다.
     · kakaotalk://web/openExternal → (안드로이드) intent:// 순서로 한 번씩만 시도한다.
     · sessionStorage에 시각을 남겨 새로고침·재진입 때 반복 점프(무한 루프)를 막는다.
     · 자동 이동은 사용자 조작이 아니라 대개 차단되므로, 배너 버튼은 그대로 폴백으로 둔다.
     · 주소에 ?stay=1을 붙이면 자동 이동을 끄고 카톡 안에서 그대로 쓴다. */
  var KAKAO_KEY = "dorati.kakao.escape";
  var KAKAO_COOL = 10 * 60 * 1000;   /* 같은 탭에서 10분에 한 번만 자동 시도 */

  function kakaoUa() {
    return navigator.userAgent.toLowerCase().indexOf("kakaotalk") >= 0;
  }

  function kakaoTargetUrl() {
    /* 해시(#)는 떼고 보낸다 — 카톡 스킴에 붙이면 열리지 않는 경우가 있다 */
    return location.href.split("#")[0];
  }

  function goExternal(kind) {
    var url = kakaoTargetUrl();
    var target = kind === "intent"
      ? "intent://" + url.replace(/^https?:\/\//, "") +
        "#Intent;scheme=https;S.browser_fallback_url=" + encodeURIComponent(url) + ";end"
      : "kakaotalk://web/openExternal?url=" + encodeURIComponent(url);
    try { location.href = target; return true; } catch (e) { return false; }
  }

  function autoEscapeKakao() {
    if (/[?&]stay=1/.test(location.search)) return;          /* 수동 정지 스위치 */
    try {
      var last = Number(sessionStorage.getItem(KAKAO_KEY) || 0);
      if (last && Date.now() - last < KAKAO_COOL) return;    /* 방금 시도했다 → 배너만 */
      sessionStorage.setItem(KAKAO_KEY, String(Date.now()));
    } catch (e) { /* 사생활 보호 모드 등: 기록을 못 남기면 자동 이동은 하지 않는다 */ return; }

    setTimeout(function () {
      if (document.hidden) return;
      goExternal("scheme");
      /* 1차가 막혔으면(화면이 그대로면) 안드로이드에서 intent://로 한 번 더 */
      setTimeout(function () {
        if (document.hidden) return;
        if (!/android/.test(navigator.userAgent.toLowerCase())) return;
        goExternal("intent");
      }, 1200);
    }, 450);
  }

  function kakao() {
    if (!kakaoUa()) return;
    var box = document.getElementById("kakao-banner");
    var btn = document.getElementById("kakao-open");
    if (box) box.hidden = false;
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        goExternal("scheme");
        setTimeout(function () {
          if (!document.hidden && /android/.test(navigator.userAgent.toLowerCase())) goExternal("intent");
        }, 1200);
      });
    }
    autoEscapeKakao();
  }

  /* ── 시작 ─────────────────────────────────────────────── */
  function boot() {
    applyTheme(lsGet(THEME_KEY) || "light");
    var savedMode = lsGet("dorati.mode");
    /* 미친도랏은 이스터에그라 기억하지 않는다 — 새로 열면 언제나 도랏부터 */
    setFlavor("pure", true);
    setMode(savedMode || "normal", true);
    var savedNick = lsGet(NICK_KEY) || "";
    if (savedNick) setNick(savedNick);
    placeGlider(false);
    kakao();

    window.Store.init();
    window.Store.subscribe(function (snap) {
      state.snap = snap;
      if (window.Engine && window.Engine.setRoasts) window.Engine.setRoasts(snap.roasts || []);
    });
    state.snap = window.Store.snapshot();
    if (window.Engine && window.Engine.setRoasts) window.Engine.setRoasts(state.snap.roasts || []);

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

  /* 똑똑이 모드에서 입력을 시작하면 중계 서버를 미리 데운다 — 실제 요청보다 먼저 깨워 두면
     첫 답이 콜드 스타트(1~3초)를 기다리지 않는다. warm() 자체가 2분 스로틀이라 매 키 입력은 무료다. */
  function warmSmart() {
    if (state.mode !== "smart") return;
    if (window.Smart && window.Smart.warm) window.Smart.warm();
  }
  input.addEventListener("focus", warmSmart);
  input.addEventListener("keydown", warmSmart);
  input.addEventListener("input", warmSmart);

  boot();
})();

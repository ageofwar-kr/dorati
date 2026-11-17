/* 도랏이 대화 엔진 v1.5 — 정규화 / 인덱스 매칭 / 문장 패턴 / 사전질문 / 모드별 답변
   · 내장 코퍼스(kb-corpus.js) 275개 의도 × 3모드 × 3답변 + 46개 Q&A쌍 × 3모드 × 3답변
   · 정확 일치 Map → 의도 정규식(문자 인덱스 프리필터) → 문장 패턴 → 사전 → dice 유사도 순
   · 같은 말을 반복해도 답이 겹치지 않도록 최근 답변 회피 */
window.Engine = (function () {
  "use strict";
  var KB = window.DORATI_KB || {};
  var CORPUS = window.DORATI_CORPUS || { intents: [], pairs: [] };

  /* ── 정규화 ─────────────────────────────────────────────── */
  function normalize(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[\s\u00a0]+/g, "")
      .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ]/g, "")
      .replace(/[ㅋ]{3,}/g, "ㅋㅋ")
      .replace(/[ㅎ]{3,}/g, "ㅎㅎ");
  }

  function bigrams(s) {
    var out = [];
    for (var i = 0; i < s.length - 1; i++) out.push(s.substr(i, 2));
    return out;
  }

  function dice(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    var A = bigrams(a), B = bigrams(b);
    var count = Object.create(null), inter = 0;
    for (var i = 0; i < A.length; i++) count[A[i]] = (count[A[i]] || 0) + 1;
    for (var j = 0; j < B.length; j++) {
      if (count[B[j]]) { count[B[j]]--; inter++; }
    }
    return (2 * inter) / (A.length + B.length);
  }

  function pick(arr) {
    if (!arr || !arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function withMode(bag, mode) {
    if (!bag) return [];
    if (mode === "clean" && bag.clean && bag.clean.length) return bag.clean;
    if (mode === "dorat" && bag.dorat && bag.dorat.length) return bag.dorat;
    if (mode === "normal" && bag.normal && bag.normal.length) return bag.normal;
    return bag.normal || bag.clean || bag.dorat || [];
  }

  /* ── 최근 답변 회피 ─────────────────────────────────────── */
  var lastById = Object.create(null);
  var recent = [];

  function pickFresh(key, pool) {
    if (!pool || !pool.length) return "";
    var last = lastById[key];
    var cand = [];
    for (var i = 0; i < pool.length; i++) {
      if (pool[i] === last) continue;
      if (recent.indexOf(pool[i]) >= 0) continue;
      cand.push(pool[i]);
    }
    if (!cand.length) {
      for (var j = 0; j < pool.length; j++) if (pool[j] !== last) cand.push(pool[j]);
    }
    if (!cand.length) cand = pool;
    var out = cand[Math.floor(Math.random() * cand.length)];
    lastById[key] = out;
    recent.push(out);
    if (recent.length > 6) recent.shift();
    return out;
  }

  /* ── 사전 질문(정식: 뜻·의미·사전) ─────────────────────── */
  var STOPHEAD = /^(이|그|저|저기|혹시|좀|단어|말|낱말|도랏이|야|그럼|그러면)+/;
  var PARTICLES = /(은|는|이|가|을|를|의|도|만|랑|와|과|에서|에|으로|로|야|여|아|님)+$/;

  function dictTarget(raw) {
    var t = String(raw || "").replace(/[\s\u00a0]+/g, "");
    if (!t) return null;
    var signal = /(뜻|의미|사전|낱말|단어의)/.test(t);
    if (!signal) return null;
    var qmark = /(뭐|무엇|알려|궁금|뭐야|뭔가|찾아|검색|가르쳐|설명|정확|어때)/.test(t);
    var cut = t.search(/(의)?(뜻풀이|뜻|의미|사전)/);
    if (cut <= 0 && !qmark) return null;
    var head = cut > 0 ? t.slice(0, cut) : t.replace(/(뜻|의미|사전).*$/, "");
    head = head.replace(STOPHEAD, "");
    var stripped = head.replace(PARTICLES, "");
    if (stripped.length >= 2) head = stripped;
    head = head.replace(STOPHEAD, "");
    if (!head) return null;
    if (head.length > 12) return null;
    if (/[?!]|어때|해줘|해요/.test(head)) return null;
    return head;
  }

  /* ── 느슨한 사전 질문("블루투스 알려줘", "양자역학 뭐야") ── */
  var LOOSE_RE = /^(.{2,14}?)\s*(?:이|가|은|는|을|를|이란|라는|란|좀|이라는)?\s*(?:뭐야|뭐임|뭔데|뭐지|뭐예요|뭔가요|뭐냐|알려줘|알려|가르쳐줘|설명해줘|설명해|궁금해|궁금하다)\s*[\?？!]*$/;
  var LOOSE_STOP = ["너", "나", "니", "너네", "우리", "저", "제", "당신", "이거", "그거", "저거", "여기", "거기", "저기",
    "오늘", "내일", "어제", "지금", "아까", "뭐", "왜", "언제", "어디", "누구", "몇", "어떻게", "그냥", "진짜", "정말",
    "아니", "응", "어", "그래", "몰라", "밥", "잠", "돈", "눈", "비", "꿈", "집", "학교", "회사", "친구", "사랑", "게임",
    "노래", "영화", "고양이", "강아지", "하늘", "바다", "남자", "여자", "사람", "인생", "시간", "마음", "생각", "기분"];
  var VERBISH = /(해|했|할|하고|해서|되|돼|줘|줄|가|와|봐|하지|하는|한|먹|마시|자|싶|있|없|같|보|알|모르|싫|좋)/;

  function looseWord(raw) {
    var t = String(raw || "").trim();
    if (t.length < 3 || t.length > 24) return null;
    var m = t.match(LOOSE_RE);
    if (!m) return null;
    var w = m[1].replace(/^[\s"'「『]+|[\s"'」』]+$/g, "").trim();
    if (w.length < 2 || w.length > 12) return null;
    if (!/^[가-힣a-zA-Z0-9 ]+$/.test(w)) return null;
    if (w.split(/\s+/).length > 2) return null;
    var flat = w.replace(/\s+/g, "");
    if (LOOSE_STOP.indexOf(flat) >= 0) return null;
    if (VERBISH.test(flat)) return null;
    return flat;
  }

  /* ── 학습 데이터 매칭 ─────────────────────────────────── */
  function visible(e) {
    if (!e || e.r >= 3) return false;
    if (window.Safety.scan(e.a).safe === false) return false;
    if (window.Safety.scan(e.q).safe === false) return false;
    return true;
  }

  function score(e) {
    return Math.max(1, 1 + 2 * (e.up || 0) - 1.5 * (e.down || 0));
  }

  function weightedPick(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += score(list[i]);
    var r = Math.random() * total;
    for (i = 0; i < list.length; i++) {
      r -= score(list[i]);
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function pickLearned(text, snap) {
    var qn = normalize(text);
    if (!qn) return null;
    snap = snap || { pairs: [], byNorm: {} };
    var exact = (snap.byNorm[qn] || []).filter(visible);
    if (exact.length) return { entry: weightedPick(exact), how: "exact" };
    if (qn.length < 3) return null;
    var best = 0, bucket = [];
    for (var i = 0; i < snap.pairs.length; i++) {
      var e = snap.pairs[i];
      if (!visible(e)) continue;
      if (!e.qn || e.qn.length < 3) continue;
      if (Math.abs(e.qn.length - qn.length) > Math.max(6, qn.length)) continue;
      var d = dice(qn, e.qn);
      if (d > best + 0.03) { best = d; bucket = [e]; }
      else if (d >= best - 0.03 && d >= 0.62) { bucket.push(e); }
    }
    if (best >= 0.62 && bucket.length) return { entry: weightedPick(bucket), how: "fuzzy" };
    return null;
  }

  /* ── 내장 의도 인덱스 ─────────────────────────────────── */
  var INTENTS = [];
  (function compile() {
    var list = CORPUS.intents || [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      var re;
      try { re = new RegExp(raw.re); } catch (e) { continue; }
      INTENTS.push({
        id: raw.id,
        re: re,
        clean: raw.clean || [],
        normal: raw.normal || [],
        dorat: raw.dorat || [],
        keys: firstChars(raw.re)
      });
    }
  })();

  /* 정규식 문자열에서 '첫 글자' 후보를 뽑아 문자 인덱스를 만든다.
     어떤 리터럴이 매칭되려면 그 리터럴의 첫 글자가 입력에 반드시 있어야 하므로
     이 인덱스는 안전한 프리필터로 쓸 수 있다. */
  function firstChars(src) {
    var s = String(src || "").replace(/[\^\$\(\)\[\]\{\}\|\?\*\+\.\\]/g, " ");
    var runs = s.split(/\s+/), out = [];
    for (var i = 0; i < runs.length; i++) {
      var r = runs[i];
      if (!r) continue;
      var c = r.charAt(0);
      if (/[가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/.test(c) && out.indexOf(c) < 0) out.push(c);
    }
    return out;
  }

  var CHAR_INDEX = Object.create(null);
  (function buildIndex() {
    for (var i = 0; i < INTENTS.length; i++) {
      var keys = INTENTS[i].keys;
      for (var k = 0; k < keys.length; k++) {
        (CHAR_INDEX[keys[k]] || (CHAR_INDEX[keys[k]] = [])).push(i);
      }
    }
  })();

  function candidates(t) {
    var mark = new Uint8Array(INTENTS.length);
    var seen = Object.create(null);
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (seen[c]) continue;
      seen[c] = 1;
      var bucket = CHAR_INDEX[c];
      if (!bucket) continue;
      for (var j = 0; j < bucket.length; j++) mark[bucket[j]] = 1;
    }
    /* 첫 글자 인덱스가 비어 있는 의도(패턴형)는 항상 검사 */
    for (var n = 0; n < INTENTS.length; n++) {
      if (!INTENTS[n].keys.length) mark[n] = 1;
    }
    return mark;
  }

  function scanIntents(t, mark) {
    for (var i = 0; i < INTENTS.length; i++) {
      if (mark && !mark[i]) continue;
      if (INTENTS[i].re.test(t)) return INTENTS[i];
    }
    return null;
  }

  function matchIntent(t) {
    var hit = scanIntents(t, candidates(t));
    if (hit) return hit;
    /* 안전망: 인덱스가 놓쳤을 수 있으니 전체를 한 번 더 본다 */
    return scanIntents(t, null);
  }

  function intentReply(entry, mode) {
    var pool = withMode(entry, mode);
    if (!pool.length) pool = withMode(entry, "normal");
    return pickFresh("i:" + entry.id, pool);
  }

  /* ── 내장 Q&A 쌍 (정확 → dice) ────────────────────────── */
  var PAIRS = [];
  var PAIR_BY_NORM = Object.create(null);
  (function compilePairs() {
    var list = CORPUS.pairs || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.q) continue;
      var item = {
        q: p.q,
        qn: normalize(p.q),
        clean: p.clean ? [].concat(p.clean) : [],
        normal: p.normal ? [].concat(p.normal) : [],
        dorat: p.dorat ? [].concat(p.dorat) : []
      };
      PAIRS.push(item);
      (PAIR_BY_NORM[item.qn] || (PAIR_BY_NORM[item.qn] = [])).push(item);
    }
  })();

  function pairReply(item, mode) {
    var pool = withMode(item, mode);
    if (!pool.length) pool = withMode(item, "normal");
    return pickFresh("p:" + item.qn, pool);
  }

  function pairExact(t) {
    var bucket = PAIR_BY_NORM[t];
    if (!bucket || !bucket.length) return null;
    return bucket[0];
  }

  function pairFuzzy(t) {
    if (t.length < 3) return null;
    var best = 0, bestItem = null;
    for (var i = 0; i < PAIRS.length; i++) {
      var item = PAIRS[i];
      if (!item.qn || item.qn.length < 3) continue;
      if (Math.abs(item.qn.length - t.length) > Math.max(5, t.length)) continue;
      var d = dice(t, item.qn);
      if (d > best) { best = d; bestItem = item; }
    }
    if (best >= 0.66) return bestItem;
    return null;
  }

  /* ── 문장 패턴 ────────────────────────────────────────── */
  function patternBag(kind, pool) {
    var bag = (KB.pat && KB.pat[kind]) || pool || null;
    return bag;
  }

  var CHOICE_PATTERNS = [
    /^(.{1,20}?)\s*(?:vs\.?|브이에스)\s*(.{1,20})$/i,
    /^(.{1,20}?)\s*(?:아니면|중에서|중에)\s*(.{1,20})$/,
    /^(.{1,20}?)(?:이랑|랑)\s*(.{1,20})$/,
    /^(.{2,20}?)\s(?:와|과|랑)\s(.{2,20})$/
  ];

  function choiceOf(raw) {
    var t = String(raw || "").replace(/[?!.~…\s]+$/g, "").trim();
    if (!t) return null;
    t = t.replace(/\s*(골라줘|골라|추천해줘|추천|정해줘|선택해줘|뭐가 ?나아|뭐가 ?좋아|어때|어떡해|할까)\s*$/g, "").trim();
    var m = null;
    for (var i = 0; i < CHOICE_PATTERNS.length; i++) {
      m = t.match(CHOICE_PATTERNS[i]);
      if (m) break;
    }
    if (!m) return null;
    var A = m[1].trim(), B = m[2].trim();
    if (!A || !B) return null;
    if (/(골라|뭐가|어때|나아|좋아|할까|먹을까|볼까|갈까|어느|뭐|왜|어떻게|vs)/i.test(A + B)) return null;
    if (A.length > 14 || B.length > 14) return null;
    return { A: A, B: B };
  }

  /* 한국어 조사 처리 — 받침에 따라 이/가, 은/는, 을/를, 으로/로, 이지/지, 와/과 */
  function josa(word, type) {
    var s = String(word || "");
    if (!s) return "";
    var code = s.charCodeAt(s.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return "";
    var jong = (code - 0xac00) % 28;
    var has = jong !== 0;
    if (type === "이가") return has ? "이" : "가";
    if (type === "은는") return has ? "은" : "는";
    if (type === "을를") return has ? "을" : "를";
    if (type === "으로로") return (jong === 8 || !has) ? "로" : "으로";
    if (type === "이지") return has ? "이지" : "지";
    if (type === "와과") return has ? "과" : "와";
    return "";
  }

  function fillAB(text, A, B) {
    return String(text)
      .replace(/\{A가\}/g, A + josa(A, "이가"))
      .replace(/\{A는\}/g, A + josa(A, "은는"))
      .replace(/\{A를\}/g, A + josa(A, "을를"))
      .replace(/\{A로\}/g, A + josa(A, "으로로"))
      .replace(/\{A지\}/g, A + josa(A, "이지"))
      .replace(/\{A와\}/g, A + josa(A, "와과"))
      .replace(/\{B가\}/g, B + josa(B, "이가"))
      .replace(/\{B는\}/g, B + josa(B, "은는"))
      .replace(/\{B를\}/g, B + josa(B, "을를"))
      .replace(/\{B로\}/g, B + josa(B, "으로로"))
      .replace(/\{B지\}/g, B + josa(B, "이지"))
      .replace(/\{B와\}/g, B + josa(B, "와과"))
      .replace(/\{A\}/g, A)
      .replace(/\{B\}/g, B);
  }

  function choiceAnswer(choice, mode) {
    var head = withMode(KB.choice, mode);
    var reason = withMode(KB.choiceReason, mode);
    var pickAB = Math.random() < 0.5 ? choice.A : choice.B;
    var other = pickAB === choice.A ? choice.B : choice.A;
    var text = fillAB(pick(head), pickAB, other);
    if (reason && reason.length && Math.random() < 0.55) {
      text += " " + fillAB(pick(reason), choice.A, choice.B);
    }
    return text;
  }

  function decideAnswer(mode) {
    return pickFresh("pat:decide", withMode(KB.decide, mode));
  }

  function whAnswer(kind, mode) {
    var bag = patternBag(kind);
    if (!bag) return null;
    return pickFresh("pat:" + kind, withMode(bag, mode));
  }

  var RPS_PICK = ["가위", "바위", "보"];

  function rpsAnswer(raw, mode) {
    var mine = RPS_PICK[Math.floor(Math.random() * 3)];
    var user = null;
    if (/가위/.test(raw)) user = "가위";
    else if (/바위/.test(raw)) user = "바위";
    else if (/보\b|보$|보자|보를/.test(raw)) user = "보";
    var table = KB.rps && KB.rps[mode] ? KB.rps[mode] : (KB.rps && KB.rps.normal);
    if (!table) return null;
    var head = pick(table.head).replace(/\{M\}/g, mine);
    function join(a, b) { return String(a + " " + b).replace(/\s+/g, " ").trim(); }
    if (!user || user === mine) {
      return join(head.replace(/\{R\}/g, "무승부"), table.draw);
    }
    var win = (user === "가위" && mine === "바위") || (user === "바위" && mine === "보") || (user === "보" && mine === "가위");
    return join(head.replace(/\{R\}/g, win ? "내 승리" : "네 승리"), win ? table.win : table.lose);
  }

  function numberAnswer(raw, mode) {
    var m = String(raw || "").match(/(\d{1,3})\s*(?:부터|~|-)\s*(\d{1,3})/);
    var lo = 1, hi = 100;
    if (m) {
      lo = Math.min(parseInt(m[1], 10), parseInt(m[2], 10));
      hi = Math.max(parseInt(m[1], 10), parseInt(m[2], 10));
      if (hi - lo > 9999) hi = lo + 9999;
    }
    var n = lo + Math.floor(Math.random() * (hi - lo + 1));
    var pool = withMode(KB.number, mode);
    if (!pool.length) return String(n);
    return pickFresh("pat:number", pool).replace(/\{N\}/g, String(n));
  }

  function rateAnswer(mode) {
    var s = 62 + Math.floor(Math.random() * 37);
    var pool = withMode(KB.rate, mode);
    if (!pool.length) return String(s) + "점";
    return pickFresh("pat:rate", pool).replace(/\{S\}/g, String(s));
  }

  function fortuneAnswer(mode) {
    var pool = withMode(KB.fortune, mode);
    if (!pool.length) return null;
    return pickFresh("pat:fortune", pool);
  }

  /* ── 모르는 말 처리 ───────────────────────────────────── */
  function teachable(text) {
    var t = normalize(text);
    if (t.length < 3) return false;
    if (/^[ㄱ-ㅎㅏ-ㅣ]+$/.test(t)) return false;
    if (/^(ㅋ+|ㅎ+|ㅠ+|ㅜ+|ㅇㅇ|ㄴㄴ|ㅇㅋ|ㄹㅇ|ㄷㄷ|ㅁㅁ|ㅂㅂ)+$/.test(t)) return false;
    if (!/[가-힣]/.test(t)) return false;
    if (/^(안녕|하이|헬로|hi|hello|ㅎㅇ)$/.test(t)) return false;
    return true;
  }

  function echoText(raw) {
    var t = String(raw || "").replace(/[\s\u00a0]+/g, " ").trim();
    if (t.length > 26) t = t.slice(0, 26) + "…";
    return t;
  }

  function deflectAnswer(raw, mode) {
    var bag = withMode(KB.deflect, mode);
    if (!bag.length) return "";
    return pickFresh("pat:deflect", bag).replace(/\{t\}/g, echoText(raw));
  }

  function shortNoiseAnswer(mode) {
    var bag = withMode(KB.shortNoise, mode);
    return bag.length ? pickFresh("pat:noise", bag) : "";
  }

  /* ── 모드 변경 요청 ───────────────────────────────────── */
  function modeOf(text) {
    var t = normalize(text);
    if (/도랏(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /도랏모드/.test(t)) return "dorat";
    if (/건전(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /건전모드/.test(t)) return "clean";
    if (/일반(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /일반모드/.test(t)) return "normal";
    return null;
  }

  function introForDict(mode) {
    var a = {
      clean: ["네! 사전에 이렇게 나와 있어요 😊", "찾아봤어요. 아래처럼 정리돼 있어요!"],
      normal: ["사전 뒤져봤다. 이거야.", "찾았다 ㅋㅋ 뜻은 이래."],
      dorat: ["사전 뒤졌다. 이게 정답임.", "찾아옴. 외워. 시험에 나온다."]
    }[mode] || ["사전에 이렇게 나와 있어요."];
    return pick(a);
  }

  function notFoundForDict(mode, word) {
    return {
      clean: "음, 사전에서 '" + word + "'를 못 찾았어요. 다른 표기로 다시 물어봐 주시겠어요?",
      normal: "사전에 '" + word + "'는 안 나오는데? 철자가 맞아?",
      dorat: "'" + word + "'? 그건 사전에도 인정 안 하는 말인가 봐. 다시 던져봐."
    }[mode];
  }

  /* ── 동기 처리부 (테스트용으로도 쓴다) ─────────────────── */
  function answerSync(raw, mode, snap) {
    mode = mode || "normal";
    var text = String(raw || "").trim();
    if (!text) return { type: "empty" };

    /* 1) 하드 안전 필터 — 모든 모드 최우선 */
    var safe = window.Safety.scan(text);
    if (!safe.safe) {
      return {
        type: "text",
        text: window.Safety.notice(safe.kind),
        kind: "safety",
        safetyKind: safe.kind
      };
    }

    /* 2) 모드 변경 */
    var m = modeOf(text);
    if (m) return { type: "mode", mode: m };

    /* 3) 정식 사전 질문 (뜻·의미·사전) */
    var target = dictTarget(text);
    if (target) {
      var learnedDict = pickLearned(text, snap);
      return {
        type: "dictQuery",
        target: target,
        relay: true,
        fallback: learnedDict
          ? { type: "text", text: window.Safety.censor(learnedDict.entry.a, mode), entry: learnedDict.entry, how: learnedDict.how }
          : { type: "text", text: notFoundForDict(mode, target) }
      };
    }

    /* 4) 학습된 말 (사용자가 직접 가르친 것) */
    var learned = pickLearned(text, snap);
    if (learned) {
      return {
        type: "text",
        text: window.Safety.censor(learned.entry.a, mode),
        entry: learned.entry,
        how: learned.how
      };
    }

    var t = normalize(text);
    if (!t) return { type: "text", text: shortNoiseAnswer(mode), intent: "noise" };

    /* 5) 내장 Q&A 쌍 정확 일치 */
    var pe = pairExact(t);
    if (pe) return { type: "text", text: pairReply(pe, mode), intent: "pair:" + pe.q, how: "pair" };

    /* 6) A vs B 선택 */
    var choice = choiceOf(text);
    if (choice) return { type: "text", text: choiceAnswer(choice, mode), intent: "choice", how: "pattern" };

    /* 7) 동적 놀이 (가위바위보 / 숫자 / 점수 / 운세) */
    if (/가위바위보|가바보|묵찌빠/.test(t)) {
      return { type: "text", text: rpsAnswer(text, mode), intent: "rps", how: "dynamic" };
    }
    if (/숫자|랜덤|번호뽑|1부터|숫자골라|숫자줘/.test(t)) {
      return { type: "text", text: numberAnswer(text, mode), intent: "number", how: "dynamic" };
    }
    if (/평가|몇점|점수줘|점수매겨|나어때/.test(t)) {
      return { type: "text", text: rateAnswer(mode), intent: "rate", how: "dynamic" };
    }
    if (/운세|오늘운|길운|사주|오늘어때/.test(t)) {
      var f = fortuneAnswer(mode);
      if (f) return { type: "text", text: f, intent: "fortune", how: "dynamic" };
    }

    /* 8) "A할까 B할까" 처럼 결정 요청이 두 번 나오면 의도보다 먼저 결정 답변 */
    var kah = t.match(/(할까|볼까|갈까|먹을까|살까|할래|볼래|갈래|입을까|읽을까|해볼까|마실까)/g);
    if (kah && kah.length >= 2) {
      return { type: "text", text: decideAnswer(mode), intent: "pat:decide", how: "pattern" };
    }

    /* 9) 내장 의도 */
    var it = matchIntent(t);
    if (it) return { type: "text", text: intentReply(it, mode), intent: it.id, how: "intent" };

    /* 10) 의문사 패턴 */
    if (/왜/.test(t)) return { type: "text", text: whAnswer("why", mode), intent: "pat:why", how: "pattern" };
    if (/언제/.test(t)) return { type: "text", text: whAnswer("when", mode), intent: "pat:when", how: "pattern" };
    if (/어디/.test(t)) return { type: "text", text: whAnswer("where", mode), intent: "pat:where", how: "pattern" };
    if (/누구/.test(t)) return { type: "text", text: whAnswer("who", mode), intent: "pat:who", how: "pattern" };
    if (/몇/.test(t)) return { type: "text", text: whAnswer("howmany", mode), intent: "pat:howmany", how: "pattern" };
    if (/어떻게|어케/.test(t)) return { type: "text", text: whAnswer("how", mode), intent: "pat:how", how: "pattern" };

    /* 11) ~할까? 결정 요청 */
    if (/(할까|볼까|갈까|먹을까|살까|할래|볼래|갈래|입을까|읽을까|해볼까|마실까|할까요|볼까요)\??$/.test(t)) {
      return { type: "text", text: decideAnswer(mode), intent: "pat:decide", how: "pattern" };
    }

    /* 12) 느슨한 사전 질문 ("블루투스 알려줘") */
    var lw = looseWord(text);
    if (lw) {
      return {
        type: "dictQuery",
        target: lw,
        relay: false,
        fallback: { type: "text", text: notFoundForDict(mode, lw) }
      };
    }

    /* 13) 예/아니오 질문 */
    if (t.length >= 3 && (/[?？]\s*$/.test(text) || /(냐|니|지|가|나|음)\??$/.test(t))) {
      return { type: "text", text: pickFresh("pat:yesno", withMode(KB.yesno, mode)), intent: "pat:yesno", how: "pattern" };
    }

    /* 14) 내장 Q&A 쌍 유사도 */
    var pf = pairFuzzy(t);
    if (pf) return { type: "text", text: pairReply(pf, mode), intent: "pair:" + pf.q, how: "fuzzy" };

    /* 15) 모르는 말 */
    if (teachable(text)) {
      var asks = withMode(KB.askBack, mode);
      return {
        type: "text",
        text: asks.length ? pickFresh("pat:teach", asks) : "그 말은 처음 들어. 가르쳐줘.",
        intent: "teach",
        askTeachFor: text
      };
    }
    var noise = shortNoiseAnswer(mode);
    return {
      type: "text",
      text: noise || deflectAnswer(text, mode),
      intent: "noise"
    };
  }

  /* ── Promise 래퍼 (사전 조회만 비동기) ────────────────── */
  function answer(raw, mode, snap) {
    var r = answerSync(raw, mode, snap);
    if (r.type !== "dictQuery") return Promise.resolve(r);
    var lookup = window.Dict.lookup(r.target, r.relay === false ? { relay: false } : null);
    return lookup.then(function (res) {
      if (res) {
        return { type: "card", card: res, intro: introForDict(mode), ranked: false };
      }
      return r.fallback || { type: "text", text: notFoundForDict(mode, r.target) };
    }).catch(function () {
      return r.fallback || { type: "text", text: notFoundForDict(mode, r.target) };
    });
  }

  /* ── 통계 · 벤치 (검증용) ─────────────────────────────── */
  function stats() {
    var intentReplies = 0, pairReplies = 0, minPerMode = 99, minPair = 99;
    for (var i = 0; i < INTENTS.length; i++) {
      var c = INTENTS[i].clean.length, n = INTENTS[i].normal.length, d = INTENTS[i].dorat.length;
      intentReplies += c + n + d;
      minPerMode = Math.min(minPerMode, c, n, d);
    }
    for (var j = 0; j < PAIRS.length; j++) {
      var pc = PAIRS[j].clean.length, pn = PAIRS[j].normal.length, pd = PAIRS[j].dorat.length;
      pairReplies += pc + pn + pd;
      minPair = Math.min(minPair, pc, pn, pd);
    }
    return {
      intents: INTENTS.length,
      pairs: PAIRS.length,
      intentReplies: intentReplies,
      pairReplies: pairReplies,
      totalReplies: intentReplies + pairReplies,
      minRepliesPerIntent: minPerMode,
      minRepliesPerPair: minPair
    };
  }

  function bench(rounds) {
    var samples = ["야", "뭐해", "졸려 죽겠다", "치킨 vs 피자", "학교 가기 싫다", "오늘 저녁 뭐 먹지",
      "너 좀 멍청한데", "왜 하늘은 파래", "ㅋㅋㅋ", "블루투스 알려줘", "내일 시험인데 공부 안 했다",
      "나 요즘 힘들어", "가위바위보", "점메추", "심심해", "오늘 너무 바빴어"];
    rounds = rounds || 50;
    var n = 0, total = 0;
    var now = (window.performance && window.performance.now)
      ? function () { return window.performance.now(); }
      : function () { return Date.now(); };
    for (var r = 0; r < rounds; r++) {
      for (var i = 0; i < samples.length; i++) {
        var t0 = now();
        answerSync(samples[i], "normal", { pairs: [], byNorm: {} });
        total += now() - t0;
        n++;
      }
    }
    return { cases: n, totalMs: Math.round(total * 1000) / 1000, avgMs: n ? Math.round((total / n) * 10000) / 10000 : 0 };
  }

  return {
    version: "1.5",
    normalize: normalize,
    dice: dice,
    dictTarget: dictTarget,
    looseWord: looseWord,
    answer: answer,
    answerSync: answerSync,
    pickLearned: pickLearned,
    visible: visible,
    stats: stats,
    bench: bench
  };
})();

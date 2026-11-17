/* 도랏이 대화 엔진 — 정규화 / 매칭 / 사전질문 / 모드별 답변 */
window.Engine = (function () {
  "use strict";
  var KB = window.DORATI_KB;

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

  /* ── 사전 질문인지 판별 ──────────────────────────────── */
  var DICT_WORDS = ["뜻풀이", "뜻이뭐", "뜻은", "뜻이", "뜻", "의미가뭐", "의미", "사전에서", "사전에", "사전뜻", "무슨말이야", "무슨뜻"];
  var STOPHEAD = /^(이|그|저|저기|혹시|좀|단어|말|낱말|도랏이|야|그럼|그러면)+/;
  var PARTICLES = /(은|는|이|가|을|를|의|도|만|랑|와|과|에서|에|으로|로|야|여|아|님)+$/;

  function dictTarget(raw) {
    var t = String(raw || "").replace(/[\s\u00a0]+/g, "");
    if (!t) return null;
    /* 뜻을 묻는 신호가 있어야 한다 */
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

  /* ── 모드별 학습 항목 노출 규칙 ───────────────────────── */
  /* 학습은 모든 모드가 하나의 풀을 공유한다.
     모드에 따른 차이는 '출력 필터'(Safety.censor)에서만 생긴다.
     하드 안전 필터(자살·범죄·개인정보)는 어떤 모드에서도 막는다. */
  function visible(e, mode) {
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

  /* ── 학습 데이터 매칭 ─────────────────────────────────── */
  function pickLearned(text, mode, snap) {
    var qn = normalize(text);
    if (!qn) return null;
    var exact = (snap.byNorm[qn] || []).filter(function (e) { return visible(e, mode); });
    if (exact.length) return { entry: weightedPick(exact), score: 1, how: "exact" };

    if (qn.length < 3) return null;
    var best = 0, bucket = [];
    for (var i = 0; i < snap.pairs.length; i++) {
      var e = snap.pairs[i];
      if (!visible(e, mode)) continue;
      if (!e.qn || e.qn.length < 3) continue;
      if (Math.abs(e.qn.length - qn.length) > Math.max(6, qn.length)) continue;
      var d = dice(qn, e.qn);
      if (d > best + 0.03) { best = d; bucket = [e]; }
      else if (d >= best - 0.03 && d >= 0.62) { bucket.push(e); }
    }
    if (best >= 0.62 && bucket.length) {
      return { entry: weightedPick(bucket), score: best, how: "fuzzy" };
    }
    return null;
  }

  /* ── 내장 의도 ────────────────────────────────────────── */
  var INTENTS = [
    { id: "hello", re: /^(안녕|하이|헬로|ㅎㅇ|안뇽|반가|방가|하잉|hi|hello|hey|어이|왔어|출석)/ },
    { id: "who", re: /(너|니|당신|도랏이)(는|가|이)?(누구|뭐야|뭔데|뭐임)|이름이?뭐|정체가|너뭐야/ },
    { id: "isAi", re: /(ai|에이아이|인공지능|로봇|프로그램|챗봇)(이야|야|니|인가|맞아|냐|임)|사람이야|기계야/ },
    { id: "love", re: /(사랑해|사랑한다|좋아해|좋아한다|보고싶|애정|반했)/ },
    { id: "thanks", re: /(고마워|고맙|감사|땡큐|thank|thx)/ },
    { id: "bye", re: /(잘가|잘있어|바이|안녕히|또봐|ㅂㅂ|bye|나간다|간다)/ },
    { id: "food", re: /(배고|밥먹|점심|저녁|야식|치킨|피자|라면|김치찌개|뭐먹|먹고싶|배꼽)/ },
    { id: "bored", re: /(심심|재밌|재미있|놀자|뭐할까|지루|할거없)/ },
    { id: "weather", re: /(날씨|비와|더워|추워|눈와|습해|미세먼지)/ },
    { id: "laugh", re: /^(ㅋ|ㅎ|ㅋㅋ|ㅎㅎ|ㅋㅋㅋ|웃겨|웃기|웃음|ㅋㅋㅋㅋ)/ },
    { id: "age", re: /(몇살|나이|연세|태어난)/ },
    { id: "insult", re: /(바보|멍청|한심|짜증|꺼져|닥쳐|뭐래|극혐|혐오|최악|못생|돼지|뚱뚱|찌질|노잼|극혐|한남|김치녀|씹|좆|ㅆ발|씨발|병신|ㅂㅅ|미친|새끼)/ }
  ];

  function builtin(text, mode) {
    var t = normalize(text);
    for (var i = 0; i < INTENTS.length; i++) {
      if (INTENTS[i].re.test(t)) {
        var pool = KB[INTENTS[i].id] && KB[INTENTS[i].id][mode];
        if (pool && pool.length) {
          return { text: pool[Math.floor(Math.random() * pool.length)], intent: INTENTS[i].id };
        }
      }
    }
    return null;
  }

  function modeOf(text) {
    var t = normalize(text);
    if (/도랏(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /도랏모드/.test(t)) return "dorat";
    if (/건전(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /건전모드/.test(t)) return "clean";
    if (/일반(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /일반모드/.test(t)) return "normal";
    return null;
  }

  /* ── 메인 ─────────────────────────────────────────────── */
  function answer(raw, mode, snap) {
    var text = String(raw || "").trim();
    if (!text) return Promise.resolve({ type: "empty" });

    /* 1) 하드 안전 필터 — 모든 모드 최우선 */
    var safe = window.Safety.scan(text);
    if (!safe.safe) {
      return Promise.resolve({
        type: "text",
        text: window.Safety.notice(safe.kind),
        kind: "safety",
        safetyKind: safe.kind
      });
    }

    /* 2) 모드 변경 요청 */
    var m = modeOf(text);
    if (m) {
      return Promise.resolve({ type: "mode", mode: m });
    }

    /* 3) 사전 질문 */
    var target = dictTarget(text);
    if (target) {
      return window.Dict.lookup(target).then(function (res) {
        if (res) {
          return {
            type: "card",
            card: res,
            intro: introForDict(mode, res),
            ranked: false
          };
        }
        /* 못 찾았을 때: 배운 말이 있으면 그것부터 */
        var l = pickLearned(text, mode, snap);
        if (l) return { type: "text", text: window.Safety.censor(l.entry.a, mode), entry: l.entry, how: l.how };
        return {
          type: "text",
          text: notFoundForDict(mode, target)
        };
      });
    }

    /* 4) 학습된 말 (정확 매칭) */
    var learned = pickLearned(text, mode, snap);
    if (learned) {
      return Promise.resolve({
        type: "text",
        text: window.Safety.censor(learned.entry.a, mode),
        entry: learned.entry,
        how: learned.how
      });
    }

    /* 5) 내장 대화 */
    var b = builtin(text, mode);
    if (b) return Promise.resolve({ type: "text", text: b.text, intent: b.intent });

    /* 6) 모르는 말 → 되묻고, 다음 답을 자동 학습 */
    var asks = KB.askBack[mode] || KB.askBack.normal;
    return Promise.resolve({
      type: "text",
      text: asks[Math.floor(Math.random() * asks.length)],
      askTeachFor: text
    });
  }

  function introForDict(mode, res) {
    var a = {
      clean: ["네! 사전에 이렇게 나와 있어요 😊", "찾아봤어요. 아래처럼 정리돼 있어요!"],
      normal: ["사전 뒤져봤다. 이거야.", "찾았다 ㅋㅋ 뜻은 이래."],
      dorat: ["사전 뒤졌다. 이게 정답임.", "찾아옴. 외워. 시험에 나온다."]
    }[mode] || ["사전에 이렇게 나와 있어요."];
    return a[Math.floor(Math.random() * a.length)];
  }

  function notFoundForDict(mode, word) {
    var a = {
      clean: "음, 사전에서 '" + word + "'를 못 찾았어요. 다른 표기로 다시 물어봐 주시겠어요?",
      normal: "사전에 '" + word + "'는 안 나오는데? 철자가 맞아?",
      dorat: "'" + word + "'? 그건 사전에도 인정 안 하는 말인가 봐. 다시 던져봐."
    }[mode];
    return a;
  }

  return {
    normalize: normalize,
    dice: dice,
    dictTarget: dictTarget,
    answer: answer,
    pickLearned: pickLearned,
    visible: visible
  };
})();

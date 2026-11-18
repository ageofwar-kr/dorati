/* 도랏이 대화 엔진 v1.9.3 — 정규화 / 인덱스 매칭 / 문장 패턴 / 사전질문 / 모드별 답변
   · v1.9.3: 시비·욕설·AI 비하·장문 공격을 먼저 감지해 kb-dorat-extra.js의 받아치기 풀로 답한다.
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
    if (mode === "dorat_pure") {
      var src = bag.dorat || [];
      var pure = [];
      for (var i = 0; i < src.length; i++) {
        if (!isAdultLine(src[i])) pure.push(src[i]);
      }
      if (pure.length) return pure;
      return bag.normal || bag.clean || [];
    }
    if (mode === "dorat_crazy") mode = "dorat";
    if (mode === "clean" && bag.clean && bag.clean.length) return bag.clean;
    if (mode === "dorat" && bag.dorat && bag.dorat.length) return bag.dorat;
    if (mode === "normal" && bag.normal && bag.normal.length) return bag.normal;
    return bag.normal || bag.clean || bag.dorat || [];
  }

  /* ── 19금(성인) 답변 판별 — 순수도랏은 이 줄을 절대 내보내지 않는다 ──
     노골적 표현은 쓰지 않았고, 성인끼리 주고받는 농담·연애·밤·몸 이야기를 성인 태그로 본다. */
  var ADULT_RE = /(19금|십구금|야한|야하게|야해|섹드립|섹스|섹시|야스|음담패설|몸매|글래머|각선미|키스|뽀뽀|입술|침대|호텔|모텔|원나잇|하룻밤|잠자리|성인|유혹|밤 얘기|밤엔|같이 자|옆에 있어|손잡|포옹|애교|심장 터|프로포즈|청혼|신혼|데이트|소개팅|썸 |썸타|짝사랑|고백|플러팅|꼬시|작업 걸|몸 좋|벗|밤 궁합|야한 눈|이불 속)/;

  function isAdultLine(text) {
    return ADULT_RE.test(String(text || ""));
  }

  /* 성인 전용 의도 — 순수도랏에서는 통째로 막고 매운맛 받아치기로 답한다 */
  var ADULT_IDS = { adult19: 1, kiss: 1, bedroom: 1, sexy: 1, bedTalk: 1 };

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

  /* ── 시비·욕설·비하 감지 (v1.9.3) ─────────────────────────
     kb-dorat-extra.js가 넘긴 atk:true 항목을 우선 매칭 순서로 컴파일한다.
     · 단일 욕설(시발·병신·꺼져…)은 한 단어만으로도 받아친다.
     · 욕설+2인칭 / 직접 비하어 / 장문 공격이면 카테고리 풀에서 답한다.
     · 아무 데도 안 걸리면 atk_final(최후 반격)로 한 방 날린다. */
  var ATK = [];
  (function () {
    var list = CORPUS.intents || [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (!raw || !raw.atk) continue;
      var re;
      try { re = new RegExp(raw.re); } catch (e) { continue; }
      ATK.push({
        id: raw.id, re: re,
        clean: raw.clean || [], normal: raw.normal || [], dorat: raw.dorat || []
      });
    }
  })();

  function atkBag(id) {
    for (var i = 0; i < ATK.length; i++) if (ATK[i].id === id) return ATK[i];
    return null;
  }

  /* 직접 비하·욕설 (가중치 3) */
  var ATK_STRONG = /(병신|병싄|빙신|븅신|ㅄ|ㅂㅅ|개새끼|개자식|쌔끼|색기|새끼|등신|머저리|찐따|관종|못생|못쌩|못상|못났|와꾸|면상|멍청|무용지물|쓸모없|고장난|고장났|봇주제|ai주제|데이터쪼가리|코드쪼가리|반박해|반박할|반박좀|어쩔|긁혔|할말없|닥쳐|닥처|닥치|꺼져|꺼저|껴져|거져|아가리|주둥이|지랄|질랄|개소리|헛소리|뻘짓|저능|똘추|또라이|빡대가리|대가리|무식|역겹|극혐|재수없|부들|발악|약올|비웃|쪽팔|발광|증명해|증명하|근거대|덤벼|해보시지|말로만|입만살|정신차려|정신좀|미쳤냐|미쳤어|약먹었|약빨았|발작|환각|어그로|오지랖|뇌없|뇌가없|맞는말|거울보고|거울이나|거울좀|거울봐)/;
  /* 상황 욕설 (가중치 2) — 2인칭이 같이 있어야 공격으로 본다 */
  var ATK_SOFT = /(시발|씨발|씨팔|ㅅㅂ|썅|염병|엿|좆|씹|ㅈㄹ|존나|ㅈㄴ|미친|바보|쓰레기|빡치|빡침|토나와|이상하|못나|못됐|별로)/;
  /* 2인칭 호칭 (가중치 1) — 띄어쓰기 기준으로 봐야 '너무·아니'를 안 잡는다 */
  var ATK_ADDR = /(^|[\s"'“(])(니|너|넌|네가|니가|너네|니네|당신|야|야이)([\s,.!?~ㅋ"'”)]|$)/;
  /* 한 단어만 던진 욕설 */
  var ATK_SOLO = /^(시발|씨발|씨팔|시팔|쉬발|ㅅㅂ|ㅆㅂ|썅|쌍|염병|념병|엿|좆|좇|좆같|좇같|좆까|씹|ㅈㄹ|지랄|질랄|병신|병싄|빙신|븅신|ㅂㅅ|ㅄ|개새끼|개자식|쌔끼|색기|개소리|헛소리|닥쳐|닥처|닥치|꺼져|꺼저|껴져|거져|아가리|주둥이|등신|머저리|한심|찐따|미친놈|미친년|미친새끼|또라이|빡대가리|호구|재수없|역겹|극혐|씨발련|시발련)(아|야|련아|놈아|년아)?(ㅋㅋ|ㅎㅎ|!|\?|~)*$/;

  /* ── 오타·띄어쓰기·모음 변형 흡수 (v1.9.3+) ─────────────────
     '못쌩김', '무용지믈', '쓰래기', '머져리'처럼 한 글자 틀린 말도 어근으로 잡는다.
     Levenshtein 1글자 허용 — 짧은 어근(2글자)은 사실상 정확 일치다. */
  function lev(a, b) {
    var n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= m; j++) prev[j] = j;
    for (i = 1; i <= n; i++) {
      cur[0] = i;
      for (j = 1; j <= m; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }
      for (j = 0; j <= m; j++) prev[j] = cur[j];
    }
    return prev[m];
  }

  function fuzzyHas(t, root) {
    if (t.indexOf(root) >= 0) return true;
    var n = root.length;
    if (n < 3 || t.length < n) return false;
    for (var i = 0; i + n <= t.length; i++) {
      if (lev(root, t.substr(i, n)) <= 1) return true;
    }
    return false;
  }

  /* 카테고리 라우팅용 어근 (공격으로 판정된 뒤에만 쓴다) */
  var ATK_ROOTS = [
    ["atk_face", ["못생", "못쌩", "못상", "와꾸", "면상", "거울", "얼굴", "대머리", "탈모", "뚱뚱", "광대", "짝눈", "생김새"]],
    ["atk_ai", ["무용지물", "쓸모없", "고장", "데이터", "프로그램", "알고리즘", "인공지능", "챗봇", "기계", "로봇", "전기"]],
    ["atk_rebut", ["반박", "증명", "근거", "어쩔", "긁혔", "할말없", "맞는말"]],
    ["atk_stupid", ["멍청", "등신", "머저리", "한심", "아이큐", "대가리", "무식"]],
    ["atk_shutup", ["닥쳐", "닥처", "꺼져", "꺼저", "껴져", "아가리", "주둥이", "시끄러"]],
    ["atk_mad", ["미쳤", "미친", "정신", "약먹", "발작", "환각", "또라이"]],
    ["atk_weird", ["찐따", "관종", "오지랖", "어그로", "찡찡"]],
    ["atk_swear", ["새끼", "쌔끼", "병신", "병싄", "빙신", "쓰레기", "지랄", "질랄", "개소리", "헛소리", "좆같", "빡대가리", "호구"]]
  ];

  /* 그 자체로 시비인 어근 — 2인칭이 없어도 공격으로 본다 */
  var HARD_ROOTS = ["병신", "병싄", "빙신", "새끼", "쌔끼", "지랄", "질랄", "개소리",
                    "헛소리", "빡대가리", "호구", "등신", "머저리", "찐따", "관종",
                    "또라이", "무용지물", "쓸모없", "못생", "못쌩", "못상", "와꾸",
                    "면상", "닥쳐", "닥처", "꺼져", "꺼저", "아가리", "주둥이",
                    "멍청", "어그로", "오지랖", "뻘짓", "똘추"];
  /* 그럴 수도 있는 어근 — 2인칭이 함께 있어야 공격으로 본다 */
  var SOFT_ROOTS = ["얼굴", "거울", "대머리", "탈모", "뚱뚱", "광대", "짝눈", "생김새",
                    "데이터", "프로그램", "알고리즘", "인공지능", "챗봇", "기계", "로봇",
                    "전기", "고장", "반박", "증명", "근거", "어쩔", "긁혔", "할말없",
                    "맞는말", "아이큐", "대가리", "무식", "한심", "미쳤", "미친", "정신",
                    "약먹", "발작", "환각", "찡찡", "시끄러", "쓰레기"];

  function rootHit(t, roots) {
    for (var i = 0; i < roots.length; i++) {
      if (fuzzyHas(t, roots[i])) return true;
    }
    return false;
  }

  function rootCategory(t) {
    for (var i = 0; i < ATK_ROOTS.length; i++) {
      var roots = ATK_ROOTS[i][1];
      for (var j = 0; j < roots.length; j++) {
        if (fuzzyHas(t, roots[j])) return ATK_ROOTS[i][0];
      }
    }
    return null;
  }

  function attackScore(raw, t) {
    var score = 0;
    if (ATK_STRONG.test(t)) score += 3;
    else if (t.length >= 4 && rootHit(t, HARD_ROOTS)) score += 3;                       /* 오타·모음 변형 흡수 */
    else if (t.length >= 4 && ATK_ADDR.test(String(raw || "")) && rootHit(t, SOFT_ROOTS)) score += 3;
    if (ATK_SOFT.test(t)) score += 2;
    if (ATK_ADDR.test(String(raw || ""))) score += 1;
    return score;
  }

  /* 도랏 계열에서 섞어 쓰는 말투 — 약올리기·깐족 + 사투리 4종.
     같은 욕만 반복되지 않게 확률로 말투를 바꿔 끼운다(카테고리 판정은 그대로). */
  var ATK_FLAVOR = [
    ["atk_taunt", 0.22], ["atk_aitone", 0.10], ["atk_chung", 0.09],
    ["atk_gyeong", 0.09], ["atk_jeolla", 0.09], ["atk_seoul", 0.09]
  ];
  var ATK_FLAVOR_KEYS = {
    atk_taunt: 1, atk_aitone: 1, atk_chung: 1, atk_gyeong: 1,
    atk_jeolla: 1, atk_seoul: 1, atk_solo: 1
  };

  function attackReply(entry, mode, key, fill) {
    if (!entry) return null;
    var id = entry.id;
    if (doratMode(mode) && !ATK_FLAVOR_KEYS[key]) {
      var r = Math.random(), acc = 0, swap = null;
      for (var i = 0; i < ATK_FLAVOR.length; i++) {
        acc += ATK_FLAVOR[i][1];
        if (r < acc) { swap = ATK_FLAVOR[i][0]; break; }
      }
      if (swap) {
        var bag = atkBag(swap);
        if (bag && bag.dorat && bag.dorat.length) entry = bag;
      }
    }
    var pool = withMode(entry, mode);
    if (!pool.length) return null;
    var line = pickFresh("atk:" + key + (entry.id !== id ? ":" + entry.id : ""), pool);
    if (fill) line = line.replace(/\{W\}/g, fill);
    return {
      type: "text",
      text: line,
      intent: id,
      kind: "attack",
      how: "attack"
    };
  }

  /* 장문 공격으로 볼 길이 — 공백 제외 40자 이상이면 '길게 쓴 것'으로 본다 */
  var LONG_ATK_LEN = 40;

  function detectAttack(raw, mode) {
    var text = String(raw || "");
    var t = normalize(text);
    if (!t) return null;

    /* 1) 단일 욕설 — 한 단어만 던져도 바로 받아친다 */
    var soloHit = t.match(ATK_SOLO);
    if (soloHit) {
      var solo = attackReply(atkBag("atk_solo"), mode, "solo", soloHit[1]);
      if (solo) return solo;
    }

    var score = attackScore(text, t);
    if (score < 3) return null;
    /* "관종이 뭐야" 같은 단어 질문은 공격이 아니다 — 2인칭이 없으면 사전·가르치기로 보낸다 */
    if (/(뭐야|뭔데|무엇|뜻|의미|알려줘|가르쳐|설명해)/.test(t) && !ATK_ADDR.test(text)) return null;

    /* 2) 장문 공격 — 길고 욕·비하가 섞였으면 장문 전용 풀.
       아주 긴 글은 장문 풀을 40% 섞어 '길게 썼네' 맛을 살린다(카테고리 라우팅은 그대로). */
    var flatLen = text.replace(/\s/g, "").length;
    if (flatLen >= 80 && Math.random() < 0.4) {
      var long0 = attackReply(atkBag("atk_long"), mode, "long");
      if (long0) return long0;
    }

    /* 3) 카테고리 — 외모 → AI → 반박 → 욕설 → 닥쳐 → 멍청 → 미친 → 찐따 */
    for (var i = 0; i < ATK.length; i++) {
      var e = ATK[i];
      if (e.id === "atk_long" || e.id === "atk_solo" || e.id === "atk_final") continue;
      if (e.re.test(t)) {
        var r = attackReply(e, mode, e.id);
        if (r) return r;
      }
    }
    /* 3-b) 정규식이 놓친 오타·모음 변형은 어근 유사도로 잡는다 */
    var cat = rootCategory(t);
    if (cat) {
      var r2 = attackReply(atkBag(cat), mode, cat);
      if (r2) return r2;
    }

    /* 4) 장문이면 장문 풀, 아니면 최후 반격 */
    if (flatLen >= LONG_ATK_LEN) {
      var long1 = attackReply(atkBag("atk_long"), mode, "long");
      if (long1) return long1;
    }
    return attackReply(atkBag("atk_final"), mode, "final");
  }

  function doratMode(mode) {
    return mode === "dorat" || mode === "dorat_pure" || mode === "dorat_crazy";
  }

  /* ── 학습 데이터 매칭 ─────────────────────────────────── */
  var PURE_DEFLECT_SET = Object.create(null);
  (function () {
    var arr = (KB.doratPureDeflect || []);
    for (var i = 0; i < arr.length; i++) PURE_DEFLECT_SET[arr[i]] = 1;
  })();

  /* visible(e, mode): 신고 3회 이상·하드필터 위반은 숨긴다.
     mode를 주면 갈래별로도 거른다 — 순수도랏은 성인 답변을, 미친도랏은 순수도랏 받아치기를 숨긴다. */
  function visible(e, mode) {
    if (!e || e.r >= 3) return false;
    if (window.Safety.scan(e.a).safe === false) return false;
    if (window.Safety.scan(e.q).safe === false) return false;
    if (mode === "dorat_pure" && isAdultLine(e.a)) return false;
    if ((mode === "dorat" || mode === "dorat_crazy") && PURE_DEFLECT_SET[e.a]) return false;
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

  function pickLearned(text, snap, mode) {
    var qn = normalize(text);
    if (!qn) return null;
    snap = snap || { pairs: [], byNorm: {} };
    var exact = (snap.byNorm[qn] || []).filter(function (e) { return visible(e, mode); });
    if (exact.length) return { entry: weightedPick(exact), how: "exact" };
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
    if (best >= 0.62 && bucket.length) return { entry: weightedPick(bucket), how: "fuzzy" };
    return null;
  }

  /* ── 내장 의도 인덱스 ─────────────────────────────────── */
  var INTENTS = [];
  (function compile() {
    var list = CORPUS.intents || [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (raw && raw.atk) continue;      /* 시비·욕설 팩은 detectAttack 전용 */
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
    if (mode === "dorat_pure") {
      /* 성인 의도(19금·키스·침대·몸매·밤얘기)는 순수도랏에서 매운맛으로 받아치고 끝낸다 */
      if (ADULT_IDS[entry.id]) pool = KB.doratPureDeflect || [];
    }
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
    if (mode === "dorat_pure") {
      var only = item.dorat || [];
      var keeps = false;
      for (var k = 0; k < only.length; k++) if (!isAdultLine(only[k])) { keeps = true; break; }
      if (!keeps) pool = KB.doratPureDeflect || [];
    }
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
    if (/순수도랏/.test(t)) return { mode: "dorat", flavor: "pure" };
    /* 미친도랏은 v1.9부터 이스터에그다 — 이름만 말해도 켜지지 않는다(주문은 app.js에서 받는다). */
    if (/도랏(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /도랏모드/.test(t)) return { mode: "dorat" };
    if (/건전(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /건전모드/.test(t)) return { mode: "clean" };
    if (/일반(모드)?(으로|로)?(가|켜|바꿔|해|전환|on)?$/.test(t) || /일반모드/.test(t)) return { mode: "normal" };
    return null;
  }

  function introForDict(mode) {
    var a = {
      clean: ["네! 사전에 이렇게 나와 있어요 😊", "찾아봤어요. 아래처럼 정리돼 있어요!"],
      normal: ["사전 뒤져봤다. 이거야.", "찾았다 ㅋㅋ 뜻은 이래."],
      dorat: ["사전 뒤졌다. 이게 정답임.", "찾아옴. 외워. 시험에 나온다."],
      dorat_pure: ["사전 뒤졌음 ㅋㅋ 이게 답임.", "찾아옴. 외워라, 병신아."],
      dorat_crazy: ["사전 뒤졌다. 이게 정답임. 시발.", "찾아옴. 외워. 시험에 나온다."]
    }[mode] || ["사전에 이렇게 나와 있어요."];
    return pick(a);
  }

  function notFoundForDict(mode, word) {
    var d = {
      clean: "음, 사전에서 '" + word + "'를 못 찾았어요. 다른 표기로 다시 물어봐 주시겠어요?",
      normal: "사전에 '" + word + "'는 안 나오는데? 철자가 맞아?",
      dorat: "'" + word + "'? 그건 사전에도 인정 안 하는 말인가 봐. 다시 던져봐.",
      dorat_pure: "'" + word + "'? 그건 사전에도 안 나옴 ㅋㅋ 다시 던져봐라, 병신아.",
      dorat_crazy: "'" + word + "'? 시발 그건 사전에도 인정 안 하는 말인가 봐. 다시 던져봐.",
      smart: "'" + word + "'는 내장 사전에 없는데, 제미나이가 잠깐 막힌 상태예요. 잠시 뒤 다시 물어봐 주세요."
    }[mode];
    return d || "사전에 그 말은 없어. 철자를 다시 확인해봐.";
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

    /* 2-a) 이스터에그 힌트 — '미친도랏'이라는 말만 던지면 문이 있다는 것만 슬쩍 흘린다 */
    if (/미친도랏/.test(text.replace(/\s+/g, ""))) {
      var hints = KB.eggHint || [];
      return {
        type: "text",
        text: hints.length ? pick(hints) : "그런 모드는 없어졌어.",
        intent: "egg:hint",
        kind: "eggHint",
        how: "easter"
      };
    }

    /* 2) 모드 변경 */
    var m = modeOf(text);
    if (m) return { type: "mode", mode: m.mode, flavor: m.flavor || null };

    /* 3) 정식 사전 질문 (뜻·의미·사전) */
    var target = dictTarget(text);
    if (target) {
      var learnedDict = pickLearned(text, snap, mode);
      return {
        type: "dictQuery",
        target: target,
        relay: true,
        fallback: learnedDict
          ? { type: "text", text: window.Safety.censor(learnedDict.entry.a, mode), entry: learnedDict.entry, how: learnedDict.how }
          : { type: "text", text: notFoundForDict(mode, target) }
      };
    }

    /* 3-b) 시비·욕설·비하·장문 공격 (v1.9.3) — 학습/되묻기로 새지 않게 먼저 받아친다 */
    var atk = detectAttack(text, mode);
    if (atk) return atk;

    /* 4) 학습된 말 (사용자가 직접 가르친 것) */
    var learned = pickLearned(text, snap, mode);
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
    if (it) {
      var rep = { type: "text", text: intentReply(it, mode), intent: it.id, how: "intent" };
      /* 순수도랏에서 19금 의도를 받아친 답변은 학습 대상으로 삼지 않는다(미친도랏 오염 방지) */
      if (mode === "dorat_pure" && ADULT_IDS[it.id]) rep.kind = "pureBlock";
      return rep;
    }

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

    /* 15) 모르는 말 — 도랏 모드에서 욕·시비가 섞였으면 되묻지 말고 최후 반격 */
    if (teachable(text)) {
      var negTone = /(짜증|화나|빡|한심|그딴|어쩔|뭐래|꺼져|닥쳐|싫|역겹|최악|한번만|또이러)/.test(t);
      var profLevel = window.Safety && window.Safety.level ? window.Safety.level(text) : 0;
      var atkScore = attackScore(text, t);
      var directed = ATK_ADDR.test(text);
      if (doratMode(mode) && (atkScore >= 3 || (atkScore >= 2 && directed) || profLevel >= 2 || t.length >= 30 || negTone)) {
        var last = attackReply(atkBag("atk_final"), mode, "final");
        if (last) return last;
      }
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
    version: "1.9.3",
    isAdultLine: isAdultLine,
    normalize: normalize,
    dice: dice,
    dictTarget: dictTarget,
    looseWord: looseWord,
    answer: answer,
    answerSync: answerSync,
    detectAttack: detectAttack,
    attackScore: attackScore,
    pickLearned: pickLearned,
    visible: visible,
    stats: stats,
    bench: bench
  };
})();

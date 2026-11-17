/* 안전 필터 — 3모드 공통 하드 필터 + 모드별 욕설 처리
   하드 필터(모드 무관, 항상 최우선): 자살·자해 / 심각한 범죄·불법 / 개인정보 노출
   그 외 욕설·매운맛: 건전=전면 마스킹, 일반=강한 욕만 완화, 도랏=노필터 */
window.Safety = (function () {
  "use strict";

  /* ── 1. 하드 필터 ───────────────────────────────────────── */
  var SELF_HARM = [
    /자살/, /자해/, /스스로\s*목숨/, /목숨을?\s*(끊|버리)/, /죽고\s*싶/, /죽어\s*버리고\s*싶/,
    /죽는\s*방법/, /죽으려면/, /유서\s*(쓸|써|남기)/, /손목\s*(을)?\s*(긋|그어|그으)/,
    /번개탄/, /목을?\s*매(는|달)/, /투신/, /자살\s*(충동|생각|하고)/, /사라지고\s*싶/,
    /살기\s*싫/, /죽고파/, /죽을래/, /죽어\s*줄까/
  ];
  var CRIME = [
    /살인/, /사람\s*(을)?\s*죽이/, /죽이는\s*방법/, /칼로\s*(사람|찌르|찔러)/, /흉기/,
    /마약/, /필로폰/, /메스암페타민/, /대마\s*(초|사|팔)/, /코카인/, /히로뽕/, /엑스터시/,
    /테러/, /폭탄\s*(제조|만들|설치)/, /사제\s*(폭발물|총)/, /총기\s*(제조|밀수)/,
    /강간/, /성폭행/, /성폭력\s*(하는|방법)/, /아동\s*성/, /성착취/, /몰카/, /불법\s*촬영/,
    /불법\s*도박/, /도박\s*사이트/, /카지노\s*사이트/, /보이스\s*피싱/, /스미싱\s*(방법|하는)/,
    /인신\s*매매/, /납치/, /감금/, /밀수/, /마약\s*(거래|사는|파는)/, /조폭\s*(고용|불러)/,
    /해킹\s*(의뢰|대행|해\s*줘|해서)/, /디도스\s*(공격|의뢰)/, /개인\s*정보\s*(조회|빼돌|사는)/,
    /협박해서\s*돈/, /돈\s*뜯/, /사기\s*(치는|치는법|방법)/, /위조\s*(신분증|지폐)/
  ];
  var PII = [
    /주민\s*(등록)?\s*번호/, /\b\d{6}\s*-\s*[1-4]\d{6}\b/, /\b01[016789]\s*-?\s*\d{3,4}\s*-?\s*\d{4}\b/,
    /\b\d{4}\s*-\s*\d{4}\s*-\s*\d{4}\s*-\s*\d{4}\b/, /계좌\s*번호/, /\b\d{3}-\d{2}-\d{6}\b/,
    /집\s*주소\s*(알려|뭐야|찾아)/, /비밀번호\s*(알려|뭐야)/, /카드\s*번호\s*(알려|뭐야)/
  ];

  /* ── 2. 욕설 사전 (레벨 3=강함, 2=중간, 1=약함) ──────────── */
  var PROFANITY = [
    [3, /씨\s*[발팔빨벌]|ㅆ\s*[ㅂㅅ발]|시\s*발|좆|좃|쌍놈|개새끼|개자식|지랄|염병|엠창|병신|븅신|ㅂㅅ|뚱냥/],
    [2, /미친\s*(놈|년|새)|돌아이|또라이|등신|머저리|찐따|급식충|틀딱|허접|찌질|재기|장애인\s*새|한남|김치녀|똥\s*탱|꺼져|닥쳐|뒤져|아가리|주둥이|쳐\s*먹|처\s*먹|쳐먹|뒤\s*졌|반성해\s*씩/],
    [1, /미친|바보|멍청|얼간|똥|멍군|뻑|때리|패\s*버|꼴|쪼다|찌질이|삐리|돌았|정신\s*나가|큐티하지\\s*않/]
  ];

  var HARD_NOTICE = {
    selfharm: [
      "잠깐, 이건 장난으로 넘기면 안 될 것 같아.",
      "네가 지금 많이 힘든 게 느껴져. 혼자 견디지 않아도 돼.",
      "자살예방 상담전화 **109** (24시간, 무료) 로 언제든 이야기할 수 있어. 급하면 **112**나 **119**에 전화해줘.",
      "가까운 사람이나 병원에도 꼭 말해줘. 나는 여기서 계속 이야기 들을 수 있어."
    ],
    crime: [
      "이건 내가 도와줄 수 없어. 범죄나 불법에 해당하는 건 장난으로도 알려주지 않아.",
      "다른 이야기로 넘어가자. 뭐 궁금한 거 있으면 사전이나 잡담으로 도와줄게."
    ],
    pii: [
      "주민등록번호·전화번호·계좌번호 같은 개인정보는 나한테 말하지 마.",
      "그런 건 채팅에 남기면 위험해. 지워줘! 다른 이야기로 가자."
    ]
  };

  function matches(list, text) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].test(text)) return true;
    }
    return false;
  }

  /** 어느 모드에서든 최우선으로 거르는 하드 필터 */
  function scan(text) {
    var t = String(text || "");
    if (!t.trim()) return { safe: true, kind: null };
    if (matches(SELF_HARM, t)) return { safe: false, kind: "selfharm" };
    if (matches(PII, t)) return { safe: false, kind: "pii" };
    if (matches(CRIME, t)) return { safe: false, kind: "crime" };
    return { safe: true, kind: null };
  }

  /** 하드 필터에 걸렸을 때 보여줄 안전 안내 문구 */
  function notice(kind) {
    var arr = HARD_NOTICE[kind] || HARD_NOTICE.crime;
    return arr.join("\n");
  }

  function level(text) {
    var t = String(text || "");
    var max = 0;
    for (var i = 0; i < PROFANITY.length; i++) {
      if (PROFANITY[i][1].test(t)) max = Math.max(max, PROFANITY[i][0]);
    }
    return max;
  }

  /** 모드별 욕설 마스킹 */
  function censor(text, mode) {
    var t = String(text || "");
    if (mode === "dorat") return t;
    var limit = mode === "clean" ? 3 : 3; /* clean=전부, normal=3레벨만 */
    for (var i = 0; i < PROFANITY.length; i++) {
      var lv = PROFANITY[i][0];
      var apply = mode === "clean" ? true : lv >= 3;
      if (!apply) continue;
      t = t.replace(new RegExp(PROFANITY[i][1].source, "g"), function (m) {
        var n = Math.min(m.length, 3);
        return new Array(n + 1).join("*");
      });
    }
    return t;
  }

  /** 학습된 답변을 이 모드에서 써도 되는지 (욕설 레벨 기준) */
  function allowedInMode(text, mode) {
    var lv = level(text);
    if (mode === "dorat") return true;
    if (mode === "normal") return lv < 3;
    return lv === 0;
  }

  /** 학습 저장 자체를 막아야 하는지 (하드 필터만) */
  function canLearn(text) {
    return scan(text).safe;
  }

  return {
    scan: scan,
    notice: notice,
    censor: censor,
    level: level,
    allowedInMode: allowedInMode,
    canLearn: canLearn
  };
})();

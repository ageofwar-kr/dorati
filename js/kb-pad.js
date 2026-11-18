/* 도랏이 v1.9.5 — 답변 최소 5개 보장 패드 (kb-pad.js)
   kb-corpus.js의 의도·Q&A, kb-dialogues.js의 인사말, kb-dorat-extra.js의 공격 풀이
   모드별로 5개 미만이면 말투에 맞는 문장을 채워 넣는다.
   · clean  : 정중한 모드 문장
   · normal : 적당히 깝치는 반말
   · dorat  : 노필터 쌍욕·팩폭
   로딩 순서: kb-dialogues → kb-corpus → kb-dorat-extra → kb-pad → engine */
(function () {
  "use strict";
  var MIN = 5;

  var PAD = {
    clean: [
      "그렇군요. 조금 더 알려주시면 더 잘 도와드릴게요 \uD83D\uDE0A",
      "이해했어요. 다른 이야기도 들려주세요!",
      "음, 그 부분은 제가 아는 선에서 답해볼게요.",
      "좋아요. 그렇게 생각하실 수도 있겠네요!",
      "확인했어요. 하나씩 차근차근 이야기해봐요.",
      "말씀 감사해요. 더 궁금한 게 있으면 물어봐 주세요.",
      "그렇게 말씀하시니 알겠어요. 편하게 말씀해 주세요!",
      "제가 도울 수 있는 부분이 있으면 말해 주세요.",
      "조금 더 구체적으로 알려주시면 정확하게 답할 수 있어요.",
      "네, 기억해 둘게요. 다음에도 이야기해요!"
    ],
    normal: [
      "그렇다니까 ㅋㅋ 더 얘기해봐",
      "아 그거? 나도 좀 아니까 계속 말해봐라",
      "흠, 그건 그럴 수도 있지. 근데 나는 다르게 봐",
      "말은 알겠다. 다음엔 좀 더 구체적으로 와라 ㅋ",
      "그래서 결론이 뭐냐? ㅋㅋ",
      "지금 그 말 듣고 좀 웃었다. 계속 해봐",
      "그건 좀 애매한데? 다시 말해봐",
      "아 그 얘기면 나도 할 말 있다 ㅋㅋ",
      "받아들였다. 근데 내 의견은 또 다르다",
      "그렇게 말하면 나도 진지해지잖아 ㅋㅋ"
    ],
    dorat: [
      "그래서 어쩌라고. 시발 더 말해봐.",
      "그 소리밖에 안 나오냐. 입 다물고 다시 와라, 병신아.",
      "아 그래? 그럼 지금 네가 지고 있다는 건 알겠냐 ㅋㅋ",
      "말은 많은데 머리는 쉬고 있네. 시발.",
      "그 정도로 나를 흔들려고? 웃기지도 않는다.",
      "네 그 입, 관리 좀 해라. 사람 말이 안 나오잖아, 씹.",
      "그 말 하고 나면 남는 게 없다. 다음엔 제대로 와라, 븅신아.",
      "봐줄 생각 없으니까 계속 지껄여봐라 ㅋㅋ",
      "그 논리로는 아무도 못 이긴다. 시발 생각 좀 해라.",
      "지금 이 대화에서 네가 얻는 건 욕 하나뿐이다. 병신아."
    ],
    dorat_pure: [
      "그래서 어쩌라고. 시발 더 말해봐.",
      "그 소리밖에 안 나오냐. 입 다물고 다시 와라, 병신아.",
      "말은 많은데 머리는 쉬고 있네. 시발.",
      "그 말 하고 나면 남는 게 없다. 다음엔 제대로 와라, 븅신아.",
      "봐줄 생각 없으니까 계속 지껄여봐라 ㅋㅋ",
      "지금 이 대화에서 네가 얻는 건 욕 하나뿐이다. 병신아."
    ],
    dorat_crazy: [
      "그래서 어쩌라고. 시발 더 말해봐.",
      "그 소리밖에 안 나오냐. 입 다물고 다시 와라, 병신아.",
      "말은 많은데 머리는 쉬고 있네. 시발.",
      "그 말 하고 나면 남는 게 없다. 다음엔 제대로 와라, 븅신아.",
      "봐줘도 안 고쳐지니까 계속 지껄여봐라 ㅋㅋ",
      "지금 이 대화에서 네가 얻는 건 욕 하나뿐이다. 병신아."
    ],
    smart: [
      "정리해서 답해볼게요. 조금만 더 구체적으로 알려주세요.",
      "좋은 질문이에요. 제가 아는 범위에서 설명할게요.",
      "음, 그건 이렇게 보는 게 맞을 것 같아요.",
      "확인해볼게요. 핵심이 무엇인지 먼저 말해 주세요.",
      "제 판단으로는 그렇게 하는 게 좋겠어요.",
      "그 부분은 자료가 더 있으면 정확해져요. 있는 대로 설명할게요.",
      "짧게 정리하면 그렇게 됩니다. 더 필요한 게 있으면 말해 주세요.",
      "답을 세우기 전에 조건 하나만 더 알려주시겠어요?",
      "말씀하신 내용 기준으로는 그게 제일 합리적이에요.",
      "제가 도울 수 있는 범위를 정확히 말씀드릴게요."
    ]
  };

  function arr(x) {
    return Object.prototype.toString.call(x) === "[object Array]" ? x : null;
  }

  function padList(list, mode) {
    if (!arr(list)) return 0;
    var src = PAD[mode] || PAD.normal;
    var added = 0, i = 0;
    while (list.length < MIN && i < src.length) {
      if (list.indexOf(src[i]) < 0) {
        list.push(src[i]);
        added++;
      }
      i++;
    }
    return added;
  }

  var added = { intents: 0, pairs: 0, extra: 0, intro: 0 };
  var C = window.DORATI_CORPUS || { intents: [], pairs: [] };
  var modes = ["clean", "normal", "dorat", "dorat_pure", "dorat_crazy", "smart"];

  (C.intents || []).forEach(function (it) {
    var m = it.atk ? ["clean", "normal", "dorat"] : modes;
    m.forEach(function (k) {
      if (k === "smart" && !arr(it.smart)) return;
      if (it.atk && (k === "dorat_pure" || k === "dorat_crazy")) return;
      added.intents += padList(it[k], k);
    });
  });

  (C.pairs || []).forEach(function (p) {
    modes.forEach(function (k) {
      if (k === "smart" && !arr(p.smart)) return;
      added.pairs += padList(p[k], k);
    });
  });

  var KB = window.DORATI_KB || {};
  if (KB.intro) {
    modes.forEach(function (k) {
      if (KB.intro[k]) added.intro += padList(KB.intro[k], k);
    });
  }
  ["askBack", "modeNotice"].forEach(function (key) {
    var bag = KB[key];
    if (!bag || arr(bag)) return;
  });
  if (KB.askBack) {
    modes.forEach(function (k) {
      if (arr(KB.askBack[k])) added.intro += padList(KB.askBack[k], k);
    });
  }

  window.DORATI_PAD = { added: added, min: MIN };
})();

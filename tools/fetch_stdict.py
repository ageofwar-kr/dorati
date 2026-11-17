#!/usr/bin/env python3
"""국립국어원 표준국어대사전 OpenAPI로 앱 내장 사전 번들을 만든다.
- 단어: 일상 어휘 목록 → 정확 검색
- 속담/관용구: 키워드 포함 검색(type1=proverb/idiom, method=include, num=100)으로 대량 수집
결과: dorati/data/dict/*.json + dorati/data/index.json
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ.get("STDICT_KEY", "845290714BAC21BB3B5C2A0880ACE8E3")
API = "https://stdict.korean.go.kr/api/search.do"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data")
UA = {"User-Agent": "dorati-kb/1.0"}


def call(params, retries=3):
    p = {"key": KEY, "req_type": "json"}
    p.update(params)
    url = API + "?" + urllib.parse.urlencode(p)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = json.loads(r.read().decode("utf-8", "replace"))
            ch = data.get("channel") or {}
            items = ch.get("item") or []
            if isinstance(items, dict):
                items = [items]
            return items
        except Exception:
            if attempt == retries - 1:
                return []
            time.sleep(1.2 * (attempt + 1))
    return []


RARE = re.compile(r"(조선 시대|고려 시대|불교|유학|은어|옛말|방언|북한|어근|인명|지명|한의학|민속|사찰|승려|유생|과거 시험|품계|벼슬|관직)")


def flatten(items):
    out = []
    for it in items:
        w = (it.get("word") or "").strip()
        if not w:
            continue
        s = it.get("sense") or {}
        if isinstance(s, list):
            s = s[0] if s else {}
        d = (s.get("definition") or "").strip()
        if not d:
            continue
        out.append({
            "w": w,
            "p": it.get("pos") or "",
            "d": re.sub(r"\s+", " ", d)[:320],
            "o": (it.get("origin") or "").strip()[:20],
            "_rare": 1 if RARE.search(d) else 0,
        })
    out.sort(key=lambda e: e["_rare"])
    for e in out:
        e.pop("_rare", None)
    return out


def shard_key(word):
    c = word[0]
    if "가" <= c <= "힣":
        table = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ",
                 "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]
        idx = (ord(c) - 0xAC00) // 588
        return table[idx] if 0 <= idx < len(table) else "기타"
    if re.match(r"[a-zA-Z]", c):
        return "abc"
    if re.match(r"[0-9]", c):
        return "num"
    return "기타"


WORDS = """
사람 인간 남자 여자 어른 아이 어린이 청소년 노인 친구 동무 동료 선배 후배 손님 주인 이웃
가족 엄마 아빠 어머니 아버지 부모 형 누나 언니 오빠 동생 아들 딸 손자 할머니 할아버지 삼촌 이모 고모 사촌
학교 회사 가게 시장 병원 약국 은행 도서관 공원 운동장 교실 사무실 방 집 건물 아파트 마을 도시 시골 나라 세계
아침 점심 저녁 밤 낮 새벽 오전 오후 정오 시간 분 초 하루 주 달 해 년 오늘 내일 어제 모레 지난주 다음주
봄 여름 가을 겨울 장마 더위 추위 날씨 하늘 땅 바다 강 산 호수 숲 들판 논 밭 길 다리 골목 계단
해 달 별 구름 비 눈 바람 안개 이슬 서리 번개 천둥 무지개 태양 달빛 햇빛 그늘
나무 꽃 풀 잎 뿌리 열매 씨앗 숲속 정원 공기 물 불 흙 돌 모래 불꽃 연기 재
개 고양이 강아지 송아지 망아지 새 병아리 참새 까치 비둘기 독수리 물고기 고래 상어 조개 게 새우 거북 뱀 개구리 벌레 개미 벌 나비 잠자리 거미 쥐 토끼 사슴 여우 늑대 곰 호랑이 사자 코끼리 원숭이 말 소 돼지 양 염소 닭 오리 거위
머리 얼굴 이마 눈썹 눈 코 입 귀 볼 뺨 턱 목 어깨 가슴 등 배 허리 팔 손 손가락 손톱 다리 발 발가락 무릎 발목 피 뼈 살 피부 심장 뇌 위 폐 간
밥 국 죽 반찬 찌개 전골 김치 나물 무침 구이 볶음 튀김 만두 떡 빵 과자 사탕 초콜릿 아이스크림 라면 국수 수프 샐러드 스프
사과 배 감 귤 오렌지 포도 수박 참외 딸기 바나나 복숭아 자두 살구 체리 키위 망고 파인애플 토마토 감자 고구마 당근 양파 마늘 고추 오이 호박 시금치 배추 무 콩 팥 쌀 보리 밀 옥수수
물 우유 커피 녹차 홍차 주스 탄산수 맥주 소주 막걸리 와인 술 음료 차
옷 바지 치마 셔츠 티셔츠 재킷 코트 점퍼 조끼 양말 신발 운동화 구두 모자 안경 목걸이 반지 시계 가방 지갑 우산 장갑 목도리
책 공책 노트 연필 볼펜 지우개 자 가위 풀 종이 봉투 상자 칠판 책상 의자 침대 소파 옷장 냉장고 세탁기 텔레비전 냉장고 에어컨 선풍기 전등 전기 컴퓨터 노트북 휴대전화 전화기 카메라 스피커 마우스 키보드 화면 충전기 이어폰
돈 동전 지폐 지갑 계좌 카드 월급 용돈 가격 값 세금 영수증 쿠폰 할인 거스름돈
사랑 우정 애정 그리움 미움 두려움 기쁨 슬픔 분노 짜증 걱정 불안 설렘 행복 불행 희망 절망 용기 자존심 부끄러움 감사 미안함 외로움
생각 마음 기분 감정 느낌 뜻 의미 기억 꿈 목표 계획 약속 거짓말 진실 실수 착각 선택 결정
공부 시험 숙제 수업 선생님 학생 친구 학교 급식 방학 개학 졸업 입학 성적 점수 문제 정답 오답 질문 대답 설명
일 직장 회사 상사 부하 직원 동료 회의 보고서 업무 출장 야근 월급 휴가 출근 퇴근 알바 아르바이트
게임 영화 드라마 음악 노래 그림 사진 만화 소설 시 동화 춤 연극 콘서트 축제 운동 축구 야구 농구 배구 수영 달리기 등산 자전거
버스 지하철 기차 비행기 자동차 택시 자전거 오토바이 배 선박 트럭 자전거 정류장 역 공항 터미널 주차장
사전 단어 낱말 문장 글 편지 일기 이야기 소식 뉴스 광고 인터넷 검색 사이트 앱 프로그램 파일 사진 동영상
아프다 건강 병원 의사 간호사 약 처방 진찰 수술 치료 예방 접종 열 기침 감기 두통 복통
크다 작다 많다 적다 높다 낮다 길다 짧다 넓다 좁다 깊다 얕다 무겁다 가볍다 두껍다 얇다
빠르다 느리다 밝다 어둡다 뜨겁다 차갑다 따뜻하다 시원하다 맑다 흐리다 깨끗하다 더럽다
좋다 나쁘다 예쁘다 밉다 귀엽다 멋있다 멋없다 재미있다 재미없다 신나다 심심하다
쉽다 어렵다 단순하다 복잡하다 새롭다 낡다 오래되다 젊다 늙다 강하다 약하다 튼튼하다 약하다
기쁘다 슬프다 화나다 무섭다 놀랍다 부럽다 창피하다 부끄럽다 외롭다 그립다 그렇다 이렇다
배고프다 배부르다 졸리다 피곤하다 아프다 편하다 불편하다 바쁘다 한가하다 조용하다 시끄럽다
가다 오다 보다 듣다 말하다 읽다 쓰다 먹다 마시다 자다 깨다 앉다 서다 걷다 뛰다 놀다 쉬다
사다 팔다 주다 받다 열다 닫다 켜다 끄다 씻다 입다 벗다 신다 벗다 만지다 던지다 잡다 놓다
만들다 고치다 부수다 자르다 붙이다 떼다 넣다 빼다 올리다 내리다 들다 내려놓다
웃다 울다 부르다 대답하다 묻다 알려주다 가르치다 배우다 생각하다 알다 모르다 기억하다 잊다
사랑하다 좋아하다 싫어하다 미워하다 기다리다 만나다 헤어지다 도와주다 부탁하다 사과하다 용서하다
일하다 쉬다 시작하다 끝내다 계속하다 멈추다 준비하다 정리하다 청소하다 빨래하다 요리하다
걱정하다 축하하다 감사하다 미안하다 반갑다 고맙다 즐겁다 행복하다
아주 매우 정말 참 많이 조금 약간 너무 거의 모두 함께 같이 혼자 빨리 천천히 자주 가끔 항상 다시 벌써 아직 이미
오늘 내일 어제 지금 아까 나중 곧 먼저 마지막 처음 다음 이전 위 아래 앞 뒤 옆 안 밖 왼쪽 오른쪽
하나 둘 셋 넷 다섯 열 스물 백 천 만 일 이 삼 사 오 육 칠 팔 구 십
아이디어 문제 해결 방법 이유 결과 원인 목적 조건 환경 사회 문화 역사 정치 경제 교육 과학 기술 예술 종교 법 규칙 약속
사전 뜻 표제어 품사 발음 어원 관용구 속담 문장 대화 질문 대답 인사 칭찬 격려 위로 농담 장난
""".split()

PROVERB_KEYS = """
개 소 말 고양이 쥐 닭 돼지 호랑이 곰 토끼 뱀 새 까치 참새
밥 국 죽 떡 김치 나물 고기 생선 알 콩 팥 쌀 보리
눈 코 입 귀 손 발 다리 배 머리 얼굴 목 어깨
물 불 돌 나무 꽃 풀 잎 뿌리 산 강 바다 하늘 땅 비 바람 구름
돈 재물 쌀가마니 빚 논 밭 마을 길 다리 집 문 방 구들
사람 친구 이웃 부모 자식 형제 부부 손님 도둑 선비 중 농부
아침 저녁 낮 밤 봄 여름 가을 겨울 세월
말 글 소리 노래 웃음 눈물
""".split()

IDIOM_KEYS = """
가슴 눈 코 입 귀 손 발 다리 배 머리 얼굴 목 어깨 엉덩이
물 불 돌 나무 밥 국 죽 떡 김치 고기 생선 알 콩
돈 발등 발길 발목 손끝 손바닥 손등 이마 볼
""".split()


def collect_phrases(keys, type1, pages=2, num=100, cache_obj=None):
    got = dict(cache_obj or {})
    def work(k):
        res = {}
        for p in range(pages):
            items = call({"q": k, "type1": type1, "advanced": "y", "method": "include",
                          "num": num, "start": 1 + p * num})
            for e in flatten(items):
                res.setdefault(e["w"], e)
        return res
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, res in enumerate(ex.map(work, keys)):
            got.update(res)
            if i % 10 == 0:
                print(f"  {type1} key {i}/{len(keys)} → {len(got)}", file=sys.stderr)
    return got


CACHE_F = os.path.join(HERE, ".cache_stdict.json")


def load_cache():
    try:
        return json.load(open(CACHE_F, encoding="utf-8"))
    except Exception:
        return {"words": {}, "phrases": {}}


def save_cache(c):
    with open(CACHE_F, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)


def main():
    os.makedirs(os.path.join(OUT, "dict"), exist_ok=True)
    limit = int(os.environ.get("MAXN", "0"))
    cache = load_cache()
    cw = cache.setdefault("words", {})
    cp = cache.setdefault("phrases", {})

    words = sorted(set(w for w in WORDS if re.fullmatch(r"[가-힣]{1,12}", w)))
    print(f"단어 {len(words)}개 조회 시작", file=sys.stderr)

    def work(w):
        items = call({"q": w, "num": 10})
        res = [e for e in flatten(items) if e["w"] == w]
        if not res:
            return w, None
        first = dict(res[0])
        extra = [e["d"] for e in res[1:3]]
        if extra:
            first["d2"] = extra[0]
        if len(extra) > 1:
            first["d3"] = extra[1]
        return w, first

    todo = [w for w in words if w not in cw]
    if os.environ.get("BUILD"):
        todo = []
    if limit:
        todo = todo[:limit]
    print(f"  남은 단어 {len(todo)} / 전체 {len(words)}", file=sys.stderr)
    entries = dict(cw)
    with ThreadPoolExecutor(max_workers=8) as ex:
        for i, (w, e) in enumerate(ex.map(work, todo)):
            cw[w] = e
            if i % 40 == 0:
                save_cache(cache)
                print(f"  word {i}/{len(todo)} hit={len(entries)}", file=sys.stderr)
    save_cache(cache)
    if len(cw) < len(words) and not os.environ.get("BUILD"):
        print(json.dumps({"partial": True, "done": len(cw), "total": len(words)}, ensure_ascii=False))
        return

    prov = cp.get("proverb") or {}
    idiom = cp.get("idiom") or {}
    if not prov:
        prov = collect_phrases(PROVERB_KEYS, "proverb")
        cp["proverb"] = prov
        save_cache(cache)
    if not idiom:
        idiom = collect_phrases(IDIOM_KEYS, "idiom")
        cp["idiom"] = idiom
        save_cache(cache)

    shards = {}
    for w, e in entries.items():
        if not e:
            continue
        shards.setdefault(shard_key(w), {})[w] = e
    s_shards = {}
    for w, e in list(prov.items()) + list(idiom.items()):
        s_shards.setdefault(shard_key(w), {})[w] = e

    index = {"words": {}, "proverbs": {}}
    for k, v in shards.items():
        fn = f"dict/w-{k}.json"
        with open(os.path.join(OUT, fn), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, separators=(",", ":"))
        index["words"][k] = {"file": fn, "n": len(v)}
    for k, v in s_shards.items():
        fn = f"dict/s-{k}.json"
        with open(os.path.join(OUT, fn), "w", encoding="utf-8") as f:
            json.dump(v, f, ensure_ascii=False, separators=(",", ":"))
        index["proverbs"][k] = {"file": fn, "n": len(v)}
    index["total"] = len(shards) + len(s_shards)
    index["source"] = "국립국어원 표준국어대사전 OpenAPI"
    index["built"] = time.strftime("%Y-%m-%d")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    print(json.dumps({"words": sum(len(v) for v in shards.values()), "proverbs": len(prov), "idioms": len(idiom),
                      "shards": len(shards) + len(s_shards)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

/* 설정 — 공용 DB / 사전 연결 */
window.DORATI_CONFIG = {
  version: "v1.0",
  /* 공용 학습 DB (Firebase Realtime Database, 싱가포르) */
  dbUrl: "https://dorati-99953-default-rtdb.asia-southeast1.firebasedatabase.app",
  /* 국립국어원 표준국어대사전 OpenAPI 중계 (CORS 우회). 살아있으면 이 주소를 먼저 쓴다. */
  dictProxy: "",
  /* 중계가 없을 때: 공용 DB 요청 큐(/dictreq) → 응답(/dict) 방식 */
  dictRelay: true,
  dictRelayWaitMs: 9000,
  /* 공용 DB 갱신: 실시간 스트림 + 백업 폴링 */
  pollMs: 45000,
  version_check: "1.0.0"
};

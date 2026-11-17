/* 설정 — 공용 DB / 사전 / 제미나이 중계 연결 */
window.DORATI_CONFIG = {
  version: "v1.9",
  /* 공용 학습 DB (Firebase Realtime Database, 싱가포르) */
  dbUrl: "https://dorati-99953-default-rtdb.asia-southeast1.firebasedatabase.app",
  /* 국립국어원 표준국어대사전 OpenAPI 중계 (CORS 우회). 살아있으면 이 주소를 먼저 쓴다. */
  dictProxy: "",
  /* 중계가 없을 때: 공용 DB 요청 큐(/dictreq) → 응답(/dict) 방식 */
  dictRelay: true,
  dictRelayWaitMs: 9000,
  /* 공용 DB 갱신: 실시간 스트림 + 백업 폴링 */
  pollMs: 45000,
  /* 똑똑이 모드 — 구글 Apps Script 중계 서버(공개 URL). API 키는 서버(Script Properties)에만 있다. */
  smartProxy: "https://script.google.com/macros/s/AKfycbwnHX4qyLBYiK5Eg4kK6t31n1gZ3a9995VuxufJn3moUz85wZXYZ-SZJh1IuSZtJUG8/exec",
  smartDefaultModel: "gemini-3.8-flash",
  version_check: "1.9.0"
};

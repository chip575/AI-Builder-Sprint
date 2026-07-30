# M0 API — "말이 서명이 된다"

발화 → 구조화 → 확인 → 게이트 → 문서 → 서명 → 웹훅 → 증빙.

`(m0)`는 **라우트 그룹**이라 URL에 나타나지 않는다 —
`app/api/(m0)/session/message` → `/api/session/message`.
층을 파일 트리에서 보이게 하되 주소는 그대로 두기 위한 것이다.

| 폴더 | FR |
|---|---|
| `session/` | FR-101·110·115B 축 대화 + Express 판정 |
| `extract/` | FR-102 구조화 추출 |
| `facts/` | FR-103 확인·편집·**확정**(P1의 유일한 해제 지점) |
| `documents/` | FR-501 초안 + 게이트 서버 차단 |
| `sign/` | FR-501·502 서명 요청·상태 폴링 |
| `webhooks/` | FR-503 멱등 수신 + 아웃박스 |
| `evidence/` | FR-505 증빙·15분 만료 URL |
| `rewards/` | FR-203 답례품 한도 |
| `auth/` | Supabase Auth 위임 |
| `dev/` | NFR-707 mock 도구 (webhook-sim 등) |

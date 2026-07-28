# 시작하기 — VS Code에서 바로 실행

## 1. 배치

이 폴더 내용을 레포 루트에 그대로 복사한다.

```
CLAUDE.md              ← Claude Code가 매 세션 자동 로드
AGENTS.md              ← 팀 공통 규칙 (Codex도 읽음)
START-HERE.md          ← 이 파일
package.json.snippet   ← 기존 package.json에 scripts 병합
.claude/
  agents/{impl-worker,constitution-gate,contract-owner}.md
  scripts/{gate-check,check-ownership,update-manifest}.sh
  settings.json        ← 훅
spec/
  manifest.yaml        ← 오케스트레이터는 이것만 읽는다
  00-constitution.md · 00.1-rules.md · 00.2-glossary.md · 01.0-index.md · 03.0-mvp.md
  fr/01.1 ~ 01.7
  plan/02.1.1 · 02.3 · 02.4 · 02.5
  _archive/            ← 폐기. CLAUDE.md에서 참조 금지 선언됨
docs/
  decisions.md         ← ClickUp에 없는 결정 이력 16건. 먼저 읽을 것
  ai-usage.md          ← SDD·에이전트 하네스 = AI 활용 근거 정리
  주제-통합정리본.md      ← 명세 15개를 읽는 순서로 합친 단일 문서 (공유·검토용)
  ai-log.md            ← 매일 한 줄
```

## 2. 실행 권한

```bash
chmod +x .claude/scripts/*.sh
```

## 3. package.json에 추가

```json
"scripts": {
  "gate:check": "bash .claude/scripts/gate-check.sh"
}
```

## 4. 첫 검증

```bash
pnpm gate:check
```

레포가 비어 있으면 tsc는 건너뛰고 나머지 7개 검사가 돈다. 전부 PASS여야 정상.

## 5. 첫 작업 — 계약 코드화

```
Claude Code에서:

spec/plan/02.4-contracts.md의 manifest.yaml의 24개 모듈를 lib/contracts/*.ts로 옮긴다.
모듈별로 파일을 나누고, in/out 타입을 Zod 스키마로 정의한다.
공통 envelope({ok:true,data} / {ok:false,error:{code,message,nextAction}})는
lib/contracts/envelope.ts에 둔다.
스키마만 쓴다. 구현·라우트는 만들지 않는다.
```

이게 끝나면 스펙 위반이 `tsc --noEmit`에서 잡히기 시작한다.
**블랙박스에서 벗어나는 지점이 여기다.**

## 6. M0 관통 — 병렬 금지

M0는 대화→구조화→게이트→문서→서명→보관이 직렬 의존이다.
**Opus 단일 세션으로 관통**시킨다 (decisions.md D-14).
그 과정에서 계약이 실전 검증되고 동결된다.

## 7. M1부터 병렬

```bash
git worktree add ../wt-be1 -b feat/be1
git worktree add ../wt-be2 -b feat/be2
git worktree add ../wt-fe  -b feat/fe
```

각 worktree에서 `WORKER_ROLE=be1|be2|fe`를 설정하면 소유 경로 훅이 작동한다.

워커 호출 형식 — **MODULE_ID를 반드시 설정한다** (안 하면 status가 갱신되지 않음):
```bash
export WORKER_ROLE=be2 MODULE_ID=M-RECONCILER
```
```
@impl-worker

manifest 행: M-RECONCILER
계약: lib/contracts/reconcile.ts
FR: spec/plan/02.3-modusign.md
```

완료 후:
```
@constitution-gate
```

## 8. 매일

- `docs/ai-log.md`에 각자 한 줄 (예선 AI 활용도 20점의 증거물)
- Upstage 콘솔 Usage 확인 2회 — **크레딧 소진 후에도 결제수단으로 과금됨**

## 읽는 순서

1. `docs/decisions.md` — 왜 이렇게 설계했는지 16건
2. `spec/manifest.yaml` — 무엇을 만들 것인지 24모듈
3. `spec/plan/02.4-contracts.md` — 입출력 계약
4. 나머지는 필요할 때만

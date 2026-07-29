// Next 기동 훅 — 서버 시작 시 1회 실행된다.
import { logModes } from "./lib/observability/mode";

export function register() {
  logModes();
}

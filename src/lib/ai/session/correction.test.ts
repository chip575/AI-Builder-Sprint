// 잘못 들어간 대화에서 나오는 길 — 쌍으로 잰다 (AGENTS.md 테스트 절)
import { describe, expect, it } from "vitest";
import { detectCorrection } from "./correction";

describe("detectCorrection", () => {
  it("실사용에서 무시당한 부정을 잡는다 (2026-08-03)", () => {
    expect(detectCorrection("아니 세금인데 뭔 고향에 기부야").kind).toBe("CORRECT");
    expect(detectCorrection("아니요 그게 아니라 상속 얘기예요").kind).toBe("CORRECT");
    expect(detectCorrection("기부 말고 유언장 얘기를 하고 싶어요").kind).toBe("CORRECT");
    expect(detectCorrection("왜 자꾸 같은 걸 물어요").kind).toBe("CORRECT");
  });

  it("그만두겠다는 말은 중단이다 — 정정보다 우선한다", () => {
    expect(detectCorrection("그만할래요").kind).toBe("STOP");
    expect(detectCorrection("아니 그만할래요").kind).toBe("STOP"); // 둘 다 걸려도 중단
    expect(detectCorrection("오늘은 안 할래요").kind).toBe("STOP");
  });

  it("보통 대답을 정정으로 오인하지 않는다 — 대화를 방해하면 안 된다", () => {
    // 막는 것만 보면 "전부 잡는 감지"와 구별이 안 된다
    expect(detectCorrection("부산에 500만원 기부하고 싶어요").kind).toBe("NONE");
    expect(detectCorrection("네 그렇게 해주세요").kind).toBe("NONE");
    expect(detectCorrection("어머니께 남기고 싶습니다").kind).toBe("NONE");
    expect(detectCorrection("아버지가 물려주신 땅이 있어요").kind).toBe("NONE");
    expect(detectCorrection("유언장은 어떻게 쓰나요?").kind).toBe("NONE");
  });
});

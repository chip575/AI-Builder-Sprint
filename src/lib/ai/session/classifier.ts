// 안내 분류기 어댑터 선택 — responder.ts와 같은 모양이다 (NFR-707).
//
// mock에서는 **항상 null**이라 규칙만으로 판정하던 때와 똑같이 동작한다.
// 그래서 유닛테스트는 결정론을 유지하고, real에서만 유연성이 붙는다.
import {
  MockGuideClassifier,
  SolarGuideClassifier,
  type GuideClassifierPort,
} from "./guide-classifier";

const mode = process.env.UPSTAGE_MODE ?? "mock";

function realClassifier(): GuideClassifierPort {
  const apiKey = process.env.UPSTAGE_API_KEY;
  // ⚠ 키가 없으면 **분류기만** 꺼진다. 여기서 던지면 안내 한 줄 때문에 대화가 죽는다 —
  //   응답기(responder)와 다른 판단이다. 저쪽은 없으면 대화 자체가 불가능하다.
  if (!apiKey) return new MockGuideClassifier();
  return new SolarGuideClassifier({ apiKey });
}

export const guideClassifier: GuideClassifierPort =
  mode === "real" ? realClassifier() : new MockGuideClassifier();

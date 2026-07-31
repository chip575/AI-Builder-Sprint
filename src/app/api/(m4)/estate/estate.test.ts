// M-ESTATE 인벤토리 테스트 (FR-401 · FR-402 · FR-404)
// 픽스처는 전량 가상이다 — 실존 인물·실계좌 패턴 금지 (보안 4조).
//
// 이 스위트가 지키는 것은 기능이 아니라 경계다:
//   비워둘 수 없는 것(디지털 처리 지시), 확정되지 않는 것(판독값),
//   합쳐지지 않는 것(금액 미상), 남지 않는 것(식별번호 원문).
import { describe, expect, it } from "vitest";
import { DEV_USER_ID, store } from "@/lib/store";
import { maskIdentifier } from "@/lib/store/mask";
import { CONFIRM_THRESHOLD } from "@/lib/ai/extract/confidence";
import type { Asset, InventoryRes } from "@/lib/contracts";
import { getOrCreateSession } from "@/lib/ai/session/store";
import { POST as uploadPost } from "@/app/api/(m1)/paper-scan/upload/route";
import { GET as assetsGet, POST as assetsPost } from "./assets/route";
import { POST as scanPost } from "./assets/scan/route";
import { POST as beneficiariesPost } from "./beneficiaries/route";
import { summarize } from "./inventory";

const json = (handler: (r: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const addAsset = (body: unknown) => json(assetsPost, "/api/estate/assets", body);

async function inventory(): Promise<InventoryRes> {
  const res = await assetsGet(new Request("http://localhost/api/estate/assets"));
  return (await res.json()).data;
}

const rollup = (inv: InventoryRes, category: string) =>
  inv.summary.byCategory.find((c) => c.category === category);

/** 판독할 사진 한 장 — 업로드 경로도 M-PAPER-SCAN 것을 그대로 쓴다 */
async function uploadPhoto() {
  const session = await getOrCreateSession();
  const form = new FormData();
  form.append("intentId", session.id);
  form.append("transferConsent", "true");
  form.append("file", new File([new Uint8Array(32)], "가상-통장사본.png", { type: "image/png" }));
  const res = await uploadPost(
    new Request("http://localhost/api/paper-scan/upload", { method: "POST", body: form }),
  );
  return (await res.json()).data.uploadId as string;
}

describe("M-ESTATE — 디지털 자산은 처리 지시를 비워둘 수 없다 (FR-403)", () => {
  it("disposition 없이 저장하면 계약 파싱에서 거부된다", async () => {
    const res = await addAsset({ category: "DIGITAL", label: "구독 계정" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DISPOSITION_REQUIRED");
    // 기술 오류 코드를 그대로 노출하지 않는다 (NFR-705)
    expect(body.error.nextAction).toContain("골라");
  });

  it("처리 지시가 있으면 저장된다 — 전부 막는 검사가 아니다", async () => {
    const res = await addAsset({
      category: "DIGITAL",
      label: "사진 클라우드",
      disposition: { action: "PRESERVE", note: "아이들이 보게 두고 싶어요" },
    });
    expect(res.status).toBe(201);
    const inv: InventoryRes = (await res.json()).data;
    const saved = inv.assets.find((a) => a.label === "사진 클라우드");
    expect(saved?.category).toBe("DIGITAL");
    expect((saved as Extract<Asset, { category: "DIGITAL" }>).disposition.action).toBe("PRESERVE");
  });

  it("이전(TRANSFER) 대상이 남의 명부에 있으면 거부된다 (D-18 소유 필터)", async () => {
    const res = await addAsset({
      category: "DIGITAL",
      label: "메일 계정",
      disposition: {
        action: "TRANSFER",
        toBeneficiaryId: "00000000-0000-4000-8000-00000000ffff",
      },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("UNKNOWN_BENEFICIARY");
  });
});

describe("M-ESTATE — 판독값은 확정되지 않는다 (FR-401 · P1)", () => {
  it("OCR로 적재한 자산은 confirmed=false로 시작한다", async () => {
    const uploadId = await uploadPhoto();
    const res = await json(scanPost, "/api/estate/assets/scan", {
      category: "FINANCIAL",
      label: "", // 판독이 채우게 둔다
      sourceUploadId: uploadId,
    });
    expect(res.status).toBe(201);

    const inv: InventoryRes = (await res.json()).data;
    const scanned = inv.assets.filter((a) => a.origin === "OCR");
    expect(scanned.length).toBeGreaterThan(0);
    expect(scanned.every((a) => a.confirmed === false)).toBe(true);
    // 확인 유도 대상으로 집계된다 — 미확인인 채로 조용히 묻히지 않는다
    expect(inv.summary.unconfirmedCount).toBeGreaterThan(0);
    expect(inv.summary.lowConfidenceCount).toBeGreaterThan(0);
    expect(scanned.every((a) => (a.confidence ?? 1) < CONFIRM_THRESHOLD)).toBe(true);
  });

  it("본인이 직접 쓴 값은 그 입력 자체가 확인이다 — 미확인으로 쌓이지 않는다", async () => {
    const res = await addAsset({ category: "BELONGINGS", label: "아버지 만년필" });
    const inv: InventoryRes = (await res.json()).data;
    const manual = inv.assets.find((a) => a.label === "아버지 만년필");
    expect(manual?.origin).toBe("MANUAL");
    expect(manual?.confirmed).toBe(true);
    expect(manual?.confidence).toBeNull(); // 사람이 쓴 값에 신뢰도를 붙이지 않는다
  });

  it("사진이 없으면 판독하지 않는다", async () => {
    const res = await json(scanPost, "/api/estate/assets/scan", {
      category: "FINANCIAL",
      label: "어느 통장",
      sourceUploadId: "00000000-0000-4000-8000-0000000000aa",
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("UPLOAD_EXPIRED");
  });
});

describe("M-ESTATE — 금액 미상은 합계를 만들지 않는다 (FR-402)", () => {
  it("한 건이라도 금액이 없으면 그 카테고리 합계는 null이다", async () => {
    await addAsset({ category: "SECURITIES", label: "증권 계좌 A", estimatedValueKrw: 5_000_000 });
    let inv = await inventory();
    expect(rollup(inv, "SECURITIES")?.estimatedTotalKrw).toBe(5_000_000);

    // 금액을 모르는 한 건이 섞인다 — 부분 합계를 전체인 척 보여주지 않는다
    await addAsset({ category: "SECURITIES", label: "증권 계좌 B" });
    inv = await inventory();
    expect(rollup(inv, "SECURITIES")?.count).toBe(2);
    expect(rollup(inv, "SECURITIES")?.estimatedTotalKrw).toBeNull();
  });

  it("집계 규칙은 순수 함수로도 같다 — 카테고리는 계약 순서로 나온다", () => {
    const asset = (over: Partial<Asset>) =>
      ({
        id: "00000000-0000-4000-8000-00000000000a",
        label: "x",
        maskedIdentifier: null,
        estimatedValueKrw: null,
        origin: "MANUAL",
        confidence: null,
        confirmed: true,
        beneficiaryId: null,
        story: null,
        sourceUploadId: null,
        category: "BELONGINGS",
        ...over,
      }) as Asset;

    const summary = summarize([
      asset({ category: "FINANCIAL", estimatedValueKrw: 1_000 }),
      asset({ category: "FINANCIAL", estimatedValueKrw: 2_000 }),
      asset({ category: "REAL_ESTATE" }),
    ]);
    expect(summary.totalCount).toBe(3);
    // 표시 순서 = AssetCategory 배열 순서 (REAL_ESTATE가 FINANCIAL보다 앞)
    expect(summary.byCategory.map((c) => c.category)).toEqual(["REAL_ESTATE", "FINANCIAL"]);
    expect(summary.byCategory[0]!.estimatedTotalKrw).toBeNull();
    expect(summary.byCategory[1]!.estimatedTotalKrw).toBe(3_000);
    expect(summary.hasDebt).toBe(false);
  });
});

describe("M-ESTATE — 채무도 자산의 한 종류다 (FR-402)", () => {
  it("채무를 등록하면 hasDebt가 참이 된다", async () => {
    const before = await inventory();
    expect(before.summary.hasDebt).toBe(false);

    await addAsset({ category: "DEBT", label: "전세 대출", estimatedValueKrw: 30_000_000 });

    const after = await inventory();
    expect(after.summary.hasDebt).toBe(true);
    expect(rollup(after, "DEBT")?.count).toBe(1);
    // 채무가 있으면 상속 승인·포기 기간을 함께 알린다 (민법 §1019).
    // 수치는 lib/rules가 갖고, 여기서는 **조문이 실려 나오는지**만 본다
    const notice = after.summary.debtNotice ?? [];
    expect(notice).toHaveLength(1);
    expect(notice[0]!.id).toContain("1019");
    // D-day를 계산하지 않는다 — 기산점을 우리가 모른다
    expect(JSON.stringify(notice)).not.toMatch(/D-\d|남은 \d+일/);
  });
});

describe("M-ESTATE — 식별번호 원문은 남지 않는다 (NFR-712)", () => {
  // 가상 계좌번호. 주민등록번호 형식(6-7)을 쓰지 않는다 (보안 1조)
  const RAW = "110-2345-678901";

  it("저장 후 어디에도 원문이 없다 — 마스킹은 저장 계층이 한다", async () => {
    await addAsset({
      category: "FINANCIAL",
      label: "가상은행 예금",
      maskedIdentifier: RAW, // 라우트가 마스킹을 잊어도 저장소가 막는다
      estimatedValueKrw: 1_200_000,
    });

    const stored = await store.listAssets(DEV_USER_ID);
    expect(JSON.stringify(stored)).not.toContain(RAW);

    const saved = stored.find((a) => a.label === "가상은행 예금");
    expect(saved?.maskedIdentifier).toBe("***-****-**8901"); // 뒤 4자리만 남는다
    expect(saved?.maskedIdentifier).not.toContain("2345");

    // 응답 경로에도 원문이 없다
    expect(JSON.stringify(await inventory())).not.toContain(RAW);
  });

  it("마스킹 규칙: 숫자가 4자리 이하면 전부 가린다", () => {
    expect(maskIdentifier("1234")).toBe("****");
    expect(maskIdentifier("계좌 없음")).toBe("계좌 없음"); // 숫자가 없으면 식별번호가 아니다
    expect(maskIdentifier(null)).toBeNull();
    expect(maskIdentifier("   ")).toBeNull();
  });
});

describe("M-ESTATE — 수증자 매핑 (FR-404)", () => {
  it("이유를 적지 않아도 저장된다 — 이유를 대야만 남길 수 있으면 그건 심문이다", async () => {
    const created = await json(beneficiariesPost, "/api/estate/beneficiaries", {
      name: "가상 장녀",
      relation: "장녀",
    });
    expect(created.status).toBe(201);
    const beneficiary = (await created.json()).data;

    const res = await addAsset({
      category: "BELONGINGS",
      label: "어머니 반지",
      beneficiaryId: beneficiary.id,
    });
    expect(res.status).toBe(201);

    const inv: InventoryRes = (await res.json()).data;
    const saved = inv.assets.find((a) => a.label === "어머니 반지");
    expect(saved?.beneficiaryId).toBe(beneficiary.id);
    expect(saved?.story ?? null).toBeNull();
    expect(inv.beneficiaries.some((b) => b.id === beneficiary.id)).toBe(true);
    // 명부에 연락처가 없다 — 통지가 필요하면 recipientId로 참조한다 (NFR-714 1조)
    expect(Object.keys(inv.beneficiaries[0]!).sort()).toEqual([
      "id",
      "name",
      "recipientId",
      "relation",
    ]);
  });
});

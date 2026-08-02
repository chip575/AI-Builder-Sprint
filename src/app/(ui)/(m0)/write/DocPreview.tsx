// 작성실의 문서 미리보기 — 대화가 채우는 약정서 양식 (FR-501 전 단계)
//
// ⚠ 이것은 **미리보기**다. 실제 문서는 확정(P1) 뒤 서버가 생성하고,
//   서명은 모두싸인 서식(콘솔 등록본)이 정본이다 — 여기 문안은 그 서식의 요약 구조를 따른다.
// ⚠ 법률 문구·조문은 lib/rules에서 읽는다 (P3). 이 파일은 수치를 만들지 않는다.
import type { ReactNode } from "react";
import { STATUTES } from "@/lib/rules/validity-gate";

export interface PreviewFacts {
  amount?: number | null;
  region?: string | null;
  orgName?: string | null;
}

/** 빈칸 — 채워지기 전의 자리. 값이 오면 강조된 채움으로 바뀐다 */
function Slot({ value, hint }: { value: string | null | undefined; hint: string }) {
  return value ? (
    <mark className="rounded bg-amber-100 px-1 font-medium text-stone-900">{value}</mark>
  ) : (
    <span className="rounded border border-dashed border-stone-400 px-2 text-stone-500">
      {hint}
    </span>
  );
}

const won = (n: number | null | undefined) =>
  typeof n === "number" ? `${n.toLocaleString("ko-KR")}원` : null;

function Article({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="font-serif font-semibold text-stone-900">
        제{no}조({title})
      </h3>
      <p className="leading-relaxed text-stone-700">{children}</p>
    </div>
  );
}

/** 서명란 — 전자서명은 모두싸인이 받는다. 이름 칸을 여기서 받지 않는 이유다 */
function SignatureBlock({ partyLabel }: { partyLabel: string }) {
  return (
    <div className="mt-6 space-y-2 border-t border-stone-300 pt-4 text-sm text-stone-600">
      <p className="flex items-baseline justify-between">
        <span>{partyLabel}</span>
        <span className="text-stone-500">(전자서명 — 요청 후 모두싸인에서 서명합니다)</span>
      </p>
      <p className="flex items-baseline justify-between">
        <span>기관</span>
        <span className="text-stone-500">(기명날인 — 문서에 인쇄됩니다)</span>
      </p>
    </div>
  );
}

export function DocPreview({
  docType,
  facts,
}: {
  docType: "LEGACY_GIFT_AGREEMENT" | "DONATION_PLEDGE" | "HERITAGE_SUPPORT_PLEDGE";
  facts: PreviewFacts;
}) {
  const s562 = STATUTES.CIVIL_562;
  const s1112 = STATUTES.CIVIL_1112;

  return (
    <div className="rounded-2xl border border-stone-300 bg-white p-6 shadow-sm">
      <p className="mb-4 text-xs text-stone-500">
        미리보기 — 확정하시기 전까지 아무것도 정해지지 않습니다
      </p>

      {docType === "HERITAGE_SUPPORT_PLEDGE" ? (
        <div className="space-y-5">
          <h2 className="text-center font-serif text-2xl font-semibold tracking-widest text-stone-900">
            문화유산 후원 약정서
          </h2>
          <p className="leading-relaxed text-stone-700">
            후원자(이하 “후원자”)와 기관(이하 “기관”)은 문화유산의 보존을 위하여
            다음과 같이 약정을 체결한다.
          </p>
          <Article no={1} title="후원 대상">
            후원자는 <Slot value={facts.orgName} hint="후원할 곳" /> 이(가) 지키는
            문화유산의 보존을 후원한다.
          </Article>
          <Article no={2} title="후원 금액">
            후원자는 금 <Slot value={won(facts.amount)} hint="금액" /> 을 후원한다.
          </Article>
          <Article no={3} title="용도">
            후원금은 문화유산의 보존·관리 목적 외에 사용하지 아니한다.
          </Article>
          <Article no={4} title="철회">
            후원자는 체결 전 언제든지 약정을 중단할 수 있다.
          </Article>
          <SignatureBlock partyLabel="후원자" />
        </div>
      ) : docType === "LEGACY_GIFT_AGREEMENT" ? (
        <div className="space-y-5">
          <h2 className="text-center font-serif text-2xl font-semibold tracking-widest text-stone-900">
            유산 기부 약정서
          </h2>
          <p className="leading-relaxed text-stone-700">
            기부자(이하 “기부자”)와 아래 수증 기관(이하 “기관”)은 기부자가 남기려는
            뜻에 따라 다음과 같이 약정한다.
          </p>
          <Article no={1} title="당사자">
            기관: <Slot value={facts.orgName} hint="받으실 곳" />
            {facts.region ? <> (지역: <Slot value={facts.region} hint="지역" />)</> : null}
          </Article>
          <Article no={2} title="기부 재산">
            기부자는 금 <Slot value={won(facts.amount)} hint="금액" /> 을 기관에 증여한다.
          </Article>
          <Article no={3} title="효력 발생">
            이 약정은 기부자의 사망으로 효력이 생기는 증여(사인증여)로 한다.
          </Article>
          {/* 법률어를 문장 앞에 세우지 않는다 — "상속인·유류분"만 보이면 무슨 말인지
              모른 채 서명하게 된다. 쉬운 말이 본문, 조문 원문은 아래 근거 줄에 있다 */}
          <Article no={4} title="가족의 몫에 관한 안내">
            법은 남은 가족(배우자·자녀 등)에게 최소한의 상속 몫을 보장한다 — 이를
            유류분이라 한다. 이 약정으로 남기는 재산이 그 몫과 겹칠 수 있다는 것을,
            기관은 약정 전에 기부자에게 안내하였다.
          </Article>
          <Article no={5} title="변경과 철회">
            기부자는 생전에 언제든지 이 약정을 변경하거나 철회할 수 있다.
          </Article>
          {/* 근거 조문 — 갱신일자와 함께 (P3) */}
          <p className="text-xs leading-relaxed text-stone-500">
            근거: {s562.id} {s562.title} · {s1112.id} {s1112.title} ({s562.verifiedAt} 확인)
          </p>
          <SignatureBlock partyLabel="기부자" />
        </div>
      ) : (
        <div className="space-y-5">
          <h2 className="text-center font-serif text-2xl font-semibold tracking-widest text-stone-900">
            기부 약정서
          </h2>
          <p className="leading-relaxed text-stone-700">
            기부자(이하 “기부자”)와 기관(이하 “기관”)은 기부자의 기부에 관하여 다음과
            같이 약정을 체결한다.
          </p>
          <Article no={1} title="기부처">
            기부자는 <Slot value={facts.region} hint="기부하실 지역" /> 을(를) 위한
            기부에 참여한다.
          </Article>
          <Article no={2} title="기부 금액">
            기부자는 금 <Slot value={won(facts.amount)} hint="금액" /> 을 기부한다.
          </Article>
          <Article no={3} title="세액공제 안내">
            공제 예상액은 확정 화면에서 근거 조문·갱신일자와 함께 계산되어 표시된다.
          </Article>
          <Article no={4} title="철회">
            기부자는 체결 전 언제든지 약정을 중단할 수 있다.
          </Article>
          <SignatureBlock partyLabel="기부자" />
        </div>
      )}
    </div>
  );
}

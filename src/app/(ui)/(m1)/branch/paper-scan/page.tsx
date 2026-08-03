// M-PAPER-SCAN 화면 (branch/PaperScanUpload · FR-401 · NFR-711)
//
// 종이로 흩어진 약정을 옮겨 온다. 과제 문제정의의 첫 문장("선한 의지는 구두나
// 종이로 흩어져")을 그대로 구현하는 지점이다.
//
// NFR-711 — 이 화면이 지켜야 하는 것:
//  · 외부 판독 서비스로 **전송된다는 사실을 전송 전에** 알린다
//  · 동의 없이는 업로드 자체를 하지 않는다 (서버도 거부한다)
//  · 식별번호가 보이면 올리기 전에 경고한다
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ErrorNote, Notice, PrimaryButton, Shell } from "@/app/(ui)/_components/Shell";

/** 주민등록번호 형태 — 파일명에 섞여 오는 경우가 실제로 있다 */
const RRN = /\d{6}\s*-\s*\d{7}/;

function PaperScanUpload() {
  const router = useRouter();
  const intentId = useSearchParams().get("intentId");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [rrnWarning, setRrnWarning] = useState(false);
  const [parsed, setParsed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; nextAction: string } | null>(null);

  async function submit() {
    if (!file || !intentId) return;
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.append("file", file);
    form.append("intentId", intentId);
    form.append("transferConsent", String(consent));

    const up = await fetch("/api/paper-scan/upload", { method: "POST", body: form }).then(
      (r) => r.json(),
    );
    if (!up.ok) {
      setBusy(false);
      return setError(up.error);
    }

    const ex = await fetch("/api/paper-scan/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: up.data.uploadId }),
    }).then((r) => r.json());
    setBusy(false);
    if (!ex.ok) return setError(ex.error);

    setParsed(ex.data.parsedText);
  }

  if (!intentId) return <p className="text-stone-500">대화를 먼저 시작해 주세요.</p>;

  return (
    <div className="space-y-5">
      <p className="text-stone-600">
        종이로 받으신 약정서를 사진으로 올리시면, 읽어서 정리해 드릴게요. 손으로 쓰신
        글씨도 읽습니다.
      </p>

      {/* NFR-711 — 전송 전 고지. 동의 체크 위에 둔다 */}
      <Notice>
        올리신 사진은 글자를 읽기 위해 <strong>외부 판독 서비스로 전송</strong>됩니다.
        주민등록번호·계좌번호가 보이는 부분은 가리고 올려 주세요.
      </Notice>

      <label className="flex items-start gap-3 rounded-xl border border-stone-300 bg-white p-4">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 h-5 w-5"
        />
        <span className="text-sm leading-relaxed">
          외부 판독 서비스로 사진이 전송되는 것에 동의합니다. 동의하지 않으시면 직접
          입력하실 수 있어요.
        </span>
      </label>

      <div>
        <label
          htmlFor="paper"
          className="block min-h-11 cursor-pointer rounded-xl border border-dashed border-stone-400 p-6 text-center text-stone-600"
        >
          {file ? file.name : "사진 또는 PDF 선택하기"}
        </label>
        <input
          id="paper"
          type="file"
          accept="image/jpeg,image/png,image/heic,image/tiff,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setRrnWarning(f ? RRN.test(f.name) : false);
            setError(null);
          }}
        />
      </div>

      {rrnWarning && (
        <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900">
          파일 이름에 주민등록번호로 보이는 숫자가 있습니다. 파일명을 바꾸고 사진 속
          식별번호도 가린 뒤 올려 주세요.
        </div>
      )}

      <ErrorNote error={error} />

      <PrimaryButton onClick={() => void submit()} disabled={busy || !file || !consent}>
        {busy ? "읽는 중…" : "올리고 읽기"}
      </PrimaryButton>

      {parsed && (
        <div className="space-y-3">
          <div className="rounded-xl border border-stone-300 bg-white p-4">
            <p className="text-sm text-stone-500">읽은 내용</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm text-stone-800">
              {parsed}
            </pre>
          </div>
          <Notice>
            읽은 값이 맞는지 다음 화면에서 확인해 주세요. 확인하지 않으면 문서가
            만들어지지 않습니다.
          </Notice>
          <PrimaryButton onClick={() => router.push(`/confirm?intentId=${intentId}`)}>
            확인 화면으로
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

export default function PaperScanPage() {
  return (
    // 여기로 오는 문은 "내 유산"의 서류 서랍이다 — 돌아가는 길이 없으면
    // 자산을 등록하러 왔다가 원래 자리로 못 돌아간다 (P4)
    <Shell
      title="종이 약정 남기기"
      fr={["FR-401", "NFR-711"]}
      back={{ href: "/estate", label: "내 유산으로" }}
    >
      <Suspense fallback={<p className="text-stone-500">불러오는 중…</p>}>
        <PaperScanUpload />
      </Suspense>
    </Shell>
  );
}

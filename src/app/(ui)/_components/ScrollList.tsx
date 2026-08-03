// 긴 목록을 접어 두는 틀 — 다섯 줄쯤 보이고 나머지는 굴려서 본다 (P4 · NFR-708)
//
// ⚠ 소유: 화면은 FE 경로다. BE-2가 사람 승인 하에 **새 파일로만** 추가 — 병합 전 FE 리뷰.
//
// 왜 필요한가: 서류·약속·연락처가 쌓이면 화면이 목록으로만 가득 차서, 정작 다음에 할
// 일(버튼)이 화면 밖으로 밀린다. 스무 건이 쌓인 사람에게는 "관리하는 곳"이 아니라
// "쌓여 있는 곳"으로 보인다.
//
// ⚠ **잘라내지 않는다.** 상위 5건만 그리고 나머지를 버리면 사용자는 없어진 줄 안다.
//   전부 그리되 보이는 높이만 제한한다 — 굴리면 다 있다.
// ⚠ 몇 건인지 함께 말한다. 굴려야 더 있다는 것을 모르면 안 굴린다.
"use client";

export function ScrollList({
  count,
  children,
  /** 대략 몇 줄까지 펼쳐 보일지. 항목 높이가 달라 정확한 줄 수는 아니다 */
  rows = 5,
  /** 이 수 이하면 굴림 없이 그대로 편다 — 세 줄짜리 목록에 스크롤바는 방해다 */
  threshold,
}: {
  count: number;
  children: React.ReactNode;
  rows?: number;
  threshold?: number;
}) {
  const limit = threshold ?? rows;
  const scroll = count > limit;

  return (
    <div className="space-y-2">
      {scroll && (
        // 굴려야 더 있다는 것을 알려 준다. 숫자가 없으면 스크롤바를 못 본 사람은
        // 목록이 여기서 끝난 줄 안다
        <p className="text-sm text-stone-500">
          모두 {count}건 — 아래로 굴려 보실 수 있습니다.
        </p>
      )}
      <div
        className={
          scroll
            ? // 안쪽 여백은 스크롤 영역 안에 둔다. 밖에 두면 마지막 항목이 테두리에 붙는다
              "max-h-80 space-y-2 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/50 p-2"
            : "space-y-2"
        }
        // 굴리는 영역은 키보드로도 닿아야 한다 (NFR-708)
        tabIndex={scroll ? 0 : undefined}
        role={scroll ? "group" : undefined}
        aria-label={scroll ? `전체 ${count}건 목록` : undefined}
      >
        {children}
      </div>
    </div>
  );
}

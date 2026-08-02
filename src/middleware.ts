// M-AUTH — 화면 보호. 인증이 가능한 환경에서만 작동한다.
//
// matcher에서 제외하는 것과 이유:
//  · /api/webhooks/**  외부(모두싸인)가 호출한다. 인증은 시크릿 검증이고, 막으면
//                      재시도 폭주가 난다 (FR-503)
//  · /api/cron/**      스케줄러 호출 — 세션이 없다
//  · /api/dev/**       mock 도구 — 키 없는 채점 경로가 여기에 의존한다 (NFR-707)
//  · /api/**  전체     라우트는 각자 getCurrentUserId로 소유 필터를 건다 (D-18).
//                      미들웨어로 일괄 401을 내면 e2e·채점 경로가 통째로 막힌다
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE } from "./lib/auth/session";

export function middleware(req: NextRequest) {
  // 인증 비활성(키 없음) → 통과. 로그인이 벽이 되면 예선 3회 실행이 막힌다 (NFR-707)
  const authAvailable = Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!authAvailable) return NextResponse.next();

  if (req.cookies.get(AUTH_COOKIE)?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/auth";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // 화면만 보호한다. API·정적 자산은 대상이 아니다 (위 주석 참조)
  // /write·/guide — 대화 세션(발화 저장)을 만드는 화면은 /chat과 같은 급으로 보호한다
  matcher: [
    "/chat/:path*",
    "/write/:path*",
    "/estate/:path*",
    // /clm — 남긴 서류를 모아 보는 화면. 내용이 붙기 전에 넣어 둔다:
    // 화면이 채워진 뒤에 보호를 추가하면 그 사이가 공개 구간으로 남는다
    "/clm/:path*",
    // /mypage — 계약서에 인쇄될 개인정보를 다룬다 (NFR-714)
    "/mypage/:path*",
    "/guide/:path*",
    "/confirm/:path*",
    "/rewards/:path*",
    "/doc/:path*",
    "/vault/:path*",
  ],
};

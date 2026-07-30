// 업로드 임시 보관 — 판독 직전까지만 메모리에 둔다.
// 원본 파일 경로·내용을 화면·로그에 출력하지 않는다 (보안 3조).
// 영속 보관(D-10 원본 보존)은 Supabase Storage 연결 시 이 모듈만 교체한다.
import { randomUUID } from "node:crypto";

export interface UploadRecord {
  uploadId: string;
  intentId: string;
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  /** 외부 전송 동의 — 없으면 판독하지 않는다 (NFR-711) */
  transferConsent: boolean;
  createdAt: number;
}

const g = globalThis as unknown as { __namgidaUploads?: Map<string, UploadRecord> };
const uploads = (g.__namgidaUploads ??= new Map<string, UploadRecord>());

/** 임시 보관 유효기간 — 지나면 판독 불가 (원본을 오래 들고 있지 않는다) */
const TTL_MS = 30 * 60 * 1000;

export function putUpload(
  rec: Omit<UploadRecord, "uploadId" | "createdAt">,
): UploadRecord {
  const record: UploadRecord = { ...rec, uploadId: randomUUID(), createdAt: Date.now() };
  uploads.set(record.uploadId, record);
  return record;
}

export function takeUpload(uploadId: string): UploadRecord | undefined {
  const rec = uploads.get(uploadId);
  if (!rec) return undefined;
  if (Date.now() - rec.createdAt > TTL_MS) {
    uploads.delete(uploadId);
    return undefined;
  }
  return rec;
}

/** 판독이 끝나면 원본을 메모리에서 지운다 */
export function dropUpload(uploadId: string): void {
  uploads.delete(uploadId);
}

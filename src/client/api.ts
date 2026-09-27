import type { Location } from '../shared/adventure/document.js';
import type { SourceCredit } from '../shared/portable.js';
import type { CreativeDocument as GameDocument } from '../shared/creative.js';
export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'teacher' | 'student';
  active: boolean;
}
export interface Project {
  local?: boolean;
  deleted?: boolean;
  saveAttempted?: boolean;
  creationKey?: string;
  allowRemix?: boolean;
  source?: SourceCredit | null;
  id: string;
  ownerId: string;
  revision: number;
  updatedAt: number;
  document: GameDocument;
}
export interface Version {
  allowRemix?: boolean;
  source?: SourceCredit | null;
  id: string;
  projectId: string;
  sourceRevision: number;
  document: GameDocument;
  status: 'pending' | 'approved' | 'returned' | 'withdrawn';
  reviewNote: string;
  authorName: string;
}
export interface DocumentSummary {
  title: string;
  schemaVersion: number;
  gameType?: string | null;
}
export type ProjectSummary = Omit<Project, 'document'> & { document: DocumentSummary };
export type VersionSummary = Omit<Version, 'document'> & { document: DocumentSummary };
export interface Feedback {
  location?: Location | null;
  id: string;
  versionId: string;
  text: string;
  hidden: boolean;
  authorName: string;
  title: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let expectedUser: string | undefined;
export function setExpectedUser(id?: string) {
  expectedUser = id;
}
export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(expectedUser && url !== '/login' ? { 'X-Workshop-User': expectedUser } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, '连接暂时不可用。已打开的作品仍可编辑，请导出或等待网络恢复后保存。');
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(0, '服务器响应不完整，请重试或检查作品状态；本地草稿仍保留。');
  }
  if (!res.ok) throw new ApiError(res.status, data.message ?? '请求失败');
  return data as T;
}

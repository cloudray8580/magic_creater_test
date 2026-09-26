import type { GameDocument } from '../shared/game.js';
export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'teacher' | 'student';
  active: boolean;
}
export interface Project {
  id: string;
  ownerId: string;
  revision: number;
  updatedAt: number;
  document: GameDocument;
}
export interface Version {
  id: string;
  projectId: string;
  sourceRevision: number;
  document: GameDocument;
  status: 'pending' | 'approved' | 'returned' | 'withdrawn';
  reviewNote: string;
  authorName: string;
}
export interface Feedback {
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
export async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + url, {
      method,
      credentials: 'same-origin',
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, '连接暂时不可用。已打开的作品仍可编辑，请导出或等待网络恢复后保存。');
  }
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.message ?? '请求失败');
  return data as T;
}

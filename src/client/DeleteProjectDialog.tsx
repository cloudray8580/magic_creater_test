import { useEffect, useRef } from 'react';
import type { ProjectSummary } from './api.js';
export function DeleteProjectDialog({
  project,
  onCancel,
  onConfirm,
}: {
  project: ProjectSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="delete-dialog"
      aria-labelledby="delete-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id="delete-title">删除《{project.document.title}》？</h2>
      <p>
        {project.local && !project.saveAttempted
          ? '这份本地草稿将永久删除。'
          : '作品、全部提交版本及收到的反馈将永久删除。'}
        删除后无法在应用中恢复。
      </p>
      <div className="row">
        <button autoFocus onClick={onCancel}>
          取消
        </button>
        <button className="danger" onClick={onConfirm}>
          永久删除
        </button>
      </div>
    </dialog>
  );
}

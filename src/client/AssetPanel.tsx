import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { uploadImage } from './assets.js';
import { DrawingBoard } from './DrawingBoard.js';
interface AssetInfo {
  id: string;
  name: string;
  bytes: number;
}
export function AssetPanel({
  userId,
  onChoose,
  onBusyChange,
}: {
  userId: string;
  onChoose: (skin: string) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [assets, setAssets] = useState<AssetInfo[]>([]),
    [busy, setBusy] = useState(false),
    [drawingBusy, setDrawingBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    onBusyChange?.(busy || drawingBusy);
    return () => onBusyChange?.(false);
  }, [busy, drawingBusy, onBusyChange]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    setBusy(true);
    try {
      const result = await api<{ assets: AssetInfo[] }>('/assets');
      if (alive.current) setAssets(result.assets);
    } catch (e) {
      if (alive.current) setNotice((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function upload(file: Blob, name: string) {
    setBusy(true);
    setNotice('正在保存图片…');
    try {
      const { asset, warning } = await uploadImage(userId, name, file);
      if (!alive.current) return;
      onChoose('asset:' + asset.id);
      setAssets((previous) => [
        { id: asset.id, name: asset.name, bytes: Math.floor((asset.data.length * 3) / 4) },
        ...previous.filter((a) => a.id !== asset.id),
      ]);
      setNotice(warning || '已使用这张图片。可以撤销换图。');
    } catch (e) {
      if (alive.current) setNotice((e as Error).message);
      throw e;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="personal-assets">
      <button
        type="button"
        aria-expanded={open}
        disabled={busy || drawingBusy}
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        自己的图片与涂鸦
      </button>
      {open && (
        <fieldset disabled={busy || drawingBusy} inert={busy || drawingBusy}>
          <p>使用自己的画作或有权使用的图片。保留整张图片与透明背景，角色会移动和轻摆动。</p>
          <label>
            上传个人图片
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (file) void upload(file, file.name.replace(/\.[^.]+$/, '')).catch(() => {});
              }}
            />
          </label>
          <small>PNG / JPEG / WebP，最多2MiB；上传需要联网。</small>
          <DrawingBoard onBusyChange={setDrawingBusy} onSave={(blob) => upload(blob, '我的涂鸦')} />
          <label>
            重用我的图片
            <select
              value=""
              onChange={(e) => {
                if (e.target.value)
                  try {
                    onChoose('asset:' + e.target.value);
                    setNotice('已使用这张图片。可以撤销换图。');
                  } catch (error) {
                    setNotice((error as Error).message);
                  }
              }}
            >
              <option value="">选择已有图片</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}

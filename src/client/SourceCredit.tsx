import type { SourceCredit as Credit } from '../shared/portable.js';
export function SourceCredit({ source }: { source?: Credit | null }) {
  return source ? (
    <p className="source-credit">
      {source.verified ? '改编自' : '文件注明来源'}：{source.authorName}的《{source.title}》
    </p>
  ) : null;
}

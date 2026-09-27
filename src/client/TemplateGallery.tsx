import { TEMPLATE_IDS, TEMPLATE_INFO, type TemplateId } from '../shared/adventure/templates.js';

const summaries: Record<TemplateId, { summary: string; focus: string }> = {
  'cloud-post': {
    summary: '跳上平台、收集星星，再打开通往树屋的门。',
    focus: '基础跳跃 · 自由收集',
  },
  'moving-bridge': {
    summary: '搭上来回移动的小桥，越过地面缺口继续冒险。',
    focus: '移动平台 · 把握时机',
  },
  'rooftop-secret': {
    summary: '避开巡逻蘑菇，集齐三枚星星才能到达终点。',
    focus: '必需收集 · 巡逻挑战',
  },
  'forest-letter': {
    summary: '推箱子压住机关、穿过森林，把来信交给狐狸。',
    focus: '机关解谜 · 两个房间',
  },
  lighthouse: {
    summary: '同时点亮两处电源，取出电池，再把光带回灯塔。',
    focus: '组合条件 · 点亮灯塔',
  },
  'secret-home': {
    summary: '探索温暖小屋，与小猫对话，用不同选择写下结局。',
    focus: '对话分支 · 多种结局',
  },
};
const groups = [
  {
    kind: 'platformer',
    title: '横版跳跃',
    description: '设计一条能跑、能跳的冒险路线，用平台、机关与收集物创造挑战。',
  },
  {
    kind: 'story',
    title: '探索解谜 + 轻故事',
    description: '布置房间、藏好线索，让玩家通过探索、道具和对话推动故事。',
  },
] as const;
export function TemplateGallery({
  onCreate,
  onTry,
}: {
  onCreate: (id: TemplateId) => void;
  onTry: (id: TemplateId) => void;
}) {
  return (
    <div className="template-gallery">
      {groups.map((group) => (
        <section
          className="template-group"
          key={group.kind}
          aria-labelledby={'templates-' + group.kind}
        >
          <div className="template-group-heading">
            <h2 id={'templates-' + group.kind}>{group.title}</h2>
            <p>{group.description}</p>
          </div>
          <div className="template-cards">
            {TEMPLATE_IDS.filter((id) => TEMPLATE_INFO[id].kind === group.kind).map((id) => (
              <article className="template-card" key={id}>
                <img
                  src={'/art/template-previews/' + id + '.webp'}
                  alt={TEMPLATE_INFO[id].title + '游戏画面'}
                  width={720}
                  height={432}
                />
                <div className="template-card-body">
                  <span className="template-focus">{summaries[id].focus}</span>
                  <h3>{TEMPLATE_INFO[id].title}</h3>
                  <p>{summaries[id].summary}</p>
                  <div className="row">
                    <button
                      className="primary"
                      onClick={() => onCreate(id)}
                      aria-label={'开始创作' + TEMPLATE_INFO[id].title}
                    >
                      开始创作
                    </button>
                    <button
                      onClick={() => onTry(id)}
                      aria-label={'先玩一玩' + TEMPLATE_INFO[id].title}
                    >
                      先玩一玩
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {group.kind === 'story' && (
            <p className="template-note">
              来信练习推箱与交付，灯塔练习两个条件共同开门，小屋用对话选择写出不同结局。
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

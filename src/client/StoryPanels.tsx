import { useState } from 'react';
import {
  BUILTIN_SKINS,
  type AdventureDocument,
  type WorldObject,
  type Room,
  type Condition,
  type Choice,
} from '../shared/adventure/document.js';
import { updateObject } from '../shared/adventure/editor.js';
import {
  addStoryRoom,
  updateStoryRoom,
  removeStoryRoom,
  addStoryFlag,
  renameStoryFlag,
  removeStoryFlag,
  storyFlagReferences,
  addDialoguePage,
  updateDialoguePage,
  moveDialoguePage,
  removeDialoguePage,
  setDialogueChoice,
} from '../shared/adventure/story-editor.js';
import { TextInput } from './EditorInputs.js';
type Change = (work: () => AdventureDocument) => void;
const SKINS: Record<string, string> = {
  fox: '小狐狸',
  cat: '小猫',
  robot: '小机器人',
  bird: '小鸟',
  tree: '树',
  flower: '花',
  rock: '石头',
  lamp: '灯',
  house: '小屋',
  mushroom: '蘑菇',
  bench: '长椅',
  mailbox: '信箱',
  letter: '信',
  battery: '电池',
};
function itemName(object: WorldObject) {
  return (
    object.name ||
    (
      { collectible: '收集物', key: '钥匙', switch: '开关', plate: '压力板' } as Record<
        string,
        string
      >
    )[object.kind] ||
    '物体'
  );
}
export function ConditionEditor({
  document: doc,
  value,
  onChange,
}: {
  document: AdventureDocument;
  value?: Condition;
  onChange: (value: Condition) => void;
}) {
  const condition = value ?? { mode: 'all', sources: [] };
  const sources = doc.rooms.flatMap((r) =>
    r.objects
      .filter((o) => ['collectible', 'key', 'switch', 'plate'].includes(o.kind))
      .map((o) => ({ id: o.id, label: `${r.name} / ${itemName(o)} (${o.x},${o.y})` })),
  );
  if (doc.gameType === 'story')
    sources.push(...doc.flags.map((flag) => ({ id: 'flag:' + flag, label: '发生过：' + flag })));
  return (
    <div className="condition-editor">
      <label>
        条件关系
        <select
          value={condition.mode}
          onChange={(e) => onChange({ ...condition, mode: e.target.value as 'all' | 'any' })}
        >
          <option value="all">全部满足</option>
          <option value="any">任意满足</option>
        </select>
      </label>
      <label>
        添加条件
        <select
          value=""
          disabled={condition.sources.length >= 8}
          onChange={(e) => {
            if (e.target.value)
              onChange({ ...condition, sources: [...condition.sources, e.target.value] });
          }}
        >
          <option value="">选择物体或发生过的事</option>
          {sources
            .filter((s) => !condition.sources.includes(s.id))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
        </select>
      </label>
      <p>{condition.sources.length ? '已连接：' : '没有条件时一直满足。终点仍检查必需收集物。'}</p>
      {condition.sources.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() =>
            onChange({ ...condition, sources: condition.sources.filter((s) => s !== id) })
          }
        >
          {sources.find((s) => s.id === id)?.label || id} ×
        </button>
      ))}
    </div>
  );
}
export function StoryWorldPanel({
  document: doc,
  room,
  change,
  selectRoom,
}: {
  document: AdventureDocument;
  room: Room;
  change: Change;
  selectRoom: (id: string) => void;
}) {
  const [newFlag, setNewFlag] = useState('');
  return (
    <>
      <h4>这个房间</h4>
      <label>
        房间名称
        <TextInput
          value={room.name}
          maxLength={40}
          onCommit={(name) => change(() => updateStoryRoom(doc, room.id, { name }))}
        />
      </label>
      <label>
        地板
        <select
          value={room.ground}
          onChange={(e) =>
            change(() =>
              updateStoryRoom(doc, room.id, { ground: e.target.value as Room['ground'] }),
            )
          }
        >
          <option value="grass">草地</option>
          <option value="wood">木地板</option>
          <option value="stone">石砖</option>
        </select>
      </label>
      <div className="row">
        <button
          disabled={doc.rooms.length >= 6}
          onClick={() =>
            change(() => {
              const result = addStoryRoom(doc);
              selectRoom(result.roomId);
              return result.document;
            })
          }
        >
          添加房间
        </button>
        <button
          disabled={doc.rooms.length <= 1}
          onClick={() => {
            if (
              window.confirm(
                '删除整个房间及其中的内容？相关机关和对话连接会清除；如果起点在这里，起点也会清空。指向这里的门需要重新设置落点。可以撤销。',
              )
            )
              change(() => {
                const next = removeStoryRoom(doc, room.id, true);
                selectRoom(next.rooms[0].id);
                return next;
              });
          }}
        >
          删除房间
        </button>
      </div>
      <h4>发生过的事</h4>
      <p>让选择留下变化，例如“已送信”。机关和对话可以记住这些事。</p>
      <label>
        添加一件事
        <input
          maxLength={40}
          value={newFlag}
          placeholder="例如：已送信"
          onChange={(e) => setNewFlag(e.target.value)}
        />
      </label>
      <button
        disabled={!newFlag.trim() || doc.flags.length >= 32}
        onClick={() =>
          change(() => {
            const next = addStoryFlag(doc, newFlag.trim());
            setNewFlag('');
            return next;
          })
        }
      >
        记下这件事
      </button>
      {doc.flags.map((flag) => (
        <div className="story-flag" key={flag}>
          <label>
            事件名称
            <TextInput
              value={flag}
              maxLength={40}
              onCommit={(name) => change(() => renameStoryFlag(doc, flag, name.trim()))}
            />
          </label>
          <button
            aria-label={'删除事件 ' + flag}
            onClick={() => {
              if (
                !storyFlagReferences(doc, flag).length ||
                window.confirm('这件事被机关或对话引用。删除会清除所有相关条件和动作，确认？')
              )
                change(() => removeStoryFlag(doc, flag, true));
            }}
          >
            删除
          </button>
        </div>
      ))}
      <p>名称可用汉字、字母、数字、下划线和短横线。</p>
    </>
  );
}
export function StoryObjectPanel({
  document: doc,
  object,
  change,
  pickPortal,
  pickCondition,
}: {
  document: AdventureDocument;
  object: WorldObject;
  change: Change;
  pickPortal: (roomId: string) => void;
  pickCondition: (pageId: string) => void;
}) {
  const [destination, setDestination] = useState(object.target?.roomId ?? doc.rooms[0].id);
  const pages = object.dialogue ?? [];
  const items = doc.rooms.flatMap((r) =>
    r.objects
      .filter((o) => ['collectible', 'key'].includes(o.kind))
      .map((o) => ({ id: o.id, label: `${r.name} / ${itemName(o)}` })),
  );
  const patchChoice = (page: string, index: number, patch: Partial<Choice>) =>
    change(() => {
      const current = pages.find((p) => p.id === page)!.choices[index];
      return setDialogueChoice(doc, object.id, page, index, { ...current, ...patch });
    });
  return (
    <>
      {['npc', 'key', 'collectible', 'decoration'].includes(object.kind) && (
        <label>
          物体外形
          <select
            value={object.skin ?? (object.kind === 'npc' ? 'cat' : '')}
            onChange={(e) =>
              change(() => updateObject(doc, object.id, { skin: e.target.value || undefined }))
            }
          >
            <option value="">默认外形</option>
            {BUILTIN_SKINS.map((s) => (
              <option key={s} value={s}>
                {SKINS[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {object.kind === 'portal' && (
        <>
          <h4>这扇门通往哪里</h4>
          <label>
            目的房间
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {doc.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => pickPortal(destination)}>在目的房间选落点</button>
          <p>
            {object.target
              ? `当前落点：${doc.rooms.find((r) => r.id === object.target!.roomId)?.name} (${object.target.x},${object.target.y})`
              : '还没有设置落点。先选择目的房间，再点地图。'}
          </p>
        </>
      )}
      {object.kind === 'npc' && (
        <div className="story-dialogues">
          <h4>人物想说的话</h4>
          <p>
            互动时从上到下，使用第一张满足条件的卡片。把默认对话放在情境对话之后；选项也可以直接跳到指定卡片。
          </p>
          {pages.map((page, pageIndex) => (
            <details className="dialogue-page" key={page.id} open={pageIndex === 0}>
              <summary>
                第 {pageIndex + 1} 页 · {page.text.slice(0, 14)}
              </summary>
              <label>
                人物说的话
                <TextInput
                  multiline
                  value={page.text}
                  maxLength={240}
                  onCommit={(text) =>
                    change(() => updateDialoguePage(doc, object.id, page.id, { text }))
                  }
                />
              </label>
              <div className="row">
                <button
                  disabled={pageIndex === 0}
                  onClick={() => change(() => moveDialoguePage(doc, object.id, page.id, -1))}
                >
                  上移
                </button>
                <button
                  disabled={pageIndex === pages.length - 1}
                  onClick={() => change(() => moveDialoguePage(doc, object.id, page.id, 1))}
                >
                  下移
                </button>
                <button
                  disabled={pages.length === 1}
                  onClick={() => {
                    const linked = pages.some(
                      (p) => p.id !== page.id && p.choices.some((c) => c.next === page.id),
                    );
                    if (!linked || window.confirm('有选项指向这页对话。删除会清除跳转，确认？'))
                      change(() => removeDialoguePage(doc, object.id, page.id, true));
                  }}
                >
                  删除对话页
                </button>
              </div>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={Boolean(page.condition)}
                  onChange={(e) =>
                    change(() =>
                      updateDialoguePage(doc, object.id, page.id, {
                        condition: e.target.checked ? { mode: 'all', sources: [] } : undefined,
                      }),
                    )
                  }
                />
                仅在特定情境出现
              </label>
              {page.condition && (
                <ConditionEditor
                  document={doc}
                  value={page.condition}
                  onChange={(condition) =>
                    change(() => updateDialoguePage(doc, object.id, page.id, { condition }))
                  }
                />
              )}
              {page.condition && (
                <button onClick={() => pickCondition(page.id)}>在地图选择条件</button>
              )}
              {!page.condition && <p>默认对话：任何时候都满足。</p>}
              {page.choices.map((choice, index) => (
                <fieldset className="story-choice" key={index}>
                  <legend>玩家的选择 {index + 1}</legend>
                  <label>
                    选项文字
                    <TextInput
                      value={choice.label}
                      maxLength={60}
                      onCommit={(label) => patchChoice(page.id, index, { label })}
                    />
                  </label>
                  <label>
                    接着说
                    <select
                      value={choice.next ?? ''}
                      onChange={(e) =>
                        patchChoice(page.id, index, { next: e.target.value || undefined })
                      }
                    >
                      <option value="">结束本次对话</option>
                      {pages.map((p, i) => (
                        <option key={p.id} value={p.id}>
                          第 {i + 1} 页 · {p.text.slice(0, 12)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    交出物品
                    <select
                      value={choice.takeItem ?? ''}
                      onChange={(e) =>
                        patchChoice(page.id, index, { takeItem: e.target.value || undefined })
                      }
                    >
                      <option value="">不交出</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    获得物品
                    <select
                      value={choice.giveItem ?? ''}
                      onChange={(e) =>
                        patchChoice(page.id, index, { giveItem: e.target.value || undefined })
                      }
                    >
                      <option value="">不获得</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    记住发生的事
                    <select
                      value={choice.setFlag ?? ''}
                      onChange={(e) =>
                        patchChoice(page.id, index, { setFlag: e.target.value || undefined })
                      }
                    >
                      <option value="">不改变</option>
                      {doc.flags.map((flag) => (
                        <option key={flag} value={flag}>
                          {flag}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    出现结局（留空继续探索）
                    <TextInput
                      multiline
                      value={choice.ending ?? ''}
                      maxLength={240}
                      onCommit={(ending) =>
                        patchChoice(page.id, index, { ending: ending || undefined })
                      }
                    />
                  </label>
                  <button
                    onClick={() =>
                      change(() => setDialogueChoice(doc, object.id, page.id, index, null))
                    }
                  >
                    删除这个选项
                  </button>
                </fieldset>
              ))}
              <button
                disabled={page.choices.length >= 3}
                onClick={() =>
                  change(() =>
                    setDialogueChoice(doc, object.id, page.id, page.choices.length, {
                      label: '新的选择',
                    }),
                  )
                }
              >
                添加玩家选项
              </button>
            </details>
          ))}
          <button
            disabled={pages.length >= 8}
            onClick={() => change(() => addDialoguePage(doc, object.id))}
          >
            添加对话页
          </button>
        </div>
      )}
    </>
  );
}

import { it, expect } from 'vitest';
import {
  readDraft,
  writeDraft,
  removeDraft,
  migrateDraft,
  projectLockId,
  listLocalDrafts,
  holdDraft,
} from '../../src/client/drafts.js';
import { adventureTemplate } from '../../src/shared/adventure/templates.js';
it('lists only account-local creations and serializes removal after queued writes', async () => {
  const user = crypto.randomUUID(),
    other = crypto.randomUUID(),
    id = 'local:' + crypto.randomUUID();
  const draft = {
    document: adventureTemplate(),
    revision: 1,
    dirty: true,
    local: true,
    updatedAt: 42,
  };
  await Promise.all([
    writeDraft(user, id, draft),
    writeDraft(other, id, draft),
    writeDraft(user, 'server-project', { ...draft, local: false }),
  ]);
  expect((await listLocalDrafts(user)).map((x) => x.id)).toEqual([id]);
  const write = writeDraft(user, id, {
    ...draft,
    document: { ...draft.document, title: '最后一笔' },
  });
  const remove = removeDraft(user, id);
  await Promise.all([write, remove]);
  expect(await readDraft(user, id)).toBeUndefined();
  expect(await readDraft(other, id)).toEqual(draft);
  expect(await readDraft(user, 'server-project')).toBeDefined();
  expect(await listLocalDrafts(user)).toEqual([]);
  await Promise.all([removeDraft(other, id), removeDraft(user, 'server-project')]);
});
it('keeps the editor lock until pending local writes are flushed and refuses a concurrent editor', async () => {
  const user = crypto.randomUUID(),
    id = 'local:' + crypto.randomUUID();
  const release = await holdDraft(user, id);
  await expect(holdDraft(user, id)).rejects.toThrow('另一个标签');
  const pending = writeDraft(user, id, {
    document: adventureTemplate(),
    revision: 1,
    dirty: true,
    local: true,
  });
  release();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const releaseAgain = await holdDraft(user, id);
  expect(await readDraft(user, id)).toBeDefined();
  await removeDraft(user, id);
  releaseAgain();
});

it('keeps conflicting unsynchronized work during a first-save migration and locks both identities consistently', async () => {
  const user = crypto.randomUUID(),
    key = crypto.randomUUID(),
    local = 'local:' + key,
    id = crypto.randomUUID();
  expect(projectLockId({ id: local, local: true })).toBe(projectLockId({ id, creationKey: key }));
  const a = { document: adventureTemplate(), revision: 1, dirty: true, local: true };
  const b = { document: { ...a.document, title: '另一份未同步稿' }, revision: 1, dirty: true };
  await writeDraft(user, local, a);
  await writeDraft(user, id, b);
  await expect(migrateDraft(user, local, id, a)).rejects.toThrow('另一份未同步草稿');
  expect(await readDraft(user, local)).toEqual(a);
  expect(await readDraft(user, id)).toEqual(b);
  await writeDraft(user, id, { ...b, dirty: false });
  await migrateDraft(user, local, id, { ...a, local: false });
  expect(await readDraft(user, local)).toBeUndefined();
  expect((await readDraft(user, id))?.document).toEqual(a.document);
  await removeDraft(user, id);
});

import { it, expect, vi, afterEach } from 'vitest';
import { api, ApiError, setExpectedUser } from '../../src/client/api.js';
afterEach(() => {
  vi.restoreAllMocks();
  setExpectedUser(undefined);
});
it('treats truncated JSON as an unknown result and sends the expected account for authenticated requests', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('broken', { status: 200 }));
  setExpectedUser('owner-a');
  await expect(api('/projects/p', 'DELETE', { revision: 1 })).rejects.toMatchObject({ status: 0 });
  expect(fetch).toHaveBeenCalledWith(
    '/api/projects/p',
    expect.objectContaining({ headers: expect.objectContaining({ 'X-Workshop-User': 'owner-a' }) }),
  );
});

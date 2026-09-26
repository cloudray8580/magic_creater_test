import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, tokenHash, newSessionToken } from '../../src/server/auth.js';
describe('C02 credentials', () => {
  it('salts passwords, verifies correct values and rejects wrong/malformed hashes', async () => {
    const a = await hashPassword('good-password-123'),
      b = await hashPassword('good-password-123');
    expect(a).not.toBe(b);
    expect(a).not.toContain('good-password');
    expect(await verifyPassword('good-password-123', a)).toBe(true);
    expect(await verifyPassword('wrong-password', a)).toBe(false);
    for (const value of ['', 'invalid', 'aa:bb', 'x:y:z'])
      expect(await verifyPassword('good-password-123', value)).toBe(false);
  });
  it('creates unpredictable tokens and stable digests', () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(tokenHash(a)).toBe(tokenHash(a));
    expect(tokenHash(a)).not.toBe(a);
  });
});

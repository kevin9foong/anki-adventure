import packageJson from '../package.json';
import { describe, expect, it } from 'vitest';

describe('local cloud development commands', () => {
  it('migrates local D1 before serving Pages Functions and the admin route', () => {
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts['d1:migrate:local']).toContain('wrangler d1 migrations apply anki-adventure --local');
    expect(scripts['dev:cloud']).toContain('npm run d1:migrate:local');
    expect(scripts['dev:cloud']).toContain('wrangler pages dev dist');
  });
});

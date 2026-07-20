import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('Vite cloud development proxy', () => {
  it('sends browser API requests to the local Pages Functions runtime', () => {
    expect(config.server?.proxy).toMatchObject({
      '/api': { target: 'http://127.0.0.1:8788' },
    });
  });
});

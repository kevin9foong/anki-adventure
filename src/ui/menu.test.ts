import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { insertStoragePanel } from './menu';

describe('Pack menu', () => {
  it('inserts storage before the new-card stats wrapper', () => {
    const document = new Window().document;
    const form = document.createElement('form');
    form.innerHTML = '<div class="new-card-stats"><p class="hint">Today’s allowance</p><p class="hint">New solved today</p></div><p class="hint">Safari tip</p>';
    const panel = document.createElement('section');
    const [stats, safariTip] = Array.from(form.children);

    insertStoragePanel(form as unknown as HTMLFormElement, panel as unknown as HTMLElement);

    expect(Array.from(form.children)).toEqual([panel, stats, safariTip]);
  });
});

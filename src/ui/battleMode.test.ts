import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';
import { createBattleModeToggle } from './battleMode';

describe('battle mode toggle', () => {
  it('lets a player return to fighting after choosing catch', () => {
    const document = new Window().document;
    const chooseMode = vi.fn();
    const toggle = createBattleModeToggle(document as unknown as Document, 'catch', chooseMode);

    expect(toggle.textContent).toBe('Fight instead');

    toggle.click();

    expect(chooseMode).toHaveBeenCalledWith('fight');
  });
});

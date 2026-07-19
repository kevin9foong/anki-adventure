import { describe, expect, it, vi } from 'vitest';
import { handleOverworldKey } from './overworldControls';

describe('overworld keyboard controls', () => {
  it('uses Space for the A/CHECK interaction', () => {
    const interact = vi.fn();

    handleOverworldKey({ key: ' ', code: 'Space', preventDefault: vi.fn() } as unknown as KeyboardEvent, { move: vi.fn(), interact });

    expect(interact).toHaveBeenCalledOnce();
  });

  it('prevents Space from scrolling the page', () => {
    const preventDefault = vi.fn();

    handleOverworldKey({ key: ' ', code: 'Space', preventDefault } as unknown as KeyboardEvent, { move: vi.fn(), interact: vi.fn() });

    expect(preventDefault).toHaveBeenCalledOnce();
  });
});

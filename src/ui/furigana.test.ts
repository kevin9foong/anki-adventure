import { describe, expect, it } from 'vitest';
import { furiganaHtml } from './furigana';

describe('furiganaHtml', () => {
  it('renders Anki bracket notation as ruby and escapes deck text', () => {
    expect(furiganaHtml('私[わたし]は <strong>学生</strong>です。')).toBe('<ruby>私<rt>わたし</rt></ruby>は &lt;strong&gt;学生&lt;/strong&gt;です。');
  });
});

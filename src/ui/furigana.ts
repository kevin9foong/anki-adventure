const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

/** Converts Anki's 漢字[かな] furigana notation into safe ruby markup. */
export function furiganaHtml(text: string) {
  return escapeHtml(text).replace(/([^\s\[\]]+)\[([^\]]+)\]/g, '<ruby>$1<rt>$2</rt></ruby>');
}

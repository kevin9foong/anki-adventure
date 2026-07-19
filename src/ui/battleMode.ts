export type BattleMode = 'fight' | 'catch';

export function createBattleModeToggle(document: Document, mode: BattleMode, chooseMode: (mode: BattleMode) => void) {
  const toggle = document.createElement('button');
  const nextMode: BattleMode = mode === 'catch' ? 'fight' : 'catch';
  toggle.textContent = nextMode === 'fight' ? 'Fight instead' : 'Catch instead';
  toggle.addEventListener('click', () => chooseMode(nextMode));
  return toggle;
}

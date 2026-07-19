export type OverworldControls = {
  move: (dx: number, dy: number) => void;
  interact: () => void;
};

export function handleOverworldKey(event: KeyboardEvent, controls: OverworldControls) {
  const key = event.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') controls.move(0, -1);
  if (key === 'arrowdown' || key === 's') controls.move(0, 1);
  if (key === 'arrowleft' || key === 'a') controls.move(-1, 0);
  if (key === 'arrowright' || key === 'd') controls.move(1, 0);
  if (event.code === 'Space') {
    event.preventDefault();
    controls.interact();
  }
}

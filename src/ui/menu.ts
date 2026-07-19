export function insertStoragePanel(form: HTMLFormElement, panel: HTMLElement) {
  const anchor = form.querySelector<HTMLElement>(':scope > .new-card-stats') ?? form.querySelector<HTMLElement>(':scope > .hint');
  if (anchor) form.insertBefore(panel, anchor);
  else form.append(panel);
}

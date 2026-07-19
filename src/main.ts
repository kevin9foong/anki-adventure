import './style.css';
import './storage.css';
import { createGame } from './game/createGame';
import { furiganaHtml } from './ui/furigana';
import { insertStoragePanel } from './ui/menu';
import { basePower, cardCounts, catchChance, characterLevel, damageForGrade, effectiveNewCardLimit, encounterLevel, initialMonster, maxHp, newCardProgress, nextBattleCard, nextCard, partyIsDefeated, placeCaught, resolveEnemyDamage, restoreParty, rollDailyNewLimit, scheduleCard, species, studyDayKey, type Grade, type Monster, type StudyCard, grantXp } from './domain/game';
import { db, exportBackup, getSave, restoreBackup, saveGame, type SaveState } from './storage/db';

const status = document.querySelector<HTMLSpanElement>('#deck-status')!;
const battleEl = document.querySelector<HTMLDivElement>('#battle')!;
const menu = document.querySelector<HTMLDialogElement>('#menu')!;
let save: SaveState;
let cards: StudyCard[] = [];
let importStatus: string | undefined;
let bridge: ReturnType<typeof createGame>;
let battle: { enemy: Monster; card: StudyCard; answer: boolean; mode: 'fight' | 'catch'; kind: 'wild' | 'trainer' | 'gym'; remainingEnemies: number; message: string } | undefined;

const demoDeck: StudyCard[] = [
  { id: 'demo-1', front: '海', back: 'sea', reading: 'うみ', state: 'new', dueAt: null, introducedOn: null, intervalDays: 0 },
  { id: 'demo-2', front: '山', back: 'mountain', reading: 'やま', state: 'new', dueAt: null, introducedOn: null, intervalDays: 0 },
  { id: 'demo-3', front: '橋', back: 'bridge', reading: 'はし', state: 'new', dueAt: null, introducedOn: null, intervalDays: 0 },
];

async function boot() {
  cards = await db.cards.toArray();
  if (!cards.length) { await db.cards.bulkPut(demoDeck); cards = demoDeck; }
  save = await getSave() ?? { id: 'player', party: [initialMonster('tanuki')], storage: [], activeIndex: 0, dailyNewLimit: 10, limitDate: today(), extraNewCardsToday: 0 };
  ensureDailyLimit();
  await saveGame(save); refreshStatus();
  bridge = createGame('game', startBattle, healParty, () => startBattle('trainer'), () => startBattle('gym'));
}
const today = () => studyDayKey(new Date());
const active = () => save.party[save.activeIndex];
const todayNewLimit = () => effectiveNewCardLimit(save.dailyNewLimit, save.extraNewCardsToday);
function renderTodayNewLimit(saved = false) {
  document.querySelector('#today-new-limit')!.textContent = `${saved ? 'Saved. ' : ''}Today’s allowance: ${todayNewLimit()} (${save.dailyNewLimit} daily${save.extraNewCardsToday ? ` + ${save.extraNewCardsToday} Custom Study` : ''}).`;
  const progress = newCardProgress(cards, new Date(), todayNewLimit());
  document.querySelector('#new-card-progress')!.textContent = `New solved today: ${progress.solved} / ${progress.allowance}.`;
}
function refreshStatus() {
  if (importStatus) { status.textContent = importStatus; return; }
  const counts = cardCounts(cards, new Date(), todayNewLimit());
  status.innerHTML = `<span class="deck-summary">${cards.length} cards • Lv ${characterLevel(cards)} trainer • ${active()?.name ?? 'No active monster'}</span><span class="card-count new" aria-label="${counts.new} new cards available today">${counts.new}</span><span class="card-count learning" aria-label="${counts.learning} learning cards due">${counts.learning}</span><span class="card-count due" aria-label="${counts.review} review cards due">${counts.review}</span>`;
}
function updateImportStatus(progress: { stage: 'reading' } | { stage: 'cards' | 'media'; completed: number; total: number }) {
  importStatus = progress.stage === 'reading' ? 'Reading deck…' : `Importing ${progress.stage} ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}…`;
  refreshStatus();
}
function ensureDailyLimit() {
  Object.assign(save, rollDailyNewLimit(save.limitDate, save.extraNewCardsToday, new Date()));
}

function startBattle(kind: 'wild' | 'trainer' | 'gym' = 'wild') {
  ensureDailyLimit(); const card = nextCard(cards, new Date(), todayNewLimit()); const player = active();
  if (!card) return notice('No due or allowed new cards. Import a deck or raise today’s new-card limit in the pack.');
  if (!player || player.currentHp <= 0) return notice('Visit the Health House: no party monster can battle.');
  if (kind === 'gym' && characterLevel(cards) < 8) return notice('Mt. Bizan Gym opens at trainer level 8. Mature cards raise your trainer level.');
  const options: Array<'uzu' | 'mosslug' | 'sparkite'> = ['uzu', 'mosslug', 'sparkite']; const enemy = initialMonster(options[Math.floor(Math.random() * options.length)], encounterLevel(save.party));
  if (kind === 'gym') enemy.level = Math.min(100, Math.max(...save.party.map((member) => member.level)) + 5), enemy.currentHp = maxHp(enemy);
  battle = { enemy, card, answer: false, mode: 'fight', kind, remainingEnemies: kind === 'gym' ? 2 : 0, message: kind === 'wild' ? `A wild ${enemy.name} emerged from the route!` : kind === 'trainer' ? `Route Trainer Rin challenges you with ${enemy.name}!` : `The Mt. Bizan leader sends out ${enemy.name}!` }; battleEl.hidden = false; renderBattle();
}
function renderBattle() {
  if (!battle) return; const player = active(); if (!player) return;
  const enemyMax = maxHp(battle.enemy), playerMax = maxHp(player);
  const word = furiganaHtml(battle.answer ? battle.card.furigana ?? battle.card.front : battle.card.front);
  const sentence = battle.card.exampleSentence ? `<p class="example-sentence">${furiganaHtml(battle.answer ? battle.card.exampleSentenceFurigana ?? battle.card.exampleSentence : battle.card.exampleSentence)}${battle.answer && battle.card.exampleSentenceTranslation ? `<small>${furiganaHtml(battle.card.exampleSentenceTranslation)}</small>` : ''}</p>` : '';
  const answer = battle.answer ? `<span>${furiganaHtml(battle.card.back)}</span><small>${furiganaHtml(battle.card.reading ?? '')}</small>` : '';
  battleEl.innerHTML = `<div class="battle-top"><div class="monster-card enemy"><b>Lv${battle.enemy.level} ${battle.enemy.name}</b><meter min="0" max="${enemyMax}" value="${battle.enemy.currentHp}"></meter><span>${battle.enemy.currentHp}/${enemyMax} HP</span></div><div class="sprite ${battle.enemy.species}"></div></div><div class="battle-bottom"><div class="sprite ${player.species}"></div><div class="monster-card"><b>Lv${player.level} ${player.name}</b><meter min="0" max="${playerMax}" value="${player.currentHp}"></meter><span>${player.currentHp}/${playerMax} HP</span></div></div><section class="review"><p class="message">${battle.message}</p><div class="prompt"><strong>${word}</strong>${answer}${sentence}</div>${battle.answer ? `<div class="grades"><button data-grade="again">Again<br/><small>0.3×</small></button><button data-grade="hard">Hard<br/><small>0.5×</small></button><button data-grade="good">Good<br/><small>1.0× · 0.7× hit</small></button><button data-grade="easy">Easy<br/><small>1.5× · Guard</small></button></div>${battle.kind === 'wild' ? `<button id="catch" class="catch">${battle.mode === 'catch' ? 'Catching… choose a grade' : 'Catch instead'}</button>` : ''}` : '<button id="show-answer" class="show">Show answer</button>'}</section><button id="run" class="run">Leave battle</button>`;
  battleEl.querySelector('#show-answer')?.addEventListener('click', () => { if (battle) { battle.answer = true; battle.message = battle.mode === 'catch' ? 'Choose a grade to cast your catch charm.' : 'How well did you remember it?'; renderBattle(); } });
  battleEl.querySelectorAll<HTMLButtonElement>('[data-grade]').forEach((button) => button.addEventListener('click', () => resolveTurn(button.dataset.grade as Grade)));
  battleEl.querySelector('#catch')?.addEventListener('click', () => { if (battle) { battle.mode = 'catch'; battle.answer = false; battle.message = 'A catch charm replaces this attack review.'; renderBattle(); } });
  battleEl.querySelector('#run')?.addEventListener('click', endBattle);
}
async function resolveTurn(grade: Grade) {
  if (!battle) return; const now = new Date(); const scheduled = scheduleCard(battle.card, grade, now); await db.cards.put(scheduled); cards = cards.map((card) => card.id === scheduled.id ? scheduled : card); const player = active()!;
  if (battle.mode === 'catch') {
    if (Math.random() < catchChance(grade, battle.enemy.currentHp, maxHp(battle.enemy))) { const caught = { ...battle.enemy, id: crypto.randomUUID(), currentHp: maxHp(battle.enemy) }; const placement = placeCaught(save.party, save.storage, caught); if (placement.placed === 'full') { battle.message = 'Storage is full. The charm shattered!'; battle.answer = false; battle.mode = 'fight'; renderBattle(); return; } save.party = placement.party; save.storage = placement.storage; battle.message = `${caught.name} went to your ${placement.placed}!`; await persist(); setTimeout(endBattle, 900); return; }
    battle.message = 'The wild monster broke free!';
  } else { battle.enemy.currentHp = Math.max(0, battle.enemy.currentHp - damageForGrade(basePower(player), grade)); battle.message = `${player.name} studied hard and struck!${grade === 'easy' ? ' The next enemy attack is guarded.' : grade === 'good' ? ' The next enemy attack is weakened.' : ''}`; }
  if (battle.enemy.currentHp === 0) {
    const xp = Math.floor((species[battle.enemy.species].baseXp * battle.enemy.level * (battle.kind === 'wild' ? 1 : 1.5)) / 7); save.party[save.activeIndex] = grantXp(player, xp);
    if (battle.remainingEnemies > 0) { battle.remainingEnemies--; const roster: Array<'uzu' | 'mosslug' | 'sparkite'> = ['mosslug', 'uzu', 'sparkite']; battle.enemy = initialMonster(roster[battle.remainingEnemies], battle.kind === 'gym' ? Math.min(100, player.level + 5) : encounterLevel(save.party)); battle.message = `${battle.enemy.name} enters immediately! Choose your next review.`; battle.answer = false; await persist(); renderBattle(); return; }
    battle.message = `${battle.enemy.name} was calmed. ${player.name} gained ${xp} XP!`; await persist(); setTimeout(endBattle, 1000); return;
  }
  player.currentHp = Math.max(0, player.currentHp - resolveEnemyDamage(basePower(battle.enemy), grade)); battle.answer = false; if (!player.currentHp) { if (partyIsDefeated(save.party)) { await returnToHealthHouse(); return; } battle.message = `${player.name} fainted! Return to the Health House.`; await persist(); renderBattle(); return; }
  const next = nextBattleCard(cards, scheduled.id, now, todayNewLimit());
  if (!next) { battle.message = 'No more cards are available for this battle.'; await persist(); renderBattle(); setTimeout(endBattle, 1000); return; }
  battle.card = next;
  await persist(); renderBattle();
}
async function persist() { await saveGame(save); refreshStatus(); }
function endBattle() { battle = undefined; battleEl.hidden = true; refreshStatus(); }
function notice(message: string) { window.alert(message); }
async function returnToHealthHouse() { save.party = restoreParty(save.party); await persist(); bridge.returnToHealthHouse(); endBattle(); notice('Your party fainted and returned to the Health House.'); }
async function healParty() { save.party = restoreParty(save.party); await persist(); notice('The Health House restored your party.'); }
function renderStoragePanel() {
  document.querySelector('.storage-panel')?.remove();
  const panel = document.createElement('section'); panel.className = 'storage-panel';
  panel.innerHTML = `<h3>Monster Storage</h3><p>Party ${save.party.length}/6 · Box ${save.storage.length}/100</p><div class="monster-list"><b>Party</b>${save.party.map((monster, index) => `<button data-deposit="${index}" ${save.party.length === 1 ? 'disabled' : ''}>Deposit ${monster.name} Lv${monster.level}</button>`).join('')}</div><div class="monster-list"><b>Box</b>${save.storage.length ? save.storage.map((monster, index) => `<button data-withdraw="${index}" ${save.party.length >= 6 ? 'disabled' : ''}>Withdraw ${monster.name} Lv${monster.level}</button>`).join('') : '<small>Empty</small>'}</div>`;
  insertStoragePanel(menu.querySelector('form')!, panel);
  panel.querySelectorAll<HTMLButtonElement>('[data-deposit]').forEach((button) => button.addEventListener('click', async (event) => { event.preventDefault(); const [monster] = save.party.splice(Number(button.dataset.deposit), 1); save.storage.push(monster); save.activeIndex = 0; await persist(); renderStoragePanel(); }));
  panel.querySelectorAll<HTMLButtonElement>('[data-withdraw]').forEach((button) => button.addEventListener('click', async (event) => { event.preventDefault(); if (save.party.length >= 6) return; const [monster] = save.storage.splice(Number(button.dataset.withdraw), 1); save.party.push(monster); await persist(); renderStoragePanel(); }));
}

document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => button.addEventListener('pointerdown', (event) => { event.preventDefault(); const [x, y] = button.dataset.move!.split(',').map(Number); bridge.move(x, y); }));
document.querySelector('#action-button')!.addEventListener('click', () => bridge.interact());
document.querySelector('#menu-button')!.addEventListener('click', () => { ensureDailyLimit(); document.querySelector<HTMLInputElement>('#new-limit')!.value = String(save.dailyNewLimit); renderTodayNewLimit(); document.querySelector('#party-summary')!.textContent = `Party: ${save.party.map((m) => `${m.name} Lv${m.level}`).join(', ')}. Storage: ${save.storage.length}/100.`; renderStoragePanel(); menu.showModal(); });
document.querySelector<HTMLInputElement>('#deck-input')!.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; importStatus = 'Loading import tools…'; refreshStatus(); try { const { importDeck } = await import('./storage/importer'); const count = await importDeck(file, { onProgress: updateImportStatus }); cards = await db.cards.toArray(); importStatus = undefined; refreshStatus(); notice(`Imported ${count} cards. Media is stored locally and read only when needed.`); } catch (error) { importStatus = undefined; notice(`Import failed: ${error instanceof Error ? error.message : 'unknown error'}`); refreshStatus(); } });
document.querySelector('#save-limit')!.addEventListener('click', async () => {
  save.dailyNewLimit = Math.max(0, Number(document.querySelector<HTMLInputElement>('#new-limit')!.value) || 0);
  await persist();
  renderTodayNewLimit(true);
});
document.querySelector('#increase-today-limit')?.addEventListener('click', async () => {
  ensureDailyLimit();
  if (!window.confirm('Increase today’s new-card limit by 5? This resets at Anki’s next study-day rollover.')) return;
  save.extraNewCardsToday = (save.extraNewCardsToday ?? 0) + 5;
  await persist();
  renderTodayNewLimit(true);
});
document.querySelector('#export-backup')!.addEventListener('click', async (event) => { event.preventDefault(); const blob = new Blob([JSON.stringify(await exportBackup())], { type: 'application/json' }); const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `anki-adventure-${today()}.json` }); link.click(); URL.revokeObjectURL(link.href); });
document.querySelector<HTMLInputElement>('#restore-input')!.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; await restoreBackup(JSON.parse(await file.text())); cards = await db.cards.toArray(); save = (await getSave())!; refreshStatus(); notice('Backup restored.'); });
const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = '/manifest.webmanifest'; document.head.append(manifest);
// A cache-first service worker is for the deployed PWA only. Keeping it out of
// the Vite dev server prevents localhost from mixing an old module graph with
// newly edited source files.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  else navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).then(() => caches.keys()).then((keys) => Promise.all(keys.filter((key) => key.startsWith('anki-adventure-shell-')).map((key) => caches.delete(key)))).catch(() => undefined);
}
boot();

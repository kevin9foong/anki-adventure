import './style.css';
import './storage.css';
import { createGame } from './game/createGame';
import { furiganaHtml } from './ui/furigana';
import { visibleCardSections } from './ui/cardSections';
import { createBattleModeToggle } from './ui/battleMode';
import { insertStoragePanel } from './ui/menu';
import { basePower, cardCounts, catchChance, characterLevel, damageForGrade, effectiveNewCardLimit, encounterLevel, initialMonster, maxHp, newCardProgress, nextBattleCard, nextCard, partyIsDefeated, placeCaught, resolveEnemyDamage, restoreParty, rollDailyNewLimit, scheduleCard, species, studyDayKey, type Grade, type Monster, type StudyCard, grantXp } from './domain/game';
import { db, exportBackup, getSave, restoreBackup, saveGame, type SaveState } from './storage/db';
import { CloudApi, CloudApiError } from './cloud/client';
import { cloudStudyCard } from './cloud/studyCard';
import { nextCloudCard, type CloudCardProgress, type CuratedDeckCard } from './cloud/decks';
import { cloudSaveTokenFromUrl, persistenceMode } from './cloud/mode';

const status = document.querySelector<HTMLSpanElement>('#deck-status')!;
const battleEl = document.querySelector<HTMLDivElement>('#battle')!;
const menu = document.querySelector<HTMLDialogElement>('#menu')!;
let save: SaveState;
let cards: StudyCard[] = [];
let importStatus: string | undefined;
let bridge: ReturnType<typeof createGame>;
let battle: { enemy: Monster; card: StudyCard; answer: boolean; mode: 'fight' | 'catch'; kind: 'wild' | 'trainer' | 'gym'; remainingEnemies: number; message: string; animating: boolean } | undefined;
const mode = persistenceMode(window.location.href);
const cloudApi = (() => { const token = cloudSaveTokenFromUrl(window.location.href); return token ? new CloudApi(token) : undefined; })();
let cloudRevision: number | undefined;
let selectedCloudDeckIds: string[] = [];
let cloudReloadRequired = false;
const cloudCardRefs = new Map<string, { deckId: string; sourceCardId: string }>();
let pendingCloudGrade: { deckId: string; sourceCardId: string; grade: Grade } | undefined;

const demoDeck: StudyCard[] = [
  { id: 'demo-1', content: { prompt: [{ text: '海', emphasis: 'primary' }], answer: [{ text: 'うみ', emphasis: 'supporting' }, { text: 'sea', emphasis: 'supporting' }] }, state: 'new', dueAt: null, introducedOn: null, intervalDays: 0 },
  { id: 'demo-2', content: { prompt: [{ text: '山', emphasis: 'primary' }], answer: [{ text: 'やま', emphasis: 'supporting' }, { text: 'mountain', emphasis: 'supporting' }] }, state: 'new', dueAt: null, introducedOn: null, intervalDays: 0 },
  { id: 'demo-3', content: { prompt: [{ text: '橋', emphasis: 'primary' }], answer: [{ text: 'はし', emphasis: 'supporting' }, { text: 'bridge', emphasis: 'supporting' }] }, state: 'new', dueAt: null, introducedOn: null, intervalDays: 0 },
];

async function boot() {
  configurePersistenceUi();
  if (cloudApi) {
    try {
      const remote = await cloudApi.session();
      const party = remote.party as Monster[];
      save = { id: 'player', party, storage: remote.storage as Monster[], activeIndex: Math.max(0, party.findIndex((monster) => monster.id === remote.activeMonsterId)), dailyNewLimit: remote.dailyNewCardLimit ?? 10, limitDate: remote.limitDate ?? today(), extraNewCardsToday: remote.extraNewCardsToday ?? 0 };
      cloudRevision = remote.revision;
      await loadCloudDecks();
    } catch (error) {
      document.querySelector('#deck-status')!.textContent = error instanceof CloudApiError && error.status === 404 ? 'Cloud save link is invalid or has been rotated.' : 'Cloud save could not be loaded. Check your connection.';
      return;
    }
  } else {
    cards = await db.cards.toArray();
    if (!cards.length) { await db.cards.bulkPut(demoDeck); cards = demoDeck; }
    save = await getSave() ?? { id: 'player', party: [initialMonster('tanuki')], storage: [], activeIndex: 0, dailyNewLimit: 10, limitDate: today(), extraNewCardsToday: 0 };
  }
  ensureDailyLimit();
  if (cloudApi) refreshStatus(); else { await persist(); refreshStatus(); }
  bridge = createGame('game', startBattle, healParty, () => startBattle('trainer'), () => startBattle('gym'));
}
function configurePersistenceUi() {
  const cloud = mode === 'cloud';
  document.querySelector('#persistence-mode')!.textContent = cloud ? 'Persistence: Cloud (online-only)' : 'Persistence: Local (this device; works offline)';
  document.querySelectorAll<HTMLElement>('[data-local-only]').forEach((element) => { element.hidden = cloud; });
  document.querySelector<HTMLElement>('#cloud-deck-picker')!.hidden = !cloud;
  document.querySelector<HTMLElement>('#cloud-notice')!.hidden = !cloud;
}
async function loadCloudDecks() {
  if (!cloudApi) return;
  const catalogue = await cloudApi.decks();
  cloudRevision = catalogue.revision;
  selectedCloudDeckIds = catalogue.selectedDeckIds;
  cloudCardRefs.clear();
  cards = catalogue.decks.flatMap((deck) => deck.cards.map((card) => {
    const id = `${deck.id}:${card.sourceCardId}`;
    cloudCardRefs.set(id, { deckId: deck.id, sourceCardId: card.sourceCardId });
    return cloudStudyCard(id, { ...card, content: card.content ?? cloudCardContent(card) });
  }));
  const picker = document.querySelector('#cloud-decks')!;
  picker.innerHTML = catalogue.catalogue.map((deck) => `<label><input type="checkbox" data-cloud-deck="${deck.id}" ${selectedCloudDeckIds.includes(deck.id) ? 'checked' : ''}/> ${deck.displayName} <small>(${deck.cardCount} cards)</small></label>`).join('') || '<p class="hint">No published decks are available yet.</p>';
  picker.querySelectorAll<HTMLInputElement>('[data-cloud-deck]').forEach((input) => input.addEventListener('change', async () => {
    if (!cloudApi || cloudRevision === undefined) return;
    const deckIds = Array.from(picker.querySelectorAll<HTMLInputElement>('[data-cloud-deck]:checked')).map((checkbox) => checkbox.dataset.cloudDeck!);
    try { cloudRevision = await cloudApi.selectDecks(cloudRevision, deckIds); await loadCloudDecks(); refreshStatus(); }
    catch (error) { cloudMutationFailure(error); }
  }));
}
function cloudCardContent(card: Pick<CuratedDeckCard, 'reading' | 'furigana' | 'exampleSentence' | 'exampleSentenceTranslation' | 'exampleSentenceFurigana'> & { front?: string; back?: string }): StudyCard['content'] {
  const furigana = card.furigana?.trim() ?? '';
  const reading = card.reading?.trim() ?? '';
  const readingIsShown = Boolean(reading && (furigana === reading || furigana.includes(`[${reading}]`)));
  return {
    prompt: [{ text: card.front ?? '', emphasis: 'primary' as const }],
    answer: [
      { text: furigana, emphasis: 'supporting' as const },
      { text: card.back ?? '', emphasis: 'supporting' as const },
      { text: readingIsShown ? '' : reading, emphasis: 'supporting' as const },
      { text: card.exampleSentenceFurigana ?? card.exampleSentence ?? '', emphasis: 'detail' as const },
      { text: card.exampleSentenceTranslation ?? '', emphasis: 'detail' as const },
    ].filter((section) => Boolean(section.text)),
  };
}
function nextCloudStudyCard(candidates = cards) {
  const curated: CuratedDeckCard[] = candidates.flatMap((card) => {
    const ref = cloudCardRefs.get(card.id);
    return ref ? [{ deckId: ref.deckId, sourceCardId: ref.sourceCardId, newPosition: card.newPosition, front: card.front ?? '', back: card.back ?? '', reading: card.reading, furigana: card.furigana, exampleSentence: card.exampleSentence, exampleSentenceTranslation: card.exampleSentenceTranslation, exampleSentenceFurigana: card.exampleSentenceFurigana }] : [];
  });
  const progress: CloudCardProgress[] = candidates.flatMap((card) => {
    const ref = cloudCardRefs.get(card.id);
    return ref && card.state !== 'new' ? [{ deckId: ref.deckId, sourceCardId: ref.sourceCardId, state: card.state, dueAt: card.dueAt, introducedOn: card.introducedOn, intervalDays: card.intervalDays, stability: card.stability, difficulty: card.difficulty, reps: card.reps, lapses: card.lapses, learningSteps: card.learningSteps, lastReviewedAt: card.lastReviewedAt }] : [];
  });
  const selected = nextCloudCard({ selectedDeckIds: selectedCloudDeckIds, cards: curated, progress, now: new Date(), dailyNewLimit: todayNewLimit() });
  return selected && candidates.find((card) => {
    const ref = cloudCardRefs.get(card.id);
    return ref?.deckId === selected.deckId && ref.sourceCardId === selected.sourceCardId;
  });
}
function cloudMutationFailure(error: unknown) {
  if (error instanceof CloudApiError && error.status === 409) {
    cloudReloadRequired = true;
    document.querySelector('#deck-status')!.textContent = 'Cloud save changed elsewhere — reload required.';
    notice('This cloud save changed elsewhere. Reload this page; your action was not retried.');
  }
  else notice('Cloud save failed. Check your connection before continuing.');
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
  status.innerHTML = `<span class="deck-summary">${mode === 'cloud' ? 'Cloud • ' : 'Local • '}${cards.length} cards • Lv ${characterLevel(cards)} trainer • ${active()?.name ?? 'No active monster'}</span><span class="card-count new" aria-label="${counts.new} new cards available today">${counts.new}</span><span class="card-count learning" aria-label="${counts.learning} learning cards due">${counts.learning}</span><span class="card-count due" aria-label="${counts.review} review cards due">${counts.review}</span>`;
}
function updateImportStatus(progress: { stage: 'reading' } | { stage: 'cards'; completed: number; total: number }) {
  importStatus = progress.stage === 'reading' ? 'Reading deck…' : `Importing ${progress.stage} ${progress.completed.toLocaleString()} / ${progress.total.toLocaleString()}…`;
  refreshStatus();
}
function ensureDailyLimit() {
  Object.assign(save, rollDailyNewLimit(save.limitDate, save.extraNewCardsToday, new Date()));
}

function startBattle(kind: 'wild' | 'trainer' | 'gym' = 'wild') {
  if (cloudReloadRequired) return notice('Reload is required before continuing cloud play.');
  ensureDailyLimit(); const card = cloudApi ? nextCloudStudyCard() : nextCard(cards, new Date(), todayNewLimit()); const player = active();
  if (!card) return notice(mode === 'cloud' ? 'No due or allowed cards. Select a published deck in the Pack or raise today’s new-card limit.' : 'No due or allowed new cards. Import a deck or raise today’s new-card limit in the pack.');
  if (!player || player.currentHp <= 0) return notice('Visit the Health House: no party monster can battle.');
  if (kind === 'gym' && characterLevel(cards) < 8) return notice('Mt. Bizan Gym opens at trainer level 8. Mature cards raise your trainer level.');
  const options: Array<'uzu' | 'mosslug' | 'sparkite'> = ['uzu', 'mosslug', 'sparkite']; const enemy = initialMonster(options[Math.floor(Math.random() * options.length)], encounterLevel(save.party));
  if (kind === 'gym') enemy.level = Math.min(100, Math.max(...save.party.map((member) => member.level)) + 5), enemy.currentHp = maxHp(enemy);
  battle = { enemy, card, answer: false, mode: 'fight', kind, remainingEnemies: kind === 'gym' ? 2 : 0, message: kind === 'wild' ? `A wild ${enemy.name} emerged from the route!` : kind === 'trainer' ? `Route Trainer Rin challenges you with ${enemy.name}!` : `The Mt. Bizan leader sends out ${enemy.name}!`, animating: false }; battleEl.hidden = false; renderBattle();
}
function monsterSprite(monster: Monster, side: 'player' | 'enemy') {
  return `<div class="sprite ${monster.species} ${side}" role="img" aria-label="${monster.name}"><i class="sprite-ear ear-left"></i><i class="sprite-ear ear-right"></i><i class="festival-hat"></i><i class="sprite-mark"></i><i class="sprite-eye eye-left"></i><i class="sprite-eye eye-right"></i><i class="sprite-brow brow-left"></i><i class="sprite-brow brow-right"></i><i class="sprite-mouth"></i></div>`;
}
function renderBattle() {
  if (!battle) return; const player = active(); if (!player) return;
  const enemyMax = maxHp(battle.enemy), playerMax = maxHp(player);
  const content = battle.card.content;
  if (!content) throw new Error('A card without generic section content cannot be rendered. Re-import the deck.');
  const sections = visibleCardSections(content, battle.answer).map((section) => `<p class="card-section card-section-${section.emphasis}">${furiganaHtml(section.text)}</p>`).join('');
  battleEl.innerHTML = `<div class="battle-top"><div class="monster-card enemy"><b>Lv${battle.enemy.level} ${battle.enemy.name}</b><meter min="0" max="${enemyMax}" value="${battle.enemy.currentHp}"></meter><span>${battle.enemy.currentHp}/${enemyMax} HP</span></div>${monsterSprite(battle.enemy, 'enemy')}</div><div class="battle-bottom">${monsterSprite(player, 'player')}<div class="monster-card"><b>Lv${player.level} ${player.name}</b><meter min="0" max="${playerMax}" value="${player.currentHp}"></meter><span>${player.currentHp}/${playerMax} HP</span></div></div><section class="review"><p class="message">${battle.message}</p><div class="prompt">${sections}</div>${battle.answer ? `<div class="grades"><button data-grade="again" ${battle.animating ? 'disabled' : ''}>Again<br/><small>0.3×</small></button><button data-grade="hard" ${battle.animating ? 'disabled' : ''}>Hard<br/><small>0.5× · 0.7× hit</small></button><button data-grade="good" ${battle.animating ? 'disabled' : ''}>Good<br/><small>1.0× · Guard</small></button><button data-grade="easy" ${battle.animating ? 'disabled' : ''}>Easy<br/><small>1.5× · Guard</small></button></div>` : `<button id="show-answer" class="show" ${battle.animating ? 'disabled' : ''}>Show answer</button>`}</section><button id="run" class="run">Leave battle</button>`;
  battleEl.querySelector('#show-answer')?.addEventListener('click', () => { if (battle && !battle.animating) { battle.answer = true; battle.message = battle.mode === 'catch' ? 'Choose a grade to cast your catch charm.' : 'How well did you remember it?'; renderBattle(); } });
  battleEl.querySelectorAll<HTMLButtonElement>('[data-grade]').forEach((button) => button.addEventListener('click', () => resolveTurn(button.dataset.grade as Grade)));
  if (battle.answer && battle.kind === 'wild') {
    const toggle = createBattleModeToggle(document, battle.mode, (mode) => {
      if (!battle) return;
      battle.mode = mode;
      battle.message = mode === 'catch' ? 'A catch charm replaces this attack review.' : 'This review will power your attack.';
      renderBattle();
    });
    toggle.id = 'battle-mode';
    toggle.className = 'catch';
    battleEl.querySelector('.grades')!.after(toggle);
  }
  battleEl.querySelector('#run')?.addEventListener('click', endBattle);
}
function playBattleAnimation(side: 'player' | 'enemy', speciesId: Monster['species'], power: 'again' | 'hard' | 'good' | 'easy' | 'catch') {
  const sprite = battleEl.querySelector<HTMLElement>(`.sprite.${side}`);
  const lane = sprite?.closest<HTMLElement>(side === 'player' ? '.battle-bottom' : '.battle-top');
  if (!sprite || !lane) return Promise.resolve();
  const effect = document.createElement('span');
  effect.className = `attack-effect ${side} ${power === 'catch' ? 'catch-charm' : `effect-${speciesId}`} power-${power}`;
  lane.append(effect);
  sprite.classList.add('is-attacking');
  return new Promise<void>((resolve) => window.setTimeout(() => {
    sprite.classList.remove('is-attacking');
    effect.remove();
    resolve();
  }, power === 'catch' ? 650 : 520));
}
async function resolveTurn(grade: Grade) {
  if (!battle || battle.animating) return;
  battle.animating = true;
  const now = new Date(); let scheduled: StudyCard;
  try {
    if (cloudApi) {
      const ref = cloudCardRefs.get(battle.card.id);
      if (!ref || cloudRevision === undefined) throw new Error('Cloud card identity is unavailable.');
      // The final party/storage result is submitted with this grade by persist(),
      // so D1 commits one review turn atomically rather than two snapshots.
      scheduled = scheduleCard(battle.card, grade, now);
      pendingCloudGrade = { ...ref, grade };
    } else {
      scheduled = scheduleCard(battle.card, grade, now); await db.cards.put(scheduled);
    }
  } catch (error) { battle.animating = false; cloudMutationFailure(error); return; }
  cards = cards.map((card) => card.id === scheduled.id ? scheduled : card); const player = active()!;
  if (battle.mode === 'catch') {
    await playBattleAnimation('player', player.species, 'catch');
    if (!battle) return;
    if (Math.random() < catchChance(grade, battle.enemy.currentHp, maxHp(battle.enemy))) { const caught = { ...battle.enemy, id: crypto.randomUUID(), currentHp: maxHp(battle.enemy) }; const placement = placeCaught(save.party, save.storage, caught); if (placement.placed === 'full') { battle.message = 'Storage is full. The charm shattered!'; battle.answer = false; battle.mode = 'fight'; battle.animating = false; await persist(); renderBattle(); return; } save.party = placement.party; save.storage = placement.storage; battle.message = `${caught.name} went to your ${placement.placed}!`; await persist(); setTimeout(endBattle, 900); return; }
    battle.message = 'The wild monster broke free!';
  } else {
    await playBattleAnimation('player', player.species, grade);
    if (!battle) return;
    battle.enemy.currentHp = Math.max(0, battle.enemy.currentHp - damageForGrade(basePower(player), grade)); battle.message = `${grade === 'again' ? `${player.name} swung wildly and landed a light tap, let's try again!` : grade === 'hard' ? `${player.name} gritted its teeth and landed a scrappy hit!` : grade === 'easy' ? `${player.name} landed a critical hit!` : `${player.name} studied hard and struck!`}${grade === 'good' || grade === 'easy' ? ' The next enemy attack is guarded.' : grade === 'hard' ? ' The next enemy attack is weakened.' : ''}`;
  }
  if (battle.enemy.currentHp === 0) {
    const xp = Math.floor((species[battle.enemy.species].baseXp * battle.enemy.level * (battle.kind === 'wild' ? 1 : 1.5)) / 7); save.party[save.activeIndex] = grantXp(player, xp);
    if (battle.remainingEnemies > 0) { battle.remainingEnemies--; const roster: Array<'uzu' | 'mosslug' | 'sparkite'> = ['mosslug', 'uzu', 'sparkite']; battle.enemy = initialMonster(roster[battle.remainingEnemies], battle.kind === 'gym' ? Math.min(100, player.level + 5) : encounterLevel(save.party)); battle.message = `${battle.enemy.name} enters immediately! Choose your next review.`; battle.answer = false; battle.animating = false; await persist(); renderBattle(); return; }
    battle.message = `${battle.enemy.name} was calmed. ${player.name} gained ${xp} XP!`; await persist(); setTimeout(endBattle, 1000); return;
  }
  await playBattleAnimation('enemy', battle.enemy.species, grade);
  if (!battle) return;
  player.currentHp = Math.max(0, player.currentHp - resolveEnemyDamage(basePower(battle.enemy), grade)); battle.answer = false; if (!player.currentHp) { if (partyIsDefeated(save.party)) { await returnToHealthHouse(); return; } battle.message = `${player.name} fainted! Return to the Health House.`; await persist(); renderBattle(); return; }
  const next = cloudApi ? nextCloudStudyCard(cards.filter((card) => card.id !== scheduled.id)) : nextBattleCard(cards, scheduled.id, now, todayNewLimit());
  if (!next) { battle.message = 'No more cards are available for this battle.'; await persist(); renderBattle(); setTimeout(endBattle, 1000); return; }
  battle.card = next; battle.animating = false;
  await persist(); renderBattle();
}
async function persist() {
  if (cloudApi) {
    if (cloudReloadRequired) throw new Error('Cloud reload required');
    if (cloudRevision === undefined) return;
    try {
      const state = { party: save.party, storage: save.storage, activeMonsterId: active()?.id ?? null, dailyNewCardLimit: save.dailyNewLimit, limitDate: save.limitDate, extraNewCardsToday: save.extraNewCardsToday ?? 0 };
      if (pendingCloudGrade) {
        const result = await cloudApi.grade(cloudRevision, pendingCloudGrade.deckId, pendingCloudGrade.sourceCardId, pendingCloudGrade.grade, state);
        cloudRevision = result.revision;
        const scheduled = result.card as unknown as StudyCard;
        // D1 owns scheduling state. The shared card materializer owns content,
        // so a cloud grade must never replace profile-derived sections.
        cards = cards.map((card) => card.id === scheduled.id ? { ...card, ...scheduled, content: card.content } : card);
        pendingCloudGrade = undefined;
      } else cloudRevision = await cloudApi.playerState(cloudRevision, state);
    } catch (error) {
      cloudMutationFailure(error);
      throw error;
    }
  } else await saveGame(save);
  refreshStatus();
}
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
document.querySelector<HTMLInputElement>('#deck-input')!.addEventListener('change', async (event) => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; importStatus = 'Loading import tools…'; refreshStatus(); try { const { importDeck } = await import('./storage/importer'); const count = await importDeck(file, { onProgress: updateImportStatus }); cards = await db.cards.toArray(); importStatus = undefined; refreshStatus(); notice(`Imported ${count} cards.`); } catch (error) { importStatus = undefined; notice(`Import failed: ${error instanceof Error ? error.message : 'unknown error'}`); refreshStatus(); } });
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
// A cache-first service worker is for deployed PWAs only. Pages local dev
// serves a production bundle and may be opened through a LAN IP, so a build
// flag (not hostname detection) keeps its stale shell out of every local URL.
const serviceWorkerEnabled = import.meta.env.PROD && import.meta.env.VITE_DISABLE_SERVICE_WORKER !== '1';
if ('serviceWorker' in navigator) {
  if (serviceWorkerEnabled) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  else navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).then(() => caches.keys()).then((keys) => Promise.all(keys.filter((key) => key.startsWith('anki-adventure-shell-')).map((key) => caches.delete(key)))).catch(() => undefined);
}
boot();

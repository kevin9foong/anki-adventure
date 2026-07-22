import { scheduleCard, type Grade, type StudyCard } from '../../../src/domain/game';
import { json, type CloudEnv, type FunctionContext } from '../../_lib/cloud';
import { authenticatedSave, conflict, expectedRevision, isResponse, requestJson } from '../../_lib/session';
import { validPlayerState } from './player-state';

interface GradeRow {
  state: StudyCard['state'] | null; due_at: string | null; introduced_on: string | null; interval_days: number | null;
  stability: number | null; difficulty: number | null; reps: number | null; lapses: number | null; learning_steps: number | null; last_reviewed_at: string | null;
}

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (context.request.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
  const save = await authenticatedSave(context);
  if (isResponse(save)) return save;
  const body = await requestJson(context.request);
  if (isResponse(body)) return body;
  const revision = expectedRevision(body);
  if (isResponse(revision)) return revision;
  if (typeof body.deckId !== 'string' || typeof body.sourceCardId !== 'string' || !['again', 'hard', 'good', 'easy'].includes(String(body.grade))) return json({ error: 'invalid_grade' }, { status: 400 });
  if (!body.playerState || typeof body.playerState !== 'object' || Array.isArray(body.playerState) || !validPlayerState(body.playerState as Record<string, unknown>)) return json({ error: 'invalid_player_state' }, { status: 400 });
  const playerState = body.playerState as Record<string, unknown>;

  const row = await context.env.DB.prepare(`SELECT p.state, p.due_at, p.introduced_on,
    p.interval_days, p.stability, p.difficulty, p.reps, p.lapses, p.learning_steps, p.last_reviewed_at
    FROM deck_cards c JOIN save_selected_decks selected ON selected.deck_id = c.deck_id
    LEFT JOIN cloud_card_progress p ON p.save_id = selected.save_id AND p.deck_id = c.deck_id AND p.source_card_id = c.source_card_id
    WHERE selected.save_id = ? AND c.deck_id = ? AND c.source_card_id = ?`).bind(save.id, body.deckId, body.sourceCardId).first<GradeRow>();
  if (!row) return json({ error: 'card_not_found' }, { status: 404 });
  const card: StudyCard = {
    id: `${body.deckId}:${body.sourceCardId}`,
    state: row.state ?? 'new', dueAt: row.due_at, introducedOn: row.introduced_on, intervalDays: row.interval_days ?? 0,
    stability: row.stability ?? undefined, difficulty: row.difficulty ?? undefined, reps: row.reps ?? undefined,
    lapses: row.lapses ?? undefined, learningSteps: row.learning_steps ?? undefined, lastReviewedAt: row.last_reviewed_at,
  };
  const scheduled = scheduleCard(card, body.grade as Grade, new Date());
  const nextRevision = revision + 1;
  const statements = [context.env.DB.prepare(`UPDATE cloud_saves SET party_json = COALESCE(?, party_json), storage_json = COALESCE(?, storage_json),
    active_monster_id = CASE WHEN ? THEN ? ELSE active_monster_id END, daily_new_card_limit = COALESCE(?, daily_new_card_limit),
    limit_date = CASE WHEN ? THEN ? ELSE limit_date END, extra_new_cards_today = COALESCE(?, extra_new_cards_today), revision = ?, updated_at = ? WHERE id = ? AND revision = ?`)
    .bind(
      playerState.party === undefined ? null : JSON.stringify(playerState.party), playerState.storage === undefined ? null : JSON.stringify(playerState.storage),
      playerState.activeMonsterId !== undefined ? 1 : 0, playerState.activeMonsterId ?? null, playerState.dailyNewCardLimit ?? null,
      playerState.limitDate !== undefined ? 1 : 0, playerState.limitDate ?? null, playerState.extraNewCardsToday ?? null,
      nextRevision, new Date().toISOString(), save.id, revision,
    ),
  context.env.DB.prepare(`INSERT INTO cloud_card_progress (save_id, deck_id, source_card_id, state, due_at, introduced_on, interval_days,
    stability, difficulty, reps, lapses, learning_steps, last_reviewed_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM cloud_saves WHERE id = ? AND revision = ?)
    ON CONFLICT(save_id, deck_id, source_card_id) DO UPDATE SET state = excluded.state, due_at = excluded.due_at, introduced_on = excluded.introduced_on,
    interval_days = excluded.interval_days, stability = excluded.stability, difficulty = excluded.difficulty, reps = excluded.reps,
    lapses = excluded.lapses, learning_steps = excluded.learning_steps, last_reviewed_at = excluded.last_reviewed_at`).bind(
      save.id, body.deckId, body.sourceCardId, scheduled.state, scheduled.dueAt, scheduled.introducedOn, scheduled.intervalDays,
      scheduled.stability ?? null, scheduled.difficulty ?? null, scheduled.reps ?? null, scheduled.lapses ?? null, scheduled.learningSteps ?? null,
      scheduled.lastReviewedAt ?? null, save.id, nextRevision),
  ];
  const results = await context.env.DB.batch<{ meta?: { changes?: number } }>(statements);
  if (!results[0]?.meta?.changes) return conflict();
  return json({ card: { deckId: body.deckId, sourceCardId: body.sourceCardId, ...scheduled }, revision: nextRevision });
}

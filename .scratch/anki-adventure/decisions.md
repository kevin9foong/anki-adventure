# Implementation decisions

## 2026-07-19 — Defeated party recovery returns directly to the Health House

- **Decision:** When the last living party monster faints, restore the whole party, close the battle, and move the overworld character to the Health House.
- **Rationale:** The current map has one Health House and no persisted multi-hub checkpoint, so it is the concrete implementation of the product brief's latest health-center checkpoint.
- **Trade-off:** A future multi-hub world will need a saved checkpoint position instead of the fixed Health House spawn.

## 2026-07-19 — New-card progress follows the daily allowance

- **Decision:** The Pack reports new cards first answered in the current Anki study day against the effective daily new-card allowance.
- **Rationale:** It directly explains the blue remaining-new counter; review and learning repeats must not consume this allowance.
- **Trade-off:** It is not a count of every card answered today; a separate review-activity statistic would be needed for that.

## 2026-07-19 — Grade defense applies to the immediate enemy response

- **Decision:** Easy negates, and Good reduces to 0.7×, the automatic enemy attack following that review grade.
- **Rationale:** The battle loop resolves the player's grade-based attack before the enemy's response, so this makes the requested “next turn” effect observable without persisting a separate status across cards or battles.
- **Trade-off:** The protection does not carry to a later turn when the enemy is defeated or a catch succeeds, because no enemy attack occurs in those outcomes.

## 2026-07-19 — APKG fields are resolved by Anki model name

- **Decision:** Resolve common word, meaning, reading, furigana, and example-sentence fields from the note model's field names; fall back to the original first-three-field convention when model metadata is unavailable.
- **Rationale:** Kaishi places its translation and examples after reading, while other decks commonly use Front/Back fields. Named resolution preserves both formats and makes sentence support reusable.
- **Trade-off:** Decks with unconventional field names still need aliases added to the importer or will use the positional fallback.

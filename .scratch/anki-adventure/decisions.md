# Implementation decisions

## 2026-07-19 — Defeated party recovery returns directly to the Health House

- **Decision:** When the last living party monster faints, restore the whole party, close the battle, and move the overworld character to the Health House.
- **Rationale:** The current map has one Health House and no persisted multi-hub checkpoint, so it is the concrete implementation of the product brief's latest health-center checkpoint.
- **Trade-off:** A future multi-hub world will need a saved checkpoint position instead of the fixed Health House spawn.

## 2026-07-19 — New-card progress follows the daily allowance

- **Decision:** The Pack reports new cards first answered in the current Anki study day against the effective daily new-card allowance.
- **Rationale:** It directly explains the blue remaining-new counter; review and learning repeats must not consume this allowance.
- **Trade-off:** It is not a count of every card answered today; a separate review-activity statistic would be needed for that.

-- CLOUD-2/5: text-only fields beyond the basic Anki front/back pair.
ALTER TABLE deck_cards ADD COLUMN example TEXT;
ALTER TABLE deck_cards ADD COLUMN example_translation TEXT;
ALTER TABLE deck_cards ADD COLUMN example_furigana TEXT;

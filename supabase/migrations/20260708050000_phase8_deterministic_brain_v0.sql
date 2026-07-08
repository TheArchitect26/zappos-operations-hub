-- =========================================================================
-- ZappOS - Phase 8 Deterministic Zapp Brain v0.
-- Duplicate guard for active deterministic insights generated from ZappOS data.
-- No AI execution, no predictions, no external AI API calls.
-- =========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS zapp_brain_insights_deterministic_active_dedupe_idx
  ON public.zapp_brain_insights(company_id, source, (evidence->>'dedupe_key'))
  WHERE source = 'deterministic_v0'
    AND status IN ('new','reviewing','needs_follow_up')
    AND evidence ? 'dedupe_key';

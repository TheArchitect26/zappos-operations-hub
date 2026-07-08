-- =========================================================================
-- ZappOS - Phase 5 QA provider cache security and data-integrity fixes.
-- =========================================================================

ALTER TABLE public.provider_observation_cache
  ADD CONSTRAINT provider_observation_cache_external_only
  CHECK (company_id IS NULL) NOT VALID;

ALTER TABLE public.provider_observation_cache
  ADD CONSTRAINT provider_observation_cache_no_raw_payload
  CHECK (raw_payload IS NULL) NOT VALID;

DROP POLICY IF EXISTS "provider_cache tracking roles write" ON public.provider_observation_cache;
DROP POLICY IF EXISTS "provider_cache tracking roles update" ON public.provider_observation_cache;

CREATE POLICY "provider_cache admin fleet write" ON public.provider_observation_cache
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IS NULL
    AND raw_payload IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','fleet_manager')
    )
  );

CREATE POLICY "provider_cache admin fleet update" ON public.provider_observation_cache
  FOR UPDATE TO authenticated
  USING (
    company_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','fleet_manager')
    )
  )
  WITH CHECK (
    company_id IS NULL
    AND raw_payload IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','fleet_manager')
    )
  );

CREATE OR REPLACE FUNCTION public.purge_expired_provider_observation_cache(_before TIMESTAMPTZ DEFAULT now())
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _deleted INTEGER;
  _boundary TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles cm
    WHERE cm.user_id = auth.uid()
      AND cm.role IN ('admin','fleet_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized to purge provider cache';
  END IF;

  _boundary := COALESCE(_before, now());

  DELETE FROM public.provider_observation_cache
  WHERE expires_at <= _boundary;

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_provider_observation_cache(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_provider_observation_cache(timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_provider_observation_cache(timestamptz) TO authenticated;

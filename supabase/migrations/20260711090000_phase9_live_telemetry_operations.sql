-- =========================================================================
-- ZappOS - Phase 9 Live Telemetry Operations, timeline events, and audit log.
-- Deterministic operations only. No AI, no prediction, no route optimization.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.operational_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tracking_session_id UUID REFERENCES public.tracking_sessions(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (
    source IN ('trip','job','gps','geofence','deviation','incident','maintenance','dispatcher','brain')
  ),
  event_type TEXT NOT NULL,
  label TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, source, event_type, occurred_at, tracking_session_id, job_id)
);

CREATE INDEX IF NOT EXISTS operational_timeline_company_time_idx
  ON public.operational_timeline_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS operational_timeline_session_time_idx
  ON public.operational_timeline_events(tracking_session_id, occurred_at);
CREATE INDEX IF NOT EXISTS operational_timeline_metadata_idx
  ON public.operational_timeline_events USING GIN(metadata);

CREATE TABLE IF NOT EXISTS public.dispatcher_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (
    action IN (
      'dispatcher_assigned_job',
      'dispatcher_cancelled',
      'dispatcher_acknowledged_incident',
      'dispatcher_dismissed_insight',
      'dispatcher_reran_brain',
      'dispatcher_replayed_trip'
    )
  ),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  tracking_session_id UUID REFERENCES public.tracking_sessions(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatcher_audit_company_time_idx
  ON public.dispatcher_audit_log(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS dispatcher_audit_actor_time_idx
  ON public.dispatcher_audit_log(actor_user_id, occurred_at DESC);

ALTER TABLE public.operational_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatcher_audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.operational_timeline_events TO authenticated;
GRANT SELECT, INSERT ON public.dispatcher_audit_log TO authenticated;
GRANT ALL ON public.operational_timeline_events TO service_role;
GRANT ALL ON public.dispatcher_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_immutable_operations_history_change()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Operational history is immutable';
END;
$$;

DROP TRIGGER IF EXISTS operational_timeline_events_immutable ON public.operational_timeline_events;
CREATE TRIGGER operational_timeline_events_immutable
  BEFORE UPDATE OR DELETE ON public.operational_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_operations_history_change();

DROP TRIGGER IF EXISTS dispatcher_audit_log_immutable ON public.dispatcher_audit_log;
CREATE TRIGGER dispatcher_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.dispatcher_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_operations_history_change();

CREATE POLICY "operational timeline role scoped read" ON public.operational_timeline_events
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher','viewer']::public.app_role[])
    OR EXISTS (
      SELECT 1
      FROM public.tracking_sessions ts
      JOIN public.drivers d ON d.id = ts.driver_id AND d.company_id = ts.company_id
      WHERE ts.id = operational_timeline_events.tracking_session_id
        AND d.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.drivers d ON d.id = j.driver_id AND d.company_id = j.company_id
      WHERE j.id = operational_timeline_events.job_id
        AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "operational timeline ops insert" ON public.operational_timeline_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[])
  );

CREATE POLICY "dispatcher audit role scoped read" ON public.dispatcher_audit_log
  FOR SELECT TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher','viewer']::public.app_role[]));

CREATE POLICY "dispatcher audit ops insert" ON public.dispatcher_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[])
  );

CREATE OR REPLACE FUNCTION public.log_dispatcher_audit(
  _company_id UUID,
  _action TEXT,
  _entity_type TEXT,
  _entity_id UUID DEFAULT NULL,
  _tracking_session_id UUID DEFAULT NULL,
  _job_id UUID DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.dispatcher_audit_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _row public.dispatcher_audit_log%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(_company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to write dispatcher audit history';
  END IF;

  INSERT INTO public.dispatcher_audit_log (
    company_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    tracking_session_id,
    job_id,
    metadata
  )
  VALUES (
    _company_id,
    auth.uid(),
    _action,
    _entity_type,
    _entity_id,
    _tracking_session_id,
    _job_id,
    COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING * INTO _row;

  INSERT INTO public.operational_timeline_events (
    company_id,
    tracking_session_id,
    job_id,
    source,
    event_type,
    label,
    severity,
    occurred_at,
    metadata
  )
  VALUES (
    _company_id,
    _tracking_session_id,
    _job_id,
    'dispatcher',
    _action,
    initcap(replace(_action, '_', ' ')),
    'info',
    _row.occurred_at,
    jsonb_build_object('audit_log_id', _row.id, 'actor_user_id', auth.uid()) || COALESCE(_metadata, '{}'::jsonb)
  )
  ON CONFLICT DO NOTHING;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.log_dispatcher_audit(uuid, text, text, uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_dispatcher_audit(uuid, text, text, uuid, uuid, uuid, jsonb) TO authenticated;

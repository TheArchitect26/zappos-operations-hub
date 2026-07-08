-- =========================================================================
-- ZappOS - Phase 6 Route Intelligence v1.
-- Historical deterministic route baselines, job performance records, and delay events.
-- No predictions, no AI, no model outputs.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.route_segment_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  route_key TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  pickup_location TEXT,
  dropoff_location TEXT,
  completed_trip_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_trip_count >= 0),
  first_completed_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  average_observed_duration_seconds DOUBLE PRECISION,
  average_observed_distance_meters DOUBLE PRECISION,
  average_delay_minutes DOUBLE PRECISION,
  average_stop_count DOUBLE PRECISION,
  delayed_trip_count INTEGER NOT NULL DEFAULT 0 CHECK (delayed_trip_count >= 0),
  failed_trip_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_trip_count >= 0),
  poor_quality_trip_count INTEGER NOT NULL DEFAULT 0 CHECK (poor_quality_trip_count >= 0),
  data_quality_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
  confidence TEXT NOT NULL DEFAULT 'insufficient_data'
    CHECK (confidence IN ('high','medium','low','insufficient_data')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, route_key)
);

CREATE TABLE IF NOT EXISTS public.route_performance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  tracking_session_id UUID REFERENCES public.tracking_sessions(id) ON DELETE SET NULL,
  route_baseline_id UUID REFERENCES public.route_segment_baselines(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  pickup_location TEXT,
  dropoff_location TEXT,
  route_key TEXT NOT NULL,
  status TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  actual_started_at TIMESTAMPTZ,
  actual_arrived_at TIMESTAMPTZ,
  actual_completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  observed_duration_seconds DOUBLE PRECISION,
  observed_distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
  late_start_minutes DOUBLE PRECISION,
  arrival_delay_minutes DOUBLE PRECISION,
  completion_delay_minutes DOUBLE PRECISION,
  delay_minutes DOUBLE PRECISION,
  estimated_stop_count INTEGER NOT NULL DEFAULT 0 CHECK (estimated_stop_count >= 0),
  delay_events TEXT[] NOT NULL DEFAULT '{}',
  observed_point_count INTEGER NOT NULL DEFAULT 0 CHECK (observed_point_count >= 0),
  accepted_point_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_point_count >= 0),
  rejected_point_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_point_count >= 0),
  poor_point_count INTEGER NOT NULL DEFAULT 0 CHECK (poor_point_count >= 0),
  data_quality_score DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
  confidence TEXT NOT NULL DEFAULT 'insufficient_data'
    CHECK (confidence IN ('high','medium','low','insufficient_data')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_id)
);

CREATE INDEX IF NOT EXISTS route_segment_baselines_company_delay_idx
  ON public.route_segment_baselines(company_id, average_delay_minutes DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS route_performance_records_company_completed_idx
  ON public.route_performance_records(company_id, actual_completed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS route_performance_records_company_events_idx
  ON public.route_performance_records USING GIN(delay_events);

ALTER TABLE public.route_segment_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_performance_records ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.route_segment_baselines TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.route_performance_records TO authenticated;
GRANT ALL ON public.route_segment_baselines TO service_role;
GRANT ALL ON public.route_performance_records TO service_role;

DROP TRIGGER IF EXISTS route_segment_baselines_updated ON public.route_segment_baselines;
CREATE TRIGGER route_segment_baselines_updated
  BEFORE UPDATE ON public.route_segment_baselines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS route_performance_records_updated ON public.route_performance_records;
CREATE TRIGGER route_performance_records_updated
  BEFORE UPDATE ON public.route_performance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "route_baselines tracking roles read" ON public.route_segment_baselines
  FOR SELECT TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher','viewer']::public.app_role[]));

CREATE POLICY "route_baselines ops write" ON public.route_segment_baselines
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));

CREATE POLICY "route_baselines ops update" ON public.route_segment_baselines
  FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));

CREATE POLICY "route_records tracking roles read" ON public.route_performance_records
  FOR SELECT TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher','viewer']::public.app_role[]));

CREATE POLICY "route_records ops write" ON public.route_performance_records
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));

CREATE POLICY "route_records ops update" ON public.route_performance_records
  FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.route_intelligence_route_key(
  _customer_id UUID,
  _pickup_location TEXT,
  _dropoff_location TEXT
)
RETURNS TEXT
LANGUAGE SQL IMMUTABLE SET search_path = public
AS $$
  SELECT
    'customer:' || COALESCE(_customer_id::text, 'no_customer') ||
    '|pickup:' || COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(_pickup_location, '')), '\s+', ' ', 'g')), ''), 'unknown') ||
    '|dropoff:' || COALESCE(NULLIF(lower(regexp_replace(trim(COALESCE(_dropoff_location, '')), '\s+', ' ', 'g')), ''), 'unknown');
$$;

CREATE OR REPLACE FUNCTION public.refresh_route_intelligence_for_company(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _records INTEGER := 0;
  _baselines INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(_company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to refresh route intelligence';
  END IF;

  WITH point_quality AS (
    SELECT
      tracking_session_id,
      count(*) FILTER (WHERE quality_status = 'poor')::int AS poor_point_count
    FROM public.tracking_telemetry_points
    WHERE company_id = _company_id
    GROUP BY tracking_session_id
  ),
  ordered_points AS (
    SELECT
      tracking_session_id,
      device_timestamp,
      sequence_number,
      movement_state,
      quality_status,
      CASE
        WHEN movement_state = lag(movement_state) OVER (
          PARTITION BY tracking_session_id ORDER BY device_timestamp, sequence_number
        ) THEN 0
        ELSE 1
      END AS new_group
    FROM public.tracking_telemetry_points
    WHERE company_id = _company_id
      AND quality_status <> 'rejected'
  ),
  grouped_points AS (
    SELECT
      *,
      sum(new_group) OVER (
        PARTITION BY tracking_session_id ORDER BY device_timestamp, sequence_number
      ) AS movement_group
    FROM ordered_points
  ),
  stop_counts AS (
    SELECT
      tracking_session_id,
      count(*)::int AS estimated_stop_count
    FROM (
      SELECT
        tracking_session_id,
        movement_group,
        min(device_timestamp) AS started_at,
        max(device_timestamp) AS ended_at,
        count(*) AS point_count
      FROM grouped_points
      WHERE movement_state = 'stationary'
      GROUP BY tracking_session_id, movement_group
    ) stops
    WHERE point_count >= 2
      AND extract(epoch FROM ended_at - started_at) >= 120
    GROUP BY tracking_session_id
  ),
  source_rows AS (
    SELECT
      j.company_id,
      j.id AS job_id,
      ts.id AS tracking_session_id,
      j.customer_id,
      j.pickup_location,
      j.dropoff_location,
      public.route_intelligence_route_key(j.customer_id, j.pickup_location, j.dropoff_location) AS route_key,
      j.status::text AS status,
      j.scheduled_at,
      COALESCE(j.started_at, ts.started_at) AS actual_started_at,
      j.arrived_at AS actual_arrived_at,
      j.completed_at AS actual_completed_at,
      j.failed_at,
      CASE
        WHEN s.first_point_at IS NOT NULL AND s.last_point_at IS NOT NULL AND s.last_point_at >= s.first_point_at
          THEN extract(epoch FROM s.last_point_at - s.first_point_at)
        WHEN COALESCE(j.started_at, ts.started_at) IS NOT NULL AND COALESCE(j.completed_at, j.failed_at, ts.ended_at) IS NOT NULL
          THEN greatest(0, extract(epoch FROM COALESCE(j.completed_at, j.failed_at, ts.ended_at) - COALESCE(j.started_at, ts.started_at)))
        ELSE NULL
      END AS observed_duration_seconds,
      COALESCE(s.observed_distance, 0)::double precision AS observed_distance_meters,
      CASE WHEN j.scheduled_at IS NOT NULL AND COALESCE(j.started_at, ts.started_at) IS NOT NULL
        THEN round((extract(epoch FROM COALESCE(j.started_at, ts.started_at) - j.scheduled_at) / 60.0)::numeric, 2)::double precision END AS late_start_minutes,
      CASE WHEN j.scheduled_at IS NOT NULL AND j.arrived_at IS NOT NULL
        THEN round((extract(epoch FROM j.arrived_at - j.scheduled_at) / 60.0)::numeric, 2)::double precision END AS arrival_delay_minutes,
      CASE WHEN j.scheduled_at IS NOT NULL AND j.completed_at IS NOT NULL
        THEN round((extract(epoch FROM j.completed_at - j.scheduled_at) / 60.0)::numeric, 2)::double precision END AS completion_delay_minutes,
      COALESCE(sc.estimated_stop_count, 0)::int AS estimated_stop_count,
      COALESCE(s.observed_point_count, 0)::int AS observed_point_count,
      COALESCE(s.accepted_point_count, 0)::int AS accepted_point_count,
      COALESCE(s.rejected_point_count, 0)::int AS rejected_point_count,
      COALESCE(pq.poor_point_count, 0)::int AS poor_point_count,
      COALESCE(extract(epoch FROM s.stationary_duration), 0)::double precision AS stationary_seconds,
      s.average_observed_speed
    FROM public.jobs j
    LEFT JOIN public.tracking_sessions ts ON ts.job_id = j.id AND ts.company_id = j.company_id
    LEFT JOIN public.tracking_summaries s ON s.tracking_session_id = ts.id AND s.company_id = j.company_id
    LEFT JOIN point_quality pq ON pq.tracking_session_id = ts.id
    LEFT JOIN stop_counts sc ON sc.tracking_session_id = ts.id
    WHERE j.company_id = _company_id
      AND j.status IN ('completed','failed')
  ),
  evaluated AS (
    SELECT
      *,
      greatest(
        COALESCE(late_start_minutes, '-Infinity'::double precision),
        COALESCE(arrival_delay_minutes, '-Infinity'::double precision),
        COALESCE(completion_delay_minutes, '-Infinity'::double precision)
      ) AS raw_delay_minutes,
      CASE
        WHEN observed_point_count <= 0 THEN 0
        ELSE round(least(100, greatest(0,
          ((accepted_point_count::double precision / observed_point_count::double precision) * 70) +
          ((1 - (rejected_point_count::double precision / observed_point_count::double precision)) * 20) +
          ((1 - (poor_point_count::double precision / observed_point_count::double precision)) * 10)
        ))::numeric, 2)::double precision
      END AS data_quality_score
    FROM source_rows
  ),
  final_rows AS (
    SELECT
      *,
      CASE WHEN raw_delay_minutes = '-Infinity'::double precision THEN NULL ELSE raw_delay_minutes END AS delay_minutes,
      CASE
        WHEN accepted_point_count < 2 THEN 'insufficient_data'
        WHEN accepted_point_count >= 12 AND data_quality_score >= 80 AND rejected_point_count <= observed_point_count * 0.1 THEN 'high'
        WHEN data_quality_score >= 50 THEN 'medium'
        ELSE 'low'
      END AS confidence,
      array_remove(ARRAY[
        CASE WHEN late_start_minutes > 5 THEN 'late_start' END,
        CASE WHEN stationary_seconds >= 600 OR estimated_stop_count > 0 THEN 'long_stationary_period' END,
        CASE WHEN observed_distance_meters >= 500
          AND COALESCE(observed_duration_seconds, 0) >= 900
          AND average_observed_speed IS NOT NULL
          AND average_observed_speed < 2 THEN 'slow_progress' END,
        CASE WHEN completion_delay_minutes > 30 THEN 'delayed_completion' END,
        CASE WHEN status = 'failed' OR failed_at IS NOT NULL THEN 'failed_trip' END,
        CASE WHEN data_quality_score < 50 OR accepted_point_count < 2 THEN 'poor_telemetry_quality' END
      ]::text[], NULL) AS delay_events
    FROM evaluated
  ),
  upserted AS (
    INSERT INTO public.route_performance_records (
      company_id, job_id, tracking_session_id, customer_id, pickup_location, dropoff_location, route_key,
      status, scheduled_at, actual_started_at, actual_arrived_at, actual_completed_at, failed_at,
      observed_duration_seconds, observed_distance_meters, late_start_minutes, arrival_delay_minutes,
      completion_delay_minutes, delay_minutes, estimated_stop_count, delay_events, observed_point_count,
      accepted_point_count, rejected_point_count, poor_point_count, data_quality_score, confidence, updated_at
    )
    SELECT
      company_id, job_id, tracking_session_id, customer_id, pickup_location, dropoff_location, route_key,
      status, scheduled_at, actual_started_at, actual_arrived_at, actual_completed_at, failed_at,
      observed_duration_seconds, observed_distance_meters, late_start_minutes, arrival_delay_minutes,
      completion_delay_minutes, delay_minutes, estimated_stop_count, delay_events, observed_point_count,
      accepted_point_count, rejected_point_count, poor_point_count, data_quality_score, confidence, now()
    FROM final_rows
    ON CONFLICT (company_id, job_id) DO UPDATE SET
      tracking_session_id = EXCLUDED.tracking_session_id,
      customer_id = EXCLUDED.customer_id,
      pickup_location = EXCLUDED.pickup_location,
      dropoff_location = EXCLUDED.dropoff_location,
      route_key = EXCLUDED.route_key,
      status = EXCLUDED.status,
      scheduled_at = EXCLUDED.scheduled_at,
      actual_started_at = EXCLUDED.actual_started_at,
      actual_arrived_at = EXCLUDED.actual_arrived_at,
      actual_completed_at = EXCLUDED.actual_completed_at,
      failed_at = EXCLUDED.failed_at,
      observed_duration_seconds = EXCLUDED.observed_duration_seconds,
      observed_distance_meters = EXCLUDED.observed_distance_meters,
      late_start_minutes = EXCLUDED.late_start_minutes,
      arrival_delay_minutes = EXCLUDED.arrival_delay_minutes,
      completion_delay_minutes = EXCLUDED.completion_delay_minutes,
      delay_minutes = EXCLUDED.delay_minutes,
      estimated_stop_count = EXCLUDED.estimated_stop_count,
      delay_events = EXCLUDED.delay_events,
      observed_point_count = EXCLUDED.observed_point_count,
      accepted_point_count = EXCLUDED.accepted_point_count,
      rejected_point_count = EXCLUDED.rejected_point_count,
      poor_point_count = EXCLUDED.poor_point_count,
      data_quality_score = EXCLUDED.data_quality_score,
      confidence = EXCLUDED.confidence,
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO _records FROM upserted;

  WITH baseline_source AS (
    SELECT
      company_id,
      route_key,
      max(customer_id) AS customer_id,
      max(pickup_location) AS pickup_location,
      max(dropoff_location) AS dropoff_location,
      count(*) FILTER (WHERE status = 'completed')::int AS completed_trip_count,
      min(actual_completed_at) FILTER (WHERE status = 'completed') AS first_completed_at,
      max(actual_completed_at) FILTER (WHERE status = 'completed') AS last_completed_at,
      avg(observed_duration_seconds) FILTER (WHERE status = 'completed') AS average_observed_duration_seconds,
      avg(observed_distance_meters) FILTER (WHERE status = 'completed') AS average_observed_distance_meters,
      avg(delay_minutes) AS average_delay_minutes,
      avg(estimated_stop_count)::double precision AS average_stop_count,
      count(*) FILTER (WHERE delay_minutes > 5 OR array_length(delay_events, 1) > 0)::int AS delayed_trip_count,
      count(*) FILTER (WHERE status = 'failed')::int AS failed_trip_count,
      count(*) FILTER (WHERE data_quality_score < 50 OR confidence = 'insufficient_data')::int AS poor_quality_trip_count,
      round(avg(data_quality_score)::numeric, 2)::double precision AS data_quality_score
    FROM public.route_performance_records
    WHERE company_id = _company_id
    GROUP BY company_id, route_key
  ),
  baseline_final AS (
    SELECT
      *,
      CASE
        WHEN completed_trip_count < 2 THEN 'insufficient_data'
        WHEN data_quality_score >= 80 THEN 'high'
        WHEN data_quality_score >= 50 THEN 'medium'
        ELSE 'low'
      END AS confidence
    FROM baseline_source
  ),
  upserted AS (
    INSERT INTO public.route_segment_baselines (
      company_id, route_key, customer_id, pickup_location, dropoff_location,
      completed_trip_count, first_completed_at, last_completed_at,
      average_observed_duration_seconds, average_observed_distance_meters,
      average_delay_minutes, average_stop_count, delayed_trip_count, failed_trip_count,
      poor_quality_trip_count, data_quality_score, confidence, updated_at
    )
    SELECT
      company_id, route_key, customer_id, pickup_location, dropoff_location,
      completed_trip_count, first_completed_at, last_completed_at,
      average_observed_duration_seconds, average_observed_distance_meters,
      average_delay_minutes, average_stop_count, delayed_trip_count, failed_trip_count,
      poor_quality_trip_count, data_quality_score, confidence, now()
    FROM baseline_final
    ON CONFLICT (company_id, route_key) DO UPDATE SET
      customer_id = EXCLUDED.customer_id,
      pickup_location = EXCLUDED.pickup_location,
      dropoff_location = EXCLUDED.dropoff_location,
      completed_trip_count = EXCLUDED.completed_trip_count,
      first_completed_at = EXCLUDED.first_completed_at,
      last_completed_at = EXCLUDED.last_completed_at,
      average_observed_duration_seconds = EXCLUDED.average_observed_duration_seconds,
      average_observed_distance_meters = EXCLUDED.average_observed_distance_meters,
      average_delay_minutes = EXCLUDED.average_delay_minutes,
      average_stop_count = EXCLUDED.average_stop_count,
      delayed_trip_count = EXCLUDED.delayed_trip_count,
      failed_trip_count = EXCLUDED.failed_trip_count,
      poor_quality_trip_count = EXCLUDED.poor_quality_trip_count,
      data_quality_score = EXCLUDED.data_quality_score,
      confidence = EXCLUDED.confidence,
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO _baselines FROM upserted;

  UPDATE public.route_performance_records r
  SET route_baseline_id = b.id,
      updated_at = now()
  FROM public.route_segment_baselines b
  WHERE r.company_id = _company_id
    AND b.company_id = r.company_id
    AND b.route_key = r.route_key;

  RETURN jsonb_build_object('ok', true, 'records', _records, 'baselines', _baselines);
END;
$$;

REVOKE ALL ON FUNCTION public.route_intelligence_route_key(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_route_intelligence_for_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.route_intelligence_route_key(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_route_intelligence_for_company(uuid) TO authenticated;

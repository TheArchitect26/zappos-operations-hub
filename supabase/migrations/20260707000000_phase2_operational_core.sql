-- =========================================================================
-- ZappOS - Phase 2 operational core hardening
-- Adds role-aware RLS, guarded dispatch assignment, event logging, and buckets.
-- =========================================================================

-- ---------- Storage buckets --------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('proof-of-completion', 'proof-of-completion', false),
  ('incident-photos', 'incident-photos', false),
  ('documents', 'documents', false),
  ('maintenance-invoices', 'maintenance-invoices', false)
ON CONFLICT (id) DO NOTHING;

-- ---------- Role helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_any_role(_company_id UUID, _roles public.app_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND company_id = _company_id AND role = ANY(_roles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;

-- ---------- Job event logging ------------------------------------------
CREATE OR REPLACE FUNCTION public.log_job_event(
  _company_id UUID,
  _job_id UUID,
  _event_type TEXT,
  _message TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _event_id UUID;
BEGIN
  INSERT INTO public.job_events (company_id, job_id, actor_id, event_type, message, metadata)
  VALUES (_company_id, _job_id, auth.uid(), _event_type, _message, _metadata)
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_job_event(uuid, uuid, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_job_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_job_event(
      NEW.company_id,
      NEW.id,
      'job_created',
      'Job created',
      jsonb_build_object('reference', NEW.reference, 'status', NEW.status, 'priority', NEW.priority)
    );
    RETURN NEW;
  END IF;

  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    PERFORM public.log_job_event(
      NEW.company_id,
      NEW.id,
      'driver_assigned',
      'Driver assignment changed',
      jsonb_build_object('old_driver_id', OLD.driver_id, 'new_driver_id', NEW.driver_id)
    );
  END IF;

  IF NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    PERFORM public.log_job_event(
      NEW.company_id,
      NEW.id,
      'vehicle_assigned',
      'Vehicle assignment changed',
      jsonb_build_object('old_vehicle_id', OLD.vehicle_id, 'new_vehicle_id', NEW.vehicle_id)
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_job_event(
      NEW.company_id,
      NEW.id,
      CASE WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'status_changed' END,
      'Status changed',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM public.log_job_event(
      NEW.company_id,
      NEW.id,
      'priority_changed',
      'Priority changed',
      jsonb_build_object('old_priority', OLD.priority, 'new_priority', NEW.priority)
    );
  END IF;

  IF (to_jsonb(NEW) - ARRAY['updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at'])
     AND NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id
     AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.priority IS NOT DISTINCT FROM OLD.priority THEN
    PERFORM public.log_job_event(NEW.company_id, NEW.id, 'edited', 'Job edited', NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_log_changes ON public.jobs;
CREATE TRIGGER jobs_log_changes
  AFTER INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.log_job_changes();

-- ---------- Conflict detection / guarded assignment ---------------------
CREATE OR REPLACE FUNCTION public.job_assignment_conflicts(
  _company_id UUID,
  _job_id UUID,
  _driver_id UUID DEFAULT NULL,
  _vehicle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _conflicts JSONB := '[]'::jsonb;
  _driver public.drivers%ROWTYPE;
  _vehicle public.vehicles%ROWTYPE;
  _active_refs TEXT[];
BEGIN
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;

  IF _driver_id IS NOT NULL THEN
    SELECT * INTO _driver FROM public.drivers WHERE id = _driver_id AND company_id = _company_id;
    IF NOT FOUND THEN
      _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','driver_missing','severity','error','message','Driver is not available in this company.'));
    ELSE
      IF _driver.status = 'suspended' THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','driver_suspended','severity','error','message','Driver is suspended.'));
      END IF;
      IF _driver.status = 'off_duty' THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','driver_off_duty','severity','error','message','Driver is off duty.'));
      END IF;
      IF _driver.licence_expiry IS NOT NULL AND _driver.licence_expiry < current_date THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','driver_licence_expired','severity','error','message','Driver licence is expired.'));
      END IF;
      SELECT array_agg(reference ORDER BY created_at DESC) INTO _active_refs
      FROM public.jobs
      WHERE company_id = _company_id
        AND driver_id = _driver_id
        AND id <> COALESCE(_job_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status IN ('assigned','accepted','in_progress','arrived');
      IF coalesce(array_length(_active_refs, 1), 0) > 0 THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','driver_on_active_job','severity','error','message','Driver is already assigned to an active job.','references',to_jsonb(_active_refs)));
      END IF;
    END IF;
  END IF;

  IF _vehicle_id IS NOT NULL THEN
    SELECT * INTO _vehicle FROM public.vehicles WHERE id = _vehicle_id AND company_id = _company_id;
    IF NOT FOUND THEN
      _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','vehicle_missing','severity','error','message','Vehicle is not available in this company.'));
    ELSE
      IF _vehicle.status = 'maintenance' THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','vehicle_in_maintenance','severity','error','message','Vehicle is in maintenance.'));
      END IF;
      IF _vehicle.status = 'out_of_service' THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','vehicle_out_of_service','severity','error','message','Vehicle is out of service.'));
      END IF;
      IF _vehicle.licence_expiry IS NOT NULL AND _vehicle.licence_expiry < current_date THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','vehicle_licence_expired','severity','error','message','Vehicle licence is expired.'));
      END IF;
      IF _vehicle.insurance_expiry IS NOT NULL AND _vehicle.insurance_expiry < current_date THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','vehicle_insurance_expired','severity','error','message','Vehicle insurance is expired.'));
      END IF;
      SELECT array_agg(reference ORDER BY created_at DESC) INTO _active_refs
      FROM public.jobs
      WHERE company_id = _company_id
        AND vehicle_id = _vehicle_id
        AND id <> COALESCE(_job_id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status IN ('assigned','accepted','in_progress','arrived');
      IF coalesce(array_length(_active_refs, 1), 0) > 0 THEN
        _conflicts := _conflicts || jsonb_build_array(jsonb_build_object('type','vehicle_on_active_job','severity','error','message','Vehicle is already assigned to an active job.','references',to_jsonb(_active_refs)));
      END IF;
    END IF;
  END IF;

  RETURN _conflicts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.job_assignment_conflicts(uuid, uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_invalid_job_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _conflicts JSONB;
  _override BOOLEAN := current_setting('app.assignment_override', true) = 'on';
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id THEN
    _conflicts := public.job_assignment_conflicts(NEW.company_id, NEW.id, NEW.driver_id, NEW.vehicle_id);
    IF jsonb_array_length(_conflicts) > 0 AND NOT _override THEN
      RAISE EXCEPTION 'Assignment conflict: %', _conflicts::text;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_prevent_invalid_assignment ON public.jobs;
CREATE TRIGGER jobs_prevent_invalid_assignment
  BEFORE INSERT OR UPDATE OF driver_id, vehicle_id ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_invalid_job_assignment();

CREATE OR REPLACE FUNCTION public.assign_job_with_conflict_check(
  _job_id UUID,
  _driver_id UUID,
  _vehicle_id UUID,
  _admin_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _job public.jobs%ROWTYPE;
  _conflicts JSONB;
  _can_override BOOLEAN;
BEGIN
  SELECT * INTO _job FROM public.jobs WHERE id = _job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF NOT public.has_any_role(_job.company_id, ARRAY['admin','dispatcher']::public.app_role[]) THEN
    RAISE EXCEPTION 'You do not have permission to dispatch jobs';
  END IF;

  _conflicts := public.job_assignment_conflicts(_job.company_id, _job_id, _driver_id, _vehicle_id);
  _can_override := public.has_role(_job.company_id, 'admin');

  IF jsonb_array_length(_conflicts) > 0 AND (NOT _admin_override OR NOT _can_override) THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', _conflicts, 'override_allowed', _can_override);
  END IF;

  PERFORM set_config('app.assignment_override', CASE WHEN _admin_override THEN 'on' ELSE 'off' END, true);

  UPDATE public.jobs
  SET driver_id = _driver_id,
      vehicle_id = _vehicle_id,
      status = CASE WHEN status = 'unassigned' THEN 'assigned' ELSE status END
  WHERE id = _job_id;

  IF jsonb_array_length(_conflicts) > 0 AND _admin_override THEN
    PERFORM public.log_job_event(
      _job.company_id,
      _job_id,
      'assignment_override',
      'Admin override used during dispatch assignment',
      jsonb_build_object('conflicts', _conflicts, 'driver_id', _driver_id, 'vehicle_id', _vehicle_id)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'conflicts', _conflicts, 'override_used', _admin_override AND jsonb_array_length(_conflicts) > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_job_with_conflict_check(uuid, uuid, uuid, boolean) TO authenticated;

-- ---------- Role-aware table policies ----------------------------------
DROP POLICY IF EXISTS "customers tenant rw" ON public.customers;
DROP POLICY IF EXISTS "drivers tenant rw" ON public.drivers;
DROP POLICY IF EXISTS "vehicles tenant rw" ON public.vehicles;
DROP POLICY IF EXISTS "jobs tenant rw" ON public.jobs;
DROP POLICY IF EXISTS "maintenance tenant rw" ON public.maintenance;
DROP POLICY IF EXISTS "incidents tenant rw" ON public.incidents;
DROP POLICY IF EXISTS "documents tenant rw" ON public.documents;
DROP POLICY IF EXISTS "job_events tenant insert" ON public.job_events;

CREATE POLICY "customers tenant read" ON public.customers FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "customers admin dispatcher insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','dispatcher']::public.app_role[]));
CREATE POLICY "customers admin dispatcher update" ON public.customers FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','dispatcher']::public.app_role[]));
CREATE POLICY "customers admin delete" ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "drivers tenant read" ON public.drivers FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "drivers fleet dispatch insert" ON public.drivers FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));
CREATE POLICY "drivers fleet dispatch update" ON public.drivers FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));
CREATE POLICY "drivers admin delete" ON public.drivers FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "vehicles tenant read" ON public.vehicles FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "vehicles fleet dispatch insert" ON public.vehicles FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));
CREATE POLICY "vehicles fleet dispatch update" ON public.vehicles FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));
CREATE POLICY "vehicles admin delete" ON public.vehicles FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "jobs tenant read" ON public.jobs FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "jobs operations insert" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','dispatcher']::public.app_role[]));
CREATE POLICY "jobs operations update" ON public.jobs FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','dispatcher']::public.app_role[]));
CREATE POLICY "jobs assigned driver update" ON public.jobs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = jobs.driver_id AND d.company_id = jobs.company_id AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.id = jobs.driver_id AND d.company_id = jobs.company_id AND d.user_id = auth.uid()
    )
  );
CREATE POLICY "jobs admin delete" ON public.jobs FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "maintenance tenant read" ON public.maintenance FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "maintenance fleet insert" ON public.maintenance FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager']::public.app_role[]));
CREATE POLICY "maintenance fleet update" ON public.maintenance FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager']::public.app_role[]));
CREATE POLICY "maintenance admin delete" ON public.maintenance FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "incidents tenant read" ON public.incidents FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "incidents ops insert" ON public.incidents FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher','driver']::public.app_role[]));
CREATE POLICY "incidents ops update" ON public.incidents FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher']::public.app_role[]));
CREATE POLICY "incidents admin delete" ON public.incidents FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "documents tenant read" ON public.documents FOR SELECT TO authenticated
  USING (public.is_company_member(company_id));
CREATE POLICY "documents fleet insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager']::public.app_role[]));
CREATE POLICY "documents fleet update" ON public.documents FOR UPDATE TO authenticated
  USING (public.has_any_role(company_id, ARRAY['admin','fleet_manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager']::public.app_role[]));
CREATE POLICY "documents admin delete" ON public.documents FOR DELETE TO authenticated
  USING (public.has_role(company_id, 'admin'));

CREATE POLICY "job_events system insert" ON public.job_events FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(company_id, ARRAY['admin','fleet_manager','dispatcher','driver']::public.app_role[]));

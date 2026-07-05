
-- Add search_path to remaining helpers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.assign_job_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.reference IS NULL OR NEW.reference = '' THEN
    NEW.reference := 'J-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.jobs_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- Restrict SECURITY DEFINER helpers: only authenticated (used by RLS) may execute.
REVOKE ALL ON FUNCTION public.is_company_member(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;

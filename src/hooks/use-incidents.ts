import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useSession } from "@/lib/session";
import type { Database } from "@/integrations/supabase/types";

type Incident = Database["public"]["Tables"]["incidents"]["Row"];
type IncidentInsert = Database["public"]["Tables"]["incidents"]["Insert"];

function filePath(companyId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${companyId}/incidents/${crypto.randomUUID()}-${safeName}`;
}

export function useIncidents() {
  const { activeCompany } = useCompany();
  const { user } = useSession();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!activeCompany) {
      setIncidents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("incidents")
        .select("*")
        .eq("company_id", activeCompany.id)
        .order("occurred_at", { ascending: false });
      if (err) throw err;
      setIncidents(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetch();
  }, [activeCompany?.id]);

  const uploadPhotos = async (files: File[]) => {
    if (!activeCompany) throw new Error("No active company");
    const paths: string[] = [];
    for (const file of files) {
      const path = filePath(activeCompany.id, file);
      const { error: uploadError } = await supabase.storage
        .from("incident-photos")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      paths.push(path);
    }
    return paths;
  };

  const create = async (
    data: Omit<IncidentInsert, "id" | "company_id" | "created_at" | "updated_at" | "reported_by">,
    photos: File[] = [],
  ) => {
    if (!activeCompany) throw new Error("No active company");
    const photoUrls = photos.length > 0 ? await uploadPhotos(photos) : (data.photo_urls ?? null);
    const { data: incident, error: err } = await supabase
      .from("incidents")
      .insert([
        {
          ...data,
          company_id: activeCompany.id,
          reported_by: user?.id ?? null,
          photo_urls: photoUrls,
        },
      ])
      .select()
      .single();
    if (err) throw err;
    await fetch();
    return incident;
  };

  const update = async (id: string, updates: Partial<Incident>) => {
    const { error: err } = await supabase.from("incidents").update(updates).eq("id", id);
    if (err) throw err;
    await fetch();
  };

  const delete_ = async (id: string) => {
    const { error: err } = await supabase.from("incidents").delete().eq("id", id);
    if (err) throw err;
    await fetch();
  };

  return { incidents, loading, error, fetch, create, update, delete: delete_ };
}

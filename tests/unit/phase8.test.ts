import { describe, expect, it } from "vitest";
import {
  generateDeterministicBrainInsights,
  type DeterministicBrainInput,
} from "@/lib/zapp-brain-integration";

const baseInput: DeterministicBrainInput = {
  companyId: "company-1",
  now: new Date("2026-07-08T12:00:00.000Z"),
  documentExpiryWarningDays: 30,
  documents: [],
  routeBaselines: [],
  routeRecords: [],
  incidents: [],
  maintenance: [],
  jobs: [],
  jobEvents: [],
  trackingSummaries: [],
};

describe("phase 8 deterministic brain v0", () => {
  it("generates an expired document insight", () => {
    const insights = generateDeterministicBrainInsights({
      ...baseInput,
      documents: [
        {
          id: "doc-1",
          company_id: "company-1",
          owner_type: "vehicle",
          owner_id: "vehicle-1",
          document_type: "registration",
          name: "Vehicle registration",
          expiry_date: "2026-07-01",
        },
      ],
    });

    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      category: "system",
      severity: "high",
      source: "deterministic_v0",
      title: "Expired document: Vehicle registration",
    });
  });

  it("generates a repeated route delay insight", () => {
    const insights = generateDeterministicBrainInsights({
      ...baseInput,
      routeBaselines: [
        {
          id: "baseline-1",
          company_id: "company-1",
          route_key: "route-a",
          customer_id: "customer-1",
          pickup_location: "Depot",
          dropoff_location: "Store",
          completed_trip_count: 4,
          delayed_trip_count: 3,
          average_delay_minutes: 28,
          confidence: "medium",
          data_quality_score: 75,
        },
      ],
    });

    expect(insights[0].dedupeKey).toBe("route-delay:route-a");
    expect(insights[0].category).toBe("route_intelligence");
  });

  it("generates a poor telemetry insight", () => {
    const insights = generateDeterministicBrainInsights({
      ...baseInput,
      routeRecords: [
        {
          id: "record-1",
          company_id: "company-1",
          job_id: "job-1",
          customer_id: null,
          route_key: "route-a",
          delay_minutes: null,
          delay_events: [],
          data_quality_score: 35,
          confidence: "low",
        },
      ],
    });

    expect(insights[0]).toMatchObject({
      category: "tracking",
      severity: "medium",
      dedupeKey: "poor-telemetry:route-record:record-1",
    });
  });

  it("generates an open critical incident insight", () => {
    const insights = generateDeterministicBrainInsights({
      ...baseInput,
      incidents: [
        {
          id: "incident-1",
          company_id: "company-1",
          severity: "critical",
          status: "open",
          vehicle_id: "vehicle-1",
          driver_id: null,
          description: "Breakdown on active delivery",
        },
      ],
    });

    expect(insights[0]).toMatchObject({
      category: "incident",
      severity: "critical",
      dedupeKey: "incident:incident-1",
    });
  });

  it("generates an overdue maintenance insight", () => {
    const insights = generateDeterministicBrainInsights({
      ...baseInput,
      maintenance: [
        {
          id: "maintenance-1",
          company_id: "company-1",
          vehicle_id: "vehicle-1",
          status: "scheduled",
          title: "Brake inspection",
          scheduled_date: "2026-07-01",
        },
      ],
    });

    expect(insights[0]).toMatchObject({
      category: "maintenance",
      severity: "high",
      dedupeKey: "maintenance:overdue:maintenance-1",
    });
  });

  it("prevents duplicate insights by existing dedupe key", () => {
    const insights = generateDeterministicBrainInsights({
      ...baseInput,
      existingDedupeKeys: new Set(["failed-job:job-1"]),
      jobs: [
        {
          id: "job-1",
          company_id: "company-1",
          reference: "JOB-1",
          customer_id: null,
          vehicle_id: null,
          driver_id: null,
          status: "failed",
          scheduled_at: null,
          failed_at: "2026-07-08T10:00:00.000Z",
          failure_reason: "Customer unavailable",
        },
      ],
    });

    expect(insights).toHaveLength(0);
  });
});

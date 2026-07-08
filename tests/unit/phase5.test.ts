import { describe, expect, it } from "vitest";
import { createGeographicCacheKey } from "@/lib/providers/cache-key";
import {
  confidenceFromProviderFreshness,
  confidenceFromTelemetry,
} from "@/lib/providers/confidence";
import { DisabledWeatherProvider, normalizeOpenMeteoWeather } from "@/lib/providers/weather";
import {
  DisabledTrafficProvider,
  congestionStateFromRatio,
  normalizeTomTomTraffic,
} from "@/lib/providers/traffic";
import {
  calculateRouteIntelligence,
  calculateRouteQualityScore,
  estimateStopCountFromTelemetry,
} from "@/lib/route-intelligence/intelligence";
import { buildObservedTrace } from "@/lib/route-intelligence/trace";

describe("provider geographic cache keys", () => {
  it("creates identical keys for identical coordinates and normalizes negative zero", () => {
    const a = createGeographicCacheKey("weather", -0, 0);
    const b = createGeographicCacheKey("weather", 0, -0);
    expect(a.cacheKey).toBe(b.cacheKey);
    expect(a.geographicCell).toBe("0.00,0.00");
  });

  it("reuses a weather cell for nearby coordinates", () => {
    const a = createGeographicCacheKey("weather", 40.71281, -74.00601);
    const b = createGeographicCacheKey("weather", 40.713, -74.0058);
    expect(a.cacheKey).toBe(b.cacheKey);
  });

  it("uses different keys outside a traffic cell", () => {
    const a = createGeographicCacheKey("traffic", 40.7121, -74.0061);
    const b = createGeographicCacheKey("traffic", 40.7141, -74.0061);
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });

  it("handles negative coordinates and geographic boundaries", () => {
    expect(createGeographicCacheKey("traffic", -90, -180).geographicCell).toBe("-90.000,-180.000");
    expect(createGeographicCacheKey("traffic", 90, 180).geographicCell).toBe("90.000,180.000");
  });

  it("rejects invalid coordinates", () => {
    expect(() => createGeographicCacheKey("weather", Number.NaN, 0)).toThrow(/invalid/i);
    expect(() => createGeographicCacheKey("weather", 91, 0)).toThrow(/invalid/i);
    expect(() => createGeographicCacheKey("weather", 0, -181)).toThrow(/invalid/i);
  });
});

describe("weather providers", () => {
  it("normalizes available Open-Meteo values and preserves missing values", () => {
    const result = normalizeOpenMeteoWeather({
      current: {
        temperature_2m: 20.4,
        precipitation: 0,
        weather_code: 61,
        wind_speed_10m: 11,
      },
    });
    expect(result.temperatureC).toBe(20.4);
    expect(result.condition).toBe("Rain");
    expect(result.visibilityMeters).toBeNull();
    expect(result.windDirectionDegrees).toBeNull();
  });

  it("does not invent a condition for unknown weather codes", () => {
    const result = normalizeOpenMeteoWeather({ current: { weather_code: 999 } });
    expect(result.weatherCode).toBe(999);
    expect(result.condition).toBeNull();
  });

  it("disabled weather provider fails closed", async () => {
    const result = await new DisabledWeatherProvider().getWeatherNearLocation();
    expect(result.observation).toBeNull();
    expect(result.unavailableReason).toMatch(/unavailable/i);
  });
});

describe("traffic providers", () => {
  it("normalizes TomTom flow and congestion state", () => {
    const result = normalizeTomTomTraffic({
      flowSegmentData: { currentSpeed: 30, freeFlowSpeed: 60 },
    });
    expect(result.congestionRatio).toBe(0.5);
    expect(result.congestionState).toBe("moderate");
  });

  it("handles free-flow zero, current above free-flow, and missing traffic values", () => {
    expect(
      normalizeTomTomTraffic({ flowSegmentData: { currentSpeed: 30, freeFlowSpeed: 0 } })
        .congestionRatio,
    ).toBeNull();

    const fasterThanFreeFlow = normalizeTomTomTraffic({
      flowSegmentData: { currentSpeed: 70, freeFlowSpeed: 60 },
    });
    expect(fasterThanFreeFlow.congestionRatio).toBe(1);
    expect(fasterThanFreeFlow.congestionState).toBe("free_flow");

    const missing = normalizeTomTomTraffic({ flowSegmentData: {} });
    expect(missing.currentFlowSpeedKph).toBeNull();
    expect(missing.freeFlowSpeedKph).toBeNull();
    expect(missing.congestionState).toBe("unknown");
  });

  it("calculates congestion state boundaries", () => {
    expect(congestionStateFromRatio(0.9)).toBe("free_flow");
    expect(congestionStateFromRatio(0.75)).toBe("light");
    expect(congestionStateFromRatio(0.6)).toBe("moderate");
    expect(congestionStateFromRatio(0.4)).toBe("heavy");
    expect(congestionStateFromRatio(0.1)).toBe("severe");
    expect(congestionStateFromRatio(null)).toBe("unknown");
  });

  it("disabled traffic provider fails closed", async () => {
    const result = await new DisabledTrafficProvider().getTrafficNearLocation();
    expect(result.observation).toBeNull();
    expect(result.unavailableReason).toMatch(/unavailable/i);
  });
});

describe("route intelligence", () => {
  it("handles a zero-point session", () => {
    const result = calculateRouteIntelligence({
      observedDistanceMeters: 0,
      totalDurationSeconds: 0,
      movingDurationSeconds: 0,
      stationaryDurationSeconds: 0,
      averageObservedSpeedMps: null,
      maximumCredibleSpeedMps: null,
      observedPointCount: 0,
      acceptedPointCount: 0,
      rejectedPointCount: 0,
      delayedUploadCount: 0,
    });
    expect(result.routeQualityScore).toBe(0);
    expect(result.dataConfidence.level).toBe("insufficient_data");
  });

  it("calculates stationary ratio, stop count, delayed percentage, and bounded quality", () => {
    const result = calculateRouteIntelligence({
      observedDistanceMeters: 1200,
      totalDurationSeconds: 600,
      movingDurationSeconds: 300,
      stationaryDurationSeconds: 300,
      averageObservedSpeedMps: 2,
      maximumCredibleSpeedMps: 12,
      observedPointCount: 10,
      acceptedPointCount: 9,
      rejectedPointCount: 1,
      poorPointCount: 1,
      delayedUploadCount: 2,
      stationarySegmentCount: 2,
    });
    expect(result.stationaryRatio).toBe(0.5);
    expect(result.estimatedStopCount).toBe(2);
    expect(result.delayedUploadPercentage).toBe(20);
    expect(result.routeQualityScore).toBeGreaterThanOrEqual(0);
    expect(result.routeQualityScore).toBeLessThanOrEqual(100);
  });

  it("bounds route quality score", () => {
    expect(
      calculateRouteQualityScore({
        observedDistanceMeters: 0,
        totalDurationSeconds: 3600,
        movingDurationSeconds: 0,
        stationaryDurationSeconds: 0,
        averageObservedSpeedMps: null,
        maximumCredibleSpeedMps: null,
        observedPointCount: 1,
        acceptedPointCount: 0,
        rejectedPointCount: 1,
        delayedUploadCount: 1,
      }),
    ).toBeGreaterThanOrEqual(0);
  });

  it("does not score weak or tiny samples highly", () => {
    expect(
      calculateRouteQualityScore({
        observedDistanceMeters: 0,
        totalDurationSeconds: 0,
        movingDurationSeconds: 0,
        stationaryDurationSeconds: 0,
        averageObservedSpeedMps: null,
        maximumCredibleSpeedMps: null,
        observedPointCount: 1,
        acceptedPointCount: 1,
        rejectedPointCount: 0,
        delayedUploadCount: 0,
      }),
    ).toBeLessThanOrEqual(30);

    expect(
      calculateRouteQualityScore({
        observedDistanceMeters: 100,
        totalDurationSeconds: 60,
        movingDurationSeconds: 60,
        stationaryDurationSeconds: 0,
        averageObservedSpeedMps: 2,
        maximumCredibleSpeedMps: 4,
        observedPointCount: 3,
        acceptedPointCount: 3,
        rejectedPointCount: 0,
        delayedUploadCount: 0,
      }),
    ).toBeLessThanOrEqual(60);
  });

  it("keeps strong route quality bounded high", () => {
    expect(
      calculateRouteQualityScore({
        observedDistanceMeters: 3000,
        totalDurationSeconds: 600,
        movingDurationSeconds: 540,
        stationaryDurationSeconds: 60,
        averageObservedSpeedMps: 5,
        maximumCredibleSpeedMps: 15,
        observedPointCount: 20,
        acceptedPointCount: 20,
        rejectedPointCount: 0,
        poorPointCount: 0,
        delayedUploadCount: 0,
      }),
    ).toBeGreaterThan(80);
  });

  it("groups stationary observations into estimated stops", () => {
    const points = [
      {
        device_timestamp: "2026-07-07T10:00:00.000Z",
        sequence_number: 1,
        movement_state: "stationary",
        quality_status: "high",
      },
      {
        device_timestamp: "2026-07-07T10:01:00.000Z",
        sequence_number: 2,
        movement_state: "stationary",
        quality_status: "high",
      },
      {
        device_timestamp: "2026-07-07T10:02:30.000Z",
        sequence_number: 3,
        movement_state: "stationary",
        quality_status: "high",
      },
      {
        device_timestamp: "2026-07-07T10:03:00.000Z",
        sequence_number: 4,
        movement_state: "moving",
        quality_status: "high",
      },
    ];
    expect(estimateStopCountFromTelemetry(points)).toBe(1);
  });

  it("does not count one stationary point, short noise, or rejected points as stops", () => {
    expect(
      estimateStopCountFromTelemetry([
        {
          device_timestamp: "2026-07-07T10:00:00.000Z",
          sequence_number: 1,
          movement_state: "stationary",
          quality_status: "high",
        },
      ]),
    ).toBe(0);

    expect(
      estimateStopCountFromTelemetry([
        {
          device_timestamp: "2026-07-07T10:00:00.000Z",
          sequence_number: 1,
          movement_state: "stationary",
          quality_status: "high",
        },
        {
          device_timestamp: "2026-07-07T10:00:20.000Z",
          sequence_number: 2,
          movement_state: "stationary",
          quality_status: "high",
        },
      ]),
    ).toBe(0);

    expect(
      estimateStopCountFromTelemetry([
        {
          device_timestamp: "2026-07-07T10:00:00.000Z",
          sequence_number: 1,
          movement_state: "stationary",
          quality_status: "rejected",
        },
        {
          device_timestamp: "2026-07-07T10:03:00.000Z",
          sequence_number: 2,
          movement_state: "stationary",
          quality_status: "rejected",
        },
      ]),
    ).toBe(0);
  });
});

describe("confidence model", () => {
  it("does not report high confidence from insufficient data", () => {
    expect(
      confidenceFromTelemetry({
        acceptedPointCount: 1,
        observedPointCount: 1,
        rejectedPointCount: 0,
      }).level,
    ).toBe("insufficient_data");
  });

  it("reports high confidence for high-quality telemetry", () => {
    expect(
      confidenceFromTelemetry({
        acceptedPointCount: 20,
        observedPointCount: 20,
        rejectedPointCount: 0,
        poorPointCount: 0,
        delayedUploadCount: 0,
      }).level,
    ).toBe("high");
  });

  it("uses provider freshness", () => {
    const result = confidenceFromProviderFreshness({
      retrievedAt: "2026-07-07T10:00:00.000Z",
      now: new Date("2026-07-07T10:02:00.000Z"),
    });
    expect(result.level).toBe("high");
  });

  it("treats exactly-at-expiry provider observations as expired", () => {
    const result = confidenceFromProviderFreshness({
      retrievedAt: "2026-07-07T10:00:00.000Z",
      expiresAt: "2026-07-07T10:02:00.000Z",
      now: new Date("2026-07-07T10:02:00.000Z"),
    });
    expect(result.level).toBe("low");
  });
});

describe("observed trace", () => {
  it("sorts and filters renderable trace points", () => {
    const trace = buildObservedTrace([
      {
        latitude: 95,
        longitude: 0,
        device_timestamp: "2026-07-07T10:02:00.000Z",
        sequence_number: 3,
        quality_status: "high",
      },
      {
        latitude: 40.2,
        longitude: -74,
        device_timestamp: "2026-07-07T10:02:00.000Z",
        sequence_number: 2,
        quality_status: "acceptable",
      },
      {
        latitude: 40.1,
        longitude: -74,
        device_timestamp: "2026-07-07T10:01:00.000Z",
        sequence_number: 1,
        quality_status: "high",
      },
    ]);
    expect(trace.points.map((point) => point.latitude)).toEqual([40.1, 40.2]);
    expect(trace.hasRenderableTrace).toBe(true);
  });

  it("handles an empty trace", () => {
    expect(buildObservedTrace([]).hasRenderableTrace).toBe(false);
  });
});

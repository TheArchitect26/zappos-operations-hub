import { confidenceFromTelemetry, type TelemetryConfidenceInput } from "@/lib/providers/confidence";

const ROUTE_QUALITY_WEIGHTS = {
  acceptedRatio: 45,
  nonRejectedRatio: 20,
  nonPoorRatio: 15,
  freshUploadRatio: 10,
  density: 10,
} as const;

const WEAK_SAMPLE_MAX_SCORE = 30;
const TINY_SAMPLE_MAX_SCORE = 60;
const MIN_STOP_DURATION_SECONDS = 120;
const MIN_STOP_POINTS = 2;

export interface RouteIntelligenceInput extends TelemetryConfidenceInput {
  observedDistanceMeters: number;
  totalDurationSeconds: number;
  movingDurationSeconds: number;
  stationaryDurationSeconds: number;
  averageObservedSpeedMps: number | null;
  maximumCredibleSpeedMps: number | null;
  delayedUploadCount: number;
  stationarySegmentCount?: number;
}

export interface RouteIntelligenceBaseline {
  observedDistanceMeters: number;
  totalDurationSeconds: number;
  movingDurationSeconds: number;
  stationaryDurationSeconds: number;
  stationaryRatio: number;
  averageObservedSpeedMps: number | null;
  maximumCredibleSpeedMps: number | null;
  estimatedStopCount: number;
  poorTelemetryPercentage: number;
  rejectedTelemetryPercentage: number;
  delayedUploadPercentage: number;
  routeQualityScore: number;
  dataConfidence: ReturnType<typeof confidenceFromTelemetry>;
}

export interface StopHeuristicPoint {
  device_timestamp: string;
  sequence_number: number;
  movement_state: string;
  quality_status: string;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

export function estimateStopCountFromTelemetry(points: StopHeuristicPoint[]) {
  const ordered = points
    .filter((point) => point.quality_status !== "rejected")
    .slice()
    .sort((a, b) => {
      const timeDiff = Date.parse(a.device_timestamp) - Date.parse(b.device_timestamp);
      return timeDiff !== 0 ? timeDiff : a.sequence_number - b.sequence_number;
    });

  let stops = 0;
  let candidateStart: number | null = null;
  let candidateEnd: number | null = null;
  let candidatePoints = 0;

  const finalize = () => {
    if (
      candidateStart !== null &&
      candidateEnd !== null &&
      candidatePoints >= MIN_STOP_POINTS &&
      (candidateEnd - candidateStart) / 1000 >= MIN_STOP_DURATION_SECONDS
    ) {
      stops += 1;
    }
    candidateStart = null;
    candidateEnd = null;
    candidatePoints = 0;
  };

  for (const point of ordered) {
    const timestamp = Date.parse(point.device_timestamp);
    if (!Number.isFinite(timestamp)) continue;
    if (point.movement_state === "stationary") {
      candidateStart ??= timestamp;
      candidateEnd = timestamp;
      candidatePoints += 1;
    } else if (point.movement_state === "moving") {
      finalize();
    }
  }
  finalize();
  return stops;
}

export function calculateRouteQualityScore(input: RouteIntelligenceInput) {
  if (input.observedPointCount <= 0) return 0;
  const acceptedRatio = input.acceptedPointCount / input.observedPointCount;
  const rejectedRatio = input.rejectedPointCount / input.observedPointCount;
  const poorRatio = (input.poorPointCount ?? 0) / input.observedPointCount;
  const delayedRatio = input.delayedUploadCount / input.observedPointCount;
  const densityScore =
    input.totalDurationSeconds > 0
      ? Math.min(1, input.acceptedPointCount / Math.max(1, input.totalDurationSeconds / 60))
      : input.acceptedPointCount >= 2
        ? 0.7
        : 0;

  const score =
    acceptedRatio * ROUTE_QUALITY_WEIGHTS.acceptedRatio +
    (1 - rejectedRatio) * ROUTE_QUALITY_WEIGHTS.nonRejectedRatio +
    (1 - poorRatio) * ROUTE_QUALITY_WEIGHTS.nonPoorRatio +
    (1 - delayedRatio) * ROUTE_QUALITY_WEIGHTS.freshUploadRatio +
    densityScore * ROUTE_QUALITY_WEIGHTS.density;
  const bounded = Math.round(Math.max(0, Math.min(100, score)));
  if (input.acceptedPointCount < 2) return Math.min(WEAK_SAMPLE_MAX_SCORE, bounded);
  if (input.acceptedPointCount < 5) return Math.min(TINY_SAMPLE_MAX_SCORE, bounded);
  return bounded;
}

export function calculateRouteIntelligence(
  input: RouteIntelligenceInput,
): RouteIntelligenceBaseline {
  const stationaryRatio =
    input.totalDurationSeconds > 0
      ? Math.max(0, Math.min(1, input.stationaryDurationSeconds / input.totalDurationSeconds))
      : 0;
  const estimatedStopCount =
    input.stationaryDurationSeconds >= MIN_STOP_DURATION_SECONDS && input.acceptedPointCount >= 3
      ? (input.stationarySegmentCount ?? Math.round(input.stationaryDurationSeconds / 300))
      : 0;

  return {
    observedDistanceMeters: input.observedDistanceMeters,
    totalDurationSeconds: input.totalDurationSeconds,
    movingDurationSeconds: input.movingDurationSeconds,
    stationaryDurationSeconds: input.stationaryDurationSeconds,
    stationaryRatio,
    averageObservedSpeedMps: input.averageObservedSpeedMps,
    maximumCredibleSpeedMps: input.maximumCredibleSpeedMps,
    estimatedStopCount,
    poorTelemetryPercentage: percentage(input.poorPointCount ?? 0, input.observedPointCount),
    rejectedTelemetryPercentage: percentage(input.rejectedPointCount, input.observedPointCount),
    delayedUploadPercentage: percentage(input.delayedUploadCount, input.observedPointCount),
    routeQualityScore: calculateRouteQualityScore(input),
    dataConfidence: confidenceFromTelemetry(input),
  };
}

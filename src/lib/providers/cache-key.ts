export interface GeographicCacheKey {
  providerType: "weather" | "traffic";
  precision: number;
  latitudeCell: number;
  longitudeCell: number;
  geographicCell: string;
  cacheKey: string;
}

export const WEATHER_CELL_PRECISION = 2;
export const TRAFFIC_CELL_PRECISION = 3;

function roundToCell(value: number, precision: number) {
  const factor = 10 ** precision;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function assertValidCoordinate(latitude: number, longitude: number) {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Invalid geographic coordinates");
  }
}

export function createGeographicCacheKey(
  providerType: "weather" | "traffic",
  latitude: number,
  longitude: number,
  precision = providerType === "weather" ? WEATHER_CELL_PRECISION : TRAFFIC_CELL_PRECISION,
): GeographicCacheKey {
  assertValidCoordinate(latitude, longitude);
  const latitudeCell = roundToCell(latitude, precision);
  const longitudeCell = roundToCell(longitude, precision);
  const geographicCell = `${latitudeCell.toFixed(precision)},${longitudeCell.toFixed(precision)}`;
  return {
    providerType,
    precision,
    latitudeCell,
    longitudeCell,
    geographicCell,
    cacheKey: `${providerType}:${precision}:${geographicCell}`,
  };
}

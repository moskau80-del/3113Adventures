function haversine(a, b) {
  const radius = 6371;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(value));
}

function interpolatePoint(a, b, fraction) {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lng: a.lng + (b.lng - a.lng) * fraction,
    elevation:
      Number(a.elevation || 0) +
      (Number(b.elevation || 0) - Number(a.elevation || 0)) * fraction
  };
}

export function splitTrackIntoStages(points, targetKm) {
  if (!Array.isArray(points) || points.length < 2) return [];

  const chunks = [];
  let current = [points[0]];
  let accumulated = 0;

  for (let index = 1; index < points.length; index++) {
    let previous = points[index - 1];
    const next = points[index];
    let remainingSegment = haversine(previous, next);

    while (accumulated + remainingSegment >= targetKm && remainingSegment > 0) {
      const needed = targetKm - accumulated;
      const fraction = needed / remainingSegment;
      const cutPoint = interpolatePoint(previous, next, fraction);

      current.push(cutPoint);
      chunks.push(current);
      current = [cutPoint];

      previous = cutPoint;
      remainingSegment = haversine(previous, next);
      accumulated = 0;
    }

    current.push(next);
    accumulated += remainingSegment;
  }

  if (current.length > 1) {
    chunks.push(current);
  }

  return chunks;
}

export function calculateStageStatistics(points) {
  let distanceKm = 0;
  let ascentM = 0;
  let descentM = 0;

  for (let index = 1; index < points.length; index++) {
    distanceKm += haversine(points[index - 1], points[index]);

    const difference =
      Number(points[index].elevation || 0) -
      Number(points[index - 1].elevation || 0);

    if (difference > 0) ascentM += difference;
    if (difference < 0) descentM += Math.abs(difference);
  }

  return {
    distanceKm,
    ascentM,
    descentM
  };
}

export function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function estimateWalkingHours(distanceKm, ascentM) {
  const flatHours = distanceKm / 4.2;
  const ascentHours = ascentM / 600;
  return flatHours + ascentHours;
}

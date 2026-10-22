// This UI boundary controls new location previews. It grants no data or
// scientific admission, and never rewrites a restored/imported project.
export const OUTSIDE_STUDY_MESSAGE = '此处仅供区域浏览。请在高亮的成都研究区内选择场地。';

const position = point => Array.isArray(point) && point.length >= 2 &&
  point.slice(0, 2).every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
const validRing = ring => {
  if (!Array.isArray(ring) || ring.length < 4 || !ring.every(position) ||
    ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return false;
  const [ox, oy] = ring[0];
  return ring.slice(1).reduce((sum, [x, y], index) => {
    const [px, py] = ring[index];
    return sum + (px - ox) * (y - oy) - (x - ox) * (py - oy);
  }, 0) !== 0;
};
const validPolygon = rings => Array.isArray(rings) && rings.length > 0 && rings.every(validRing);

export function validateStudyBoundary(boundary) {
  if (boundary?.type !== 'FeatureCollection' || !Array.isArray(boundary.features) || !boundary.features.length ||
    !boundary.features.every(feature => {
      const geometry = feature?.geometry;
      return geometry?.type === 'Polygon' ? validPolygon(geometry.coordinates) :
        geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length > 0 && geometry.coordinates.every(validPolygon);
    })) {
    throw new Error('可选研究范围尚未正确载入，请重新载入地图。');
  }
  return boundary;
}

// Return -1 outside, 0 on an edge, 1 inside. Calculated on the actual polygon,
// with a tiny floating-point tolerance; this is never a geographic buffer.
function ringRelation(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j], [bx, by] = ring[i];
    const dx = bx - ax, dy = by - ay;
    const length = Math.hypot(dx, dy);
    if (length > 0 && Math.abs((x - ax) * dy - (y - ay) * dx) <= 1e-11 * length &&
      x >= Math.min(ax, bx) - 1e-11 && x <= Math.max(ax, bx) + 1e-11 &&
      y >= Math.min(ay, by) - 1e-11 && y <= Math.max(ay, by) + 1e-11) return 0;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside ? 1 : -1;
}

function polygonCovers(point, rings) {
  const outer = ringRelation(point, rings[0]);
  if (outer < 0) return false;
  // The closed polygon includes its exterior and hole boundaries, matching
  // the project's covers convention; the interiors of holes are excluded.
  return rings.slice(1).every(ring => ringRelation(point, ring) !== 1);
}

export function studyCoversLocation(point, boundary) {
  if (!position(point)) return false;
  try { validateStudyBoundary(boundary); } catch { return false; }
  return boundary.features.some(({geometry}) => {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some(rings => polygonCovers(point, rings));
  });
}

export function requireStudyLocation(point, boundary) {
  validateStudyBoundary(boundary);
  if (!studyCoversLocation(point, boundary)) throw new Error(OUTSIDE_STUDY_MESSAGE);
  return point;
}

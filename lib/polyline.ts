// Google Encoded Polyline Algorithm (precision 1e5)

export function encodePolyline(pts: { lat: number; lng: number }[]): string {
  let out = '', pLat = 0, pLng = 0
  for (const p of pts) {
    const lat = Math.round(p.lat * 1e5)
    const lng = Math.round(p.lng * 1e5)
    out += encCoord(lat - pLat) + encCoord(lng - pLng)
    pLat = lat; pLng = lng
  }
  return out
}

function encCoord(v: number): string {
  v = v < 0 ? ~(v << 1) : v << 1
  let s = ''
  while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5 }
  return s + String.fromCharCode(v + 63)
}

export function decodePolyline(encoded: string): [number, number][] {
  const result: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  while (index < encoded.length) {
    let b = 0, shift = 0, r = 0
    do { b = encoded.charCodeAt(index++) - 63; r |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (r & 1) ? ~(r >> 1) : r >> 1
    b = 0; shift = 0; r = 0
    do { b = encoded.charCodeAt(index++) - 63; r |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (r & 1) ? ~(r >> 1) : r >> 1
    result.push([lat / 1e5, lng / 1e5])
  }
  return result
}

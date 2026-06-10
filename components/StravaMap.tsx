'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

function decodePolyline(encoded: string): [number, number][] {
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

function dot(color: string) {
  return `<div style="width:11px;height:11px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`
}

export default function StravaMap({ polyline }: { polyline: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    const coords = decodePolyline(polyline)
    if (coords.length === 0) return

    import('leaflet').then((L) => {
      if (!ref.current || mapRef.current) return

      const map = L.map(ref.current, { zoomControl: true })
      mapRef.current = map

      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      })
      const satellite = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { attribution: 'Tiles © Esri', maxZoom: 19 }
      )
      osm.addTo(map)
      L.control.layers({ 'Mapa': osm, 'Satélite': satellite }).addTo(map)

      const line = L.polyline(coords, { color: '#FC4C02', weight: 4, opacity: 0.9 }).addTo(map)

      const makeIcon = (color: string) =>
        L.divIcon({ html: dot(color), className: '', iconSize: [11, 11], iconAnchor: [5, 5] })

      L.marker(coords[0], { icon: makeIcon('#22c55e') }).addTo(map)
      L.marker(coords[coords.length - 1], { icon: makeIcon('#2a2e25') }).addTo(map)
      map.fitBounds(line.getBounds(), { padding: [24, 24] })
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [polyline])

  return (
    <div
      ref={ref}
      style={{ height: 250, borderRadius: 8, overflow: 'hidden', position: 'relative', zIndex: 0, background: '#d4dcc9' }}
    />
  )
}

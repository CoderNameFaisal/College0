import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { ensureLeafletDefaultIcons } from '../map/leafletSetup'

export type ClassMapPin = { lat: number; lng: number; title: string; subtitle?: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Props = {
  pins: ClassMapPin[]
  height?: number
  className?: string
}

const DEFAULT_CENTER: L.LatLngTuple = [40.7128, -74.006]

/** Multiple pins + popups; fits bounds when more than one. */
export function ClassLocationsMultiMap({ pins, height = 280, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const groupRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    ensureLeafletDefaultIcons()
    if (!ref.current) return

    const map = L.map(ref.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    const group = L.layerGroup().addTo(map)
    mapRef.current = map
    groupRef.current = group

    requestAnimationFrame(() => map.invalidateSize())

    return () => {
      map.remove()
      mapRef.current = null
      groupRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const group = groupRef.current
    if (!map || !group) return

    group.clearLayers()
    if (pins.length === 0) {
      map.setView(DEFAULT_CENTER, 11)
      return
    }

    const latLngs: L.LatLngExpression[] = []
    for (const p of pins) {
      const html = `<strong>${escapeHtml(p.title)}</strong>${
        p.subtitle ? `<br/>${escapeHtml(p.subtitle)}` : ''
      }`
      L.marker([p.lat, p.lng]).bindPopup(html).addTo(group)
      latLngs.push([p.lat, p.lng])
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0] as L.LatLngTuple, 14)
    } else {
      map.fitBounds(L.latLngBounds(latLngs as L.LatLngTuple[]), { padding: [28, 28], maxZoom: 16 })
    }
    requestAnimationFrame(() => {
      map.invalidateSize()
    })
  }, [pins])

  return (
    <div className={`relative z-0 ${className}`} style={{ height }}>
      <div ref={ref} className="h-full w-full overflow-hidden rounded border border-zinc-700" />
      {pins.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border border-zinc-700 bg-zinc-900/75 text-sm text-zinc-500">
          No pinned locations for this list yet.
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { ensureLeafletDefaultIcons } from '../map/leafletSetup'

type Props = {
  lat: number
  lng: number
  zoom?: number
  className?: string
  /** px height */
  height?: number
}

/** OpenStreetMap tiles + one pin (no Google API key). */
export function ClassLocationMap({ lat, lng, zoom = 16, className = '', height = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    ensureLeafletDefaultIcons()
    if (!ref.current) return

    const el = ref.current
    const map = L.map(el, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([lat, lng], zoom)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    L.marker([lat, lng]).addTo(map)
    mapRef.current = map

    const fixLayout = () => {
      map.invalidateSize()
      map.setView([lat, lng], zoom)
    }
    requestAnimationFrame(fixLayout)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng, zoom])

  return (
    <div
      ref={ref}
      className={`z-0 overflow-hidden rounded border border-zinc-700 ${className}`}
      style={{ height }}
    />
  )
}

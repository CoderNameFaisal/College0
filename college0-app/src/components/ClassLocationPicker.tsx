import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { ensureLeafletDefaultIcons } from '../map/leafletSetup'

const DEFAULT_CENTER: L.LatLngTuple = [40.7128, -74.006]

type Props = {
  lat: number | null
  lng: number | null
  onChange: (lat: number | null, lng: number | null) => void
  label: string
  onLabelChange: (v: string) => void
}

/** Click map to set / move pin; drag pin to adjust. */
export function ClassLocationPicker({ lat, lng, onChange, label, onLabelChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    ensureLeafletDefaultIcons()
    if (!ref.current) return

    const map = L.map(ref.current, { scrollWheelZoom: true }).setView(DEFAULT_CENTER, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)

    map.on('click', (e) => {
      const { lat: la, lng: ln } = e.latlng
      onChangeRef.current(la, ln)
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln])
      } else {
        const m = L.marker([la, ln], { draggable: true }).addTo(map)
        m.on('dragend', () => {
          const p = m.getLatLng()
          onChangeRef.current(p.lat, p.lng)
        })
        markerRef.current = m
      }
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (lat != null && lng != null) {
      if (!markerRef.current) {
        const m = L.marker([lat, lng], { draggable: true }).addTo(map)
        m.on('dragend', () => {
          const p = m.getLatLng()
          onChangeRef.current(p.lat, p.lng)
        })
        markerRef.current = m
      } else {
        markerRef.current.setLatLng([lat, lng])
      }
      map.setView([lat, lng], 16)
    } else {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      map.setView(DEFAULT_CENTER, 12)
    }
  }, [lat, lng])

  return (
    <div className="space-y-2 md:col-span-2">
      <span className="text-xs text-zinc-500">Meeting location (map — required for new sections)</span>
      <p className="text-[11px] text-zinc-500">
        Click the map to drop a pin (drag to adjust). Add a building/room label below — both are saved to the
        database for the public course map and class cards.
      </p>
      <div ref={ref} className="h-[220px] w-full overflow-hidden rounded border border-zinc-700" />
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">Location label (building / room)</span>
        <input
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          placeholder="e.g. NAC 7/104"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">
          Lat: <code className="text-zinc-300">{lat?.toFixed(5) ?? '—'}</code> · Lng:{' '}
          <code className="text-zinc-300">{lng?.toFixed(5) ?? '—'}</code>
        </span>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
          onClick={() => onChange(null, null)}
        >
          Clear pin
        </button>
      </div>
    </div>
  )
}

import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

/** Fix default marker assets when bundling with Vite. */
export function ensureLeafletDefaultIcons(): void {
  const proto = L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown }
  delete proto._getIconUrl
  L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
  })
}

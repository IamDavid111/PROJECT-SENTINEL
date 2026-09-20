import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'
import mapboxgl from 'mapbox-gl'

import type { SafetySite } from './siteSafety'

import 'mapbox-gl/dist/mapbox-gl.css'

export function SafetyMapCard({ sites }: { sites: SafetySite[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN

  useEffect(() => {
    if (!token || !containerRef.current || !sites.length) return
    mapboxgl.accessToken = token
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [sites[0].longitude, sites[0].latitude],
      zoom: 3,
    })
    const markers = sites.map((site) => {
      const popupContent = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = site.name
      const status = document.createElement('div')
      status.textContent = `Safety status: ${site.statusLabel}`
      popupContent.append(title, status)
      const marker = new mapboxgl.Marker({ color: site.status === 'critical' ? '#dc2626' : site.status === 'warning' ? '#f59e0b' : '#12a94f' })
        .setLngLat([site.longitude, site.latitude])
        .setPopup(new mapboxgl.Popup().setDOMContent(popupContent))
        .addTo(map)
      return marker
    })
    return () => {
      markers.forEach((marker) => marker.remove())
      map.remove()
    }
  }, [sites, token])

  return <article className="dashboard-card safety-map-card"><div className="dashboard-card-heading"><div><div className="eyebrow">SITE SAFETY</div><h3>Safety risk map</h3></div></div>{!token ? <div className="chart-empty"><span aria-hidden="true"><MapPin size={26} /></span><strong>Safety Map</strong><small>Map service configuration is required to display the interactive operational map.</small></div> : !sites.length ? <div className="chart-empty"><span aria-hidden="true"><MapPin size={26} /></span><strong>No site data available</strong><small>Configure operational sites and safety records before viewing the map.</small></div> : <div ref={containerRef} className="safety-map-canvas" aria-label="Interactive site safety map" />}</article>
}

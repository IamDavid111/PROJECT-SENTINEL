import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'

import { ChartCard } from '../../components/ui/chart-card'
import { EmptyState } from '../../components/ui/empty-state'
import type { SafetySite } from './siteSafety'

import 'mapbox-gl/dist/mapbox-gl.css'

export function SafetyMapCard({ sites }: { sites: SafetySite[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN

  // Mapbox creates its canvas and markers outside React; create them only with a token and site data, then remove them on cleanup.
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

  return (
    <ChartCard
      title="Safety risk map"
      description="Site markers are colored by current safety status."
    >
      {!token ? (
        <EmptyState
          className="h-[280px] py-0 sm:h-[360px] xl:h-[540px]"
          icon="location"
          title="Map service configuration required"
          description="Add a public Mapbox token to render site markers. The rest of the dashboard is unaffected."
        />
      ) : !sites.length ? (
        <EmptyState
          className="h-[280px] py-0 sm:h-[360px] xl:h-[540px]"
          icon="location"
          title="No site data available"
          description="Site coordinates will appear once an authorized site has a location."
        />
      ) : (
        <div
          ref={containerRef}
          className="h-[280px] overflow-hidden rounded-xl border border-line sm:h-[360px] xl:h-[540px]"
          aria-label="Interactive site safety map"
        />
      )}
    </ChartCard>
  )
}

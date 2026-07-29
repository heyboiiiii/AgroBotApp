import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'

function FlyToSelected({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position && position[0] !== 0) {
      map.flyTo(position, map.getZoom(), { duration: 0.5 })
    }
  }, [map, position])

  return null
}

export default function Home() {
  const [cows, setCows] = useState([])
  const [selectedCow, setSelectedCow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let isMounted = true

    async function loadCowData() {
      setLoading(true)
      setError(null)

      try {
        
        const response = await fetch('/cows')
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        
        if (!Array.isArray(data)) {
          throw new Error('Invalid data format')
        }
        


        const normalized = data.map((item) => ({
          id: String(item.ID || item.id || ''), // Ensure ID is a string
          name: item.NAME || item.name || `Cow ${item.ID || item.id}`, // Provide a default name if none is available
          lat: Number(item.LAT || item.lat || 0), // Ensure LAT is a number
          lng: Number(item.LONG || item.long || item.lng || 0),// Ensure LONG/LNG is a number
          temp: String(item.TEMP || item.temp || ''),// Ensure TEMP is a string
          hb: String(item.HB || item.hb || ''),/// Ensure HB is a string
        }))

        if (!isMounted) return

        setCows(normalized)
        if (normalized.length > 0) {
          setSelectedCow(normalized[0])
        }
        setLoading(false)
      } catch (err) {
        if (!isMounted) return
        console.error('Load error:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    loadCowData()
   
    const interval = setInterval(loadCowData, 15000)// Refresh data every 15 seconds(Change later to 5 minutes for production)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  // Determine the map's center position based on the selected cow or default to the first cow  
  const mapPosition = useMemo(() => {
    if (selectedCow?.lat && selectedCow?.lng) {
      // If a cow is selected, center the map on that cow's position
      return [selectedCow.lat, selectedCow.lng]
    }
    if (cows.length > 0) {
      // If no cow is selected, default to the first cow's position
      return [cows[0].lat, cows[0].lng]
    }
    return [51.505, -0.09] // Default position (London) if no cows are available
  }, [selectedCow, cows])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header and navigation */}
      <header className="w-full border-b sticky top-0 bg-white/90 backdrop-blur z-50">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-4 p-4">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="Logo" className="w-12 h-12 rounded-full object-cover" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight ">Agro<span className="text-emerald-600">Nomad</span></h1>
              <p className="text-sm text-slate-500">Seguimiento de ganado con datos GPS.</p>
            </div>
          </div>
        </div>
      </header>

      <section className="py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Mapa</h2>
                <p className="mt-1 text-sm text-slate-500">Toca una vaca para ver sus detalles.</p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                <span>
                  {loading && 'Cargando...'}

                  {!loading && !error && `${cows.length} animales detectados`}
                  
                  {error && `Error: ${error}`}
                </span>
                
                {!loading && !error && (
                  <span className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                )}
              </div>
              <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                <span>
                {!loading && !error && selectedCow ? `Vaca seleccionada: ${selectedCow.name}` : 'Ninguna vaca seleccionada.'}
                </span> 
                

                {!loading && !error && (
                  <span className="h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                )}
              </div>
            </div>



            {/* Map container */}

            <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
              <MapContainer center={mapPosition} zoom={15} scrollWheelZoom className="h-[560px] w-full">
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FlyToSelected position={mapPosition} />
                {cows.map((cow) => (
                  <CircleMarker
                    key={cow.id}
                    center={[cow.lat, cow.lng]}
                    radius={10}
                    fillColor={cow.id === selectedCow?.id ? '#059669' : '#2563eb'}
                    color="white"
                    weight={2}
                    fillOpacity={0.9}
                    eventHandlers={{ click: () => setSelectedCow(cow) }}
                  >
                    <Tooltip>{cow.name}</Tooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>

          {/* Overview and selected cow details */}
          <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold">Visión general de la manada</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Total de vacas</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{cows.length}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{error ? 'Error' : loading ? 'Cargando' : 'OK'}</p>
                </div>
              </div>
            </div>
            
            {/* Selected cow details */}
            <aside className="space-y-6">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-xl font-semibold">Animal selecionado</h3>
                <div className="mt-4 space-y-3">
                  {selectedCow ? (
                    <div className="space-y-3">
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-xs uppercase text-slate-500">ID</p>
                        <p className="mt-1 text-lg font-semibold">{selectedCow.id}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-xs uppercase text-slate-500">Nombre</p>
                        <p className="mt-1 text-lg font-semibold">{selectedCow.name}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-xs uppercase text-slate-500">Temperatura</p>
                        <p className="mt-1 text-lg font-semibold">{selectedCow.temp || '—'}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-50 p-4">
                        <p className="text-xs uppercase text-slate-500">Posicion</p>
                        {/*show also the place where that coordenates point(example:Buenos aires,argenina) */}
                        <p className="mt-1 text-sm font-mono"></p>
                        <p className="mt-1 text-sm font-mono">{selectedCow.lat.toFixed(5)}, {selectedCow.lng.toFixed(5)}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center py-4">Click a cow marker on the map</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMap } from 'react-leaflet'
import RenameCowModal from './RenameCowModal'

function FlyToSelected({ position }) {
  const map = useMap()

  useEffect(() => {
    if (position && position[0] !== 0) {
      map.flyTo(position, map.getZoom(), { duration: 0.5 })
    }
  }, [map, position])

  return null
}

{/* Function to normalize boundary groups from the payload */}
function normalizeBoundaryGroups(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return []
  }

  const rawGroups = payload.limitsField || payload.limits || payload.boundaries || payload.boundaryFields || payload.fields

  if (!rawGroups || typeof rawGroups !== 'object' || Array.isArray(rawGroups)) {
    return []
  }

  return Object.entries(rawGroups)
    .map(([name, points]) => {
      if (!points || typeof points !== 'object' || Array.isArray(points)) {
        return null
      }

      const positions = Object.values(points)
        .map((point) => {
          if (!point || typeof point !== 'object' || Array.isArray(point)) {
            return null
          }

          const lat = Number(point.lat ?? point.LAT ?? point.latitude ?? point.Latitude)
          const lng = Number(point.lng ?? point.LNG ?? point.long ?? point.LONG ?? point.longitude ?? point.Longitude)

          if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return null
          }

          return [lat, lng]
        })
        .filter(Boolean)

      if (positions.length < 2) {
        return null
      }

      const closedPositions = positions[0].toString() !== positions[positions.length - 1].toString()
        ? [...positions, positions[0]]
        : positions

      return { name, positions: closedPositions }
    })
    .filter(Boolean)
}

export default function Home({ onNavigate }) {
  const [cows, setCows] = useState([])
  const [fieldBoundaries, setFieldBoundaries] = useState([])
  const [selectedCow, setSelectedCow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameModalOpen, setRenameModalOpen] = useState(false)
  const selectedCowRef = useRef(null)

  useEffect(() => {
    selectedCowRef.current = selectedCow
  }, [selectedCow])

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
        const rawCows = Array.isArray(data)
          ? data
          : Array.isArray(data?.cows)
            ? data.cows
            : []

        if (!Array.isArray(rawCows)) {
          throw new Error('Invalid data format')
        }

        const normalized = rawCows.map((item) => ({
          id: String(item.ID || item.id || ''),
          name: item.NAME || item.name || `Cow ${item.ID || item.id}`,
          lat: Number(item.LAT || item.lat || 0),
          lng: Number(item.LONG || item.long || item.lng || 0),
          temp: String(item.TEMP || item.temp || ''),
          hb: String(item.HB || item.hb || ''),
        }))

        if (!isMounted) return

        const previouslySelectedId = selectedCowRef.current?.id

        setCows(normalized)
        setFieldBoundaries(normalizeBoundaryGroups(data))

        if (normalized.length > 0) {
          const stillSelected = normalized.find((cow) => cow.id === previouslySelectedId)
          setSelectedCow(stillSelected || normalized[0])
        } else {
          setSelectedCow(null)
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









  // Function to scroll to a specific section and close the menu
  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMenuOpen(false)
  }

  const handleRenameCow = async (newName) => {
    if (!selectedCow) {
      throw new Error('No hay una vaca seleccionada.')
    }

    const response = await fetch('/cows/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedCow.id, name: newName }),
    })

    if (!response.ok) {
      throw new Error('No se pudo actualizar el nombre en el servidor.')
    }

    const result = await response.json().catch(() => ({}))
    if (result?.status !== 'ok') {
      throw new Error('El servidor no confirmó el cambio.')
    }

    setCows((prevCows) =>
      prevCows.map((cow) => (cow.id === selectedCow.id ? { ...cow, name: newName } : cow))
    )
    setSelectedCow((prevSelected) =>
      prevSelected && prevSelected.id === selectedCow.id ? { ...prevSelected, name: newName } : prevSelected
    )
  }













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
      <header className="sticky top-0 z-60 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 p-4">
          
          {/* Logo and title */}
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="Logo" className="h-12 w-12 rounded-full object-cover" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agro<span className="text-emerald-600">Nomad</span></h1>
              <p className="text-sm text-slate-500">Seguimiento de ganado con datos GPS.</p>
            </div>
          </div>
           {/* Menu button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
              aria-expanded={menuOpen}
            >
              {menuOpen ? 'Cerrar' : 'Menú'}
            </button>
          </div>
        </div>
        {/* Menu items */}
        {/* View map, details, user configuration */}
        {menuOpen && (
          <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 pb-4">
            <button
              type="button"
              onClick={() => scrollToSection('map-section')}
              className="rounded-full bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Ver mapa
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('overview-section')}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Detalles
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('/userconf')}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Configuración de usuario
            </button>
          </div>
        )}
      </header>
      
      {/* Main content */}

      <section className="py-10 px-4 sm:px-6 lg:px-8">

        <div className="max-w-6xl mx-auto space-y-8">
          <div id="map-section" className="rounded-[28px] border border-green-200 bg-white p-6 shadow-sm">
            {/* Map header and status of animals(detected and focused)*/}
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

              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
                
                <span>
                  {!loading && !error && selectedCow ? (
                    <>Animal seleccionado <strong> {selectedCow.name}(ID:{selectedCow.id})</strong></>
                  ) : (
                    'Ningun animal seleccionado.'
                  )}
                </span>
                

                {!loading && !error && (
                  <span className="h-3 w-3 rounded-full bg-orange-500 ring-2 ring-orange-100" />
                )}
              </div>

            </div>



            {/* Map container */}

            <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 relative z-0">
              <MapContainer
                center={mapPosition}
                zoom={15}
                scrollWheelZoom
                className="h-140 w-full relative z-0"
                style={{ zIndex: 0 }}
              >
                {/* Use Esri World Imagery tiles for a satellite view */}
                <TileLayer
                  attribution='&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
                <FlyToSelected position={mapPosition} />

                {fieldBoundaries.map((boundary) => (
                  <Polyline
                    key={boundary.name}
                    positions={boundary.positions}
                    pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.95 }}
                  >
                    <Tooltip>{boundary.name}</Tooltip>
                  </Polyline>
                ))}

                {cows.map((cow) => {
                  const isSelected = cow.id === selectedCow?.id

                  return (
                    <CircleMarker
                      key={cow.id}
                      center={[cow.lat, cow.lng]}
                      radius={7}
                      //Circle marker function works weel when styles are passed via pathOptions, 
                      // but if you use style prop it doesn't work, so we use pathOptions instead of style
                      pathOptions={{
                      fillColor: isSelected ? '#f59e0b' : '#05960c',
                      color: isSelected ? '#f59e0b' : '#ffffff',
                      weight: isSelected ? 3 : 2,
                      fillOpacity: 0.95,
                    }}
                      eventHandlers={{ click: () => setSelectedCow(cow) }}
                    >
                      {/* Show the cow's name in a tooltip when hovering over the marker */}
                      <Tooltip>{cow.name}</Tooltip>
                    </CircleMarker>
                  )
                })}
              </MapContainer>
            </div>
          </div>

          {/* Overview and selected cow details */}
          <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
            <div id="overview-section" className="rounded-[28px] border border-green-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-semibold">Visión general</h3>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl bg-slate-100 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Total de vacas</p>
                  <p className="mt-2 text-1xl font-semibold text-slate-900">{cows.length}</p>
                </div>
                <div className="rounded-3xl bg-slate-100 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Estado</p>
                  <p className="mt-2 text-1xl font-semibold text-slate-900">{error ? 'Error' : loading ? 'Cargando' : 'OK'}</p>
                </div>
              </div>
            </div>
            
            {/* Selected cow details */}
            <aside className="space-y-6">
              <div id="details-section" className="rounded-[28px] border border-green-200 bg-white p-6 shadow-sm">
                <h3 className="text-xl font-semibold">Animal selecionado</h3>
                <div className="mt-4 space-y-3">
                  {selectedCow ? (
                    <div className="space-y-3">
                      
                      <div className="rounded-3xl bg-slate-100 p-4">
                        <p className="text-sm text-slate-500">ID(identificador unico de collar)</p>
                        <p className="mt-1 text-lg font-semibold">{selectedCow.id}</p>
                      </div>
                      
                      <div className="rounded-3xl bg-slate-100 p-4">
                        <p className="text-sm  text-slate-500">Nombre</p>
                        
                        
                        
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="mt-1 text-lg font-semibold">{selectedCow.name}</p>
                          {/* Button to edit name of cow*/}
                          <button
                            type="button"
                            onClick={() => setRenameModalOpen(true)}
                            className="mt-2 rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-emerald-700"
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                      {/* Show the cow's temperature and position 
                      
                      <div className="rounded-3xl bg-slate-100 p-4">
                        <p className="text-sm  text-slate-500">Temperatura</p>
                        <p className="mt-1 text-lg font-semibold">{selectedCow.temp || '—'}</p>
                      </div>
                      
                      */}
                      
                      <div className="rounded-3xl bg-slate-100 p-4">
                        <p className="text-sm  text-slate-500">Posicion</p>
                        {/*show also the place where that coordenates point(example:Buenos aires,argenina) */}
                        <div className="mt-2 flex items-center justify-between gap-2">

                        
                          <div>
                            <p className="mt-1 text-sm font-mono mb-2">Buenos Aires, Argentina</p>
                            <p className="mt-1 text-sm font-mono">Latitud: {selectedCow.lat.toFixed(5)}</p>
                            <p className="mt-1 text-sm font-mono"> Longitud: {selectedCow.lng.toFixed(5)}</p>
                          </div>

                          {/* button to copy coordenates to clipboard */}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`Latitud: ${selectedCow.lat.toFixed(5)}, Longitud: ${selectedCow.lng.toFixed(5)}`)
                              alert('Coordenadas copiadas al portapapeles')
                            }}
                            className="mt-2 rounded-full bg-emerald-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-emerald-700"
                          >
                            Copiar
                          </button>
                        </div>
                          
                        {/* Button to show historical trip of the animal */}
                        <div className="mt-5 flex items-center justify-center rounded-3xl bg-emerald-600 p-4">
                          <button
                            type="button"
                            onClick={() => onNavigate?.(`/history/${selectedCow.id}`)}
                            className="rounded-md px-3 py-1.5 text-m font-semibold text-emerald-50 transition-colors"
                          >
                            Ver trayecto historico
                          </button>
                        </div>

                      </div>

                      
                    </div>
                  ) : (
                    <p className="text-slate-500 text-center py-4">Tocar sobre animal para ver detalles</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <RenameCowModal
        cow={selectedCow}
        isOpen={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        onConfirm={handleRenameCow}
      />
    </div>
  )
}

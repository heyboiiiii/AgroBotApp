import { useEffect, useState } from 'react'
import Home from './components/Home'
import UserConfig from './components/UserConfig'
import 'leaflet/dist/leaflet.css'

function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  const handleNavigate = (path) => {
    setCurrentPath(path)
    window.history.pushState({}, '', path)
  }

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (currentPath === '/userconf') {
    return <UserConfig onNavigate={handleNavigate} />
  }

  return <Home onNavigate={handleNavigate} />
}

export default App
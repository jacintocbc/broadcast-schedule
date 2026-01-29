import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import Dashboard from './components/Dashboard'
import OBSTimelineView from './components/OBSTimelineView'
import CBCTimelineView from './components/CBCTimelineView'
import PlanningTimelineView from './components/PlanningTimelineView'
import ResourceManager from './components/ResourceManager'
import BlockManager from './components/BlockManager'
import BoothPage from './components/BoothPage'
import LiveBoothsView from './components/LiveBoothsView'
import BoothDetailView from './components/BoothDetailView'

function Navigation() {
  const location = useLocation()
  const [navbarHeight, setNavbarHeight] = useState(73)
  
  useEffect(() => {
    const header = document.querySelector('header')
    if (header) {
      setNavbarHeight(header.offsetHeight)
    }
  }, [])

  const isActive = (path) => location.pathname === path
  
  // Hide navigation on booth detail page
  const isBoothDetailPage = location.pathname.match(/^\/live-booths\/[^/]+$/)

  if (isBoothDetailPage) {
    return null
  }

  return (
    <header className="bg-gray-800 text-white p-4 shadow-lg fixed top-0 left-0 right-0 z-50">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">CBC Studios - Olympus</h1>
        <nav className="flex gap-4">
          <Link
            to="/dashboard"
            className={`px-4 py-2 rounded ${isActive('/dashboard') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            Dashboard
          </Link>
          <Link
            to="/obs-timeline"
            className={`px-4 py-2 rounded ${isActive('/obs-timeline') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            OBS Schedule
          </Link>
          <Link
            to="/cbc-timeline"
            className={`px-4 py-2 rounded ${isActive('/cbc-timeline') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            CBC-RC TX
          </Link>
          <Link
            to="/planning"
            className={`px-4 py-2 rounded ${isActive('/planning') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            Planning
          </Link>
          <Link
            to="/live-booths"
            className={`px-4 py-2 rounded ${isActive('/live-booths') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            Live Booths
          </Link>
          <Link
            to="/booths"
            className={`px-4 py-2 rounded ${isActive('/booths') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            Booths
          </Link>
          <Link
            to="/resources"
            className={`px-4 py-2 rounded ${isActive('/resources') ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
          >
            Resources
          </Link>
        </nav>
      </div>
    </header>
  )
}

function AppContent() {
  const location = useLocation()
  const [navbarHeight, setNavbarHeight] = useState(73)
  
  useEffect(() => {
    const header = document.querySelector('header')
    if (header) {
      setNavbarHeight(header.offsetHeight)
    }
  }, [])

  // Don't add padding-top on booth detail page (no nav menu)
  const isBoothDetailPage = location.pathname.match(/^\/live-booths\/[^/]+$/)
  const paddingTop = isBoothDetailPage ? 0 : navbarHeight

  return (
    <div className="flex-1" style={{ paddingTop: `${paddingTop}px` }}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/planning" element={<PlanningTimelineView />} />
        <Route path="/cbc-timeline" element={<CBCTimelineView />} />
        <Route path="/obs-timeline" element={<OBSTimelineView />} />
        <Route path="/resources" element={
          <div className="p-6 space-y-6 overflow-y-auto">
            <ResourceManager resourceType="commentators" displayName="Commentators" />
            <ResourceManager resourceType="producers" displayName="Producers" />
            <ResourceManager resourceType="encoders" displayName="Encoders" />
            <ResourceManager resourceType="booths" displayName="Booths" />
            <ResourceManager resourceType="suites" displayName="Suites" />
            <ResourceManager resourceType="networks" displayName="Networks" />
          </div>
        } />
        <Route path="/booths" element={<BoothPage />} />
        <Route path="/live-booths" element={<LiveBoothsView />} />
        <Route path="/live-booths/:boothId" element={<BoothDetailView />} />
      </Routes>
    </div>
  )
}

function App() {

  return (
    <BrowserRouter>
      <div className="h-screen flex flex-col">
        <Navigation />
        <AppContent />
      </div>
    </BrowserRouter>
  )
}

export default App

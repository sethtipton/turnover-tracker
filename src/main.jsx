import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Preserve bookmarked project-path URLs when arriving on the custom domain.
if (import.meta.env.BASE_URL === '/' && window.location.pathname.startsWith('/turnover-tracker/')) {
  window.history.replaceState(null, '', window.location.pathname.slice('/turnover-tracker'.length) + window.location.search + window.location.hash);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

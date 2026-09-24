import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@axiapps/axi-design/axi.css';
import '@axiapps/axi-design/accents.css';
import './index.css'
import './themes/series.css'
import { applyTheme, readStoredAccentId } from './themes/applyTheme'

// electron-store is the source of truth, but getSettings() resolves after
// first paint. Bootstrapping from the synchronous localStorage mirror keeps
// a non-default accent from flashing emerald on every launch.
applyTheme(readStoredAccentId())

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

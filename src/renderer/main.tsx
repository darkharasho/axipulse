import React from 'react'
import ReactDOM from 'react-dom/client'
// These six stylesheets must be imported before anything that might read a
// token off them at module scope (e.g. BoonPerformanceChart's SERIES ramp).
// ES modules evaluate in import-declaration order, and the static chain
// App -> AppLayout -> PulseView -> BoonsSubview -> BoonPerformanceChart runs
// synchronously, so importing App first would run that module body before
// any stylesheet is evaluated in `npm run dev` (Vite's dev server serves CSS
// imports as JS side effects in declaration order; only the production
// build emits a <link rel=stylesheet> ahead of the module script, which is
// why this bug did not show up under `npm run build`).
import '@axiapps/axi-design/axi.css';
import '@axiapps/axi-design/accents.css';
import '@axiapps/axi-design/themes/flat.css';
import '@axiapps/axi-design/themes/glass.css';
import './index.css'
import './themes/series.css'
import App from './App.tsx'
import { applyTheme, readStoredAccentId, applySurface, readStoredSurfaceId } from './themes/applyTheme'

// electron-store is the source of truth, but getSettings() resolves after
// first paint. Bootstrapping from the synchronous localStorage mirrors keeps
// a non-default accent or surface from flashing on every launch.
applyTheme(readStoredAccentId())
applySurface(readStoredSurfaceId())

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)

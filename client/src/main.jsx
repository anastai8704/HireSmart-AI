/**
 * main.jsx
 * -----------------------------------------------------------------------------
 * The browser entry point. Vite loads this file first; it mounts <App /> into
 * the <div id="root"> in index.html.
 *
 * StrictMode is a development-only helper that intentionally double-invokes
 * effects to surface bugs such as missing cleanup functions. It has no effect
 * on the production build.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

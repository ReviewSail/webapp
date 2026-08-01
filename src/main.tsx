import React from 'react'
import ReactDOM from 'react-dom/client'
// Bundled rather than fetched from a CDN: the dashboard's numbers shift on load
// if the face arrives late, and index.css has always assumed Inter's character
// variants were available.
import '@fontsource-variable/inter'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

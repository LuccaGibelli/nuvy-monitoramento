import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import IngestionStatus from './IngestionStatus'
import './styles.css'
import './enhancements.css'
import './ingestion-status.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <IngestionStatus />
  </React.StrictMode>,
)

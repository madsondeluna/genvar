import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// camada de luz: mede a caixa e escreve --light-x/-y/--light-near; toda a
// aparencia mora em light.css. Auto-inicia e revarre por MutationObserver.
import './pure/light.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

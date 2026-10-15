import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RecepcionView from './components/RecepcionView.jsx'
import TurnoKiosco from './components/TurnoKiosco.jsx'
import PrevenirPublicForm from './components/PrevenirPublicForm.jsx'
import './index.css'

// Simple path-based routing without React Router
// /recepcion → standalone reception view (no login)
// /turno     → standalone kiosk for queue tickets (no login)
// /prevenir  → standalone mobile-first lead capture for Programa Prevenir (no login)
// everything else → normal app with login
const pathname = window.location.pathname;
const search = window.location.search;
const hash = window.location.hash;

const isRecepcion = pathname === '/recepcion' || pathname === '/recepcion/';
const isTurno = pathname === '/turno' || pathname === '/turno/';
const isPrevenir = pathname === '/prevenir' || pathname === '/prevenir/' || search.includes('view=prevenir') || hash === '#prevenir';

const RootComponent = isTurno ? TurnoKiosco : isRecepcion ? RecepcionView : isPrevenir ? PrevenirPublicForm : App;

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <RootComponent />
    </React.StrictMode>,
)

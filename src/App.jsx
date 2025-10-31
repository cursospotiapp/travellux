import React, { useState } from 'react';
import LandingPage from './components/LandingPage';
import TripPlannerDemo from './components/TripPlannerDemo';

function App() {
  // Estado para controlar qué página mostrar
  const [currentPage, setCurrentPage] = useState('landing'); // 'landing' o 'planner'

  // Listener para cambios en sessionStorage
  React.useEffect(() => {
    const checkPreferences = () => {
      const prefs = sessionStorage.getItem('travelPreferences');
      if (prefs && currentPage === 'landing') {
        setCurrentPage('planner');
      }
    };

    // Verificar al montar
    checkPreferences();

    // Escuchar cambios
    window.addEventListener('storage', checkPreferences);
    return () => window.removeEventListener('storage', checkPreferences);
  }, [currentPage]);

  // Para probar directamente el Trip Planner, cambia 'landing' por 'planner' abajo
  // O usa los botones en la consola del navegador

  if (currentPage === 'planner') {
    return <TripPlannerDemo />;
  }

  return <LandingPage />;
}

// Funciones globales para cambiar de página desde la consola del navegador
window.showLanding = () => window.location.reload();
window.showPlanner = () => {
  const event = new Event('storage');
  sessionStorage.setItem(
    'travelPreferences',
    JSON.stringify({
      destination: 'París, Francia',
      startDate: '15/12/2025',
      endDate: '18/12/2025',
      budget: 'medium',
      intensity: 'balanced',
    })
  );
  window.dispatchEvent(event);
};

export default App;

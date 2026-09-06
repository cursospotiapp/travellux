/**
 * Fallback local: genera un viaje válido sin IA ni Overpass.
 *
 * Se usa cuando ambas estrategias fallan (Overpass caído, quota de Gemini
 * agotada, etc.) para que la web NUNCA muestre días con 0 eventos.
 *
 * Reutiliza los datos estáticos de src/data (parís como plantilla base,
 * adaptando títulos de resumen al destino solicitado).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hotelsData = JSON.parse(
  readFileSync(path.join(__dirname, '../../src/data/hotels.json'), 'utf8')
);
const itinerariesData = JSON.parse(
  readFileSync(path.join(__dirname, '../../src/data/itineraries.json'), 'utf8')
);

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return null;
}

/**
 * Genera un viaje completo con datos locales.
 * @param {Object} preferences - { destination, startDate, endDate, budget, intensity }
 * @returns {Object|null} Datos del viaje o null si las fechas son inválidas
 */
export function buildLocalFallbackTrip(preferences) {
  const { destination, startDate, endDate, budget, intensity } =
    preferences || {};

  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || isNaN(start) || isNaN(end)) return null;

  const days = Math.ceil((end - start) / 86400000) + 1;

  const budgetKey = budget || 'medium';
  const hotels =
    (hotelsData.budget &&
      (hotelsData.budget[budgetKey] || hotelsData.budget.medium)) ||
    [];

  const intensityKey = intensity || 'balanced';
  const template =
    itinerariesData.destinations.paris[intensityKey] ||
    itinerariesData.destinations.paris.balanced;

  // Clonar plantilla y recortar/ampliar al número de días del viaje
  const itinerary = {};
  const templateKeys = Object.keys(template).sort();
  for (let i = 0; i < days; i++) {
    const srcKey = templateKeys[i % templateKeys.length];
    const src = template[srcKey];
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    itinerary[`day${i + 1}`] = {
      ...src,
      dayNumber: i + 1,
      date: date.toISOString().substring(0, 10),
      title: `Día ${i + 1} en ${destination}`,
      events: (src.events || []).map((e, j) => ({
        ...e,
        id: `evt-${i + 1}-${j + 1}`,
      })),
    };
  }

  return {
    tripId: `trip-${String(destination)
      .toLowerCase()
      .replace(/\s+/g, '-')}-${Date.now()}`,
    userPreferences: preferences,
    tripSummary: {
      destination,
      country: '—',
      duration: days,
      totalDays: days,
      departureCity: 'Madrid',
      subtitle: `Viaje de ${days} días a ${destination} (itinerario de demostración)`,
      centerCoordinates: { lat: 40.4168, lng: -3.7038 },
    },
    hotels: hotels.slice(0, 3),
    itinerary,
    fallback: true,
  };
}
/**
 * Utilidades para cargar y procesar datos del Travel Planner
 */

import hotelsData from '../data/hotels.json';
import itinerariesData from '../data/itineraries.json';

/**
 * Genera un ID único para el viaje
 */
export function generateTripId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `trip-${timestamp}-${random}`;
}

/**
 * Selecciona hoteles según el presupuesto del usuario
 * @param {string} budget - "low" | "medium" | "high" | "luxury"
 * @param {number} count - Número de hoteles a devolver (default: 3)
 * @returns {Array} Array de hoteles
 */
export function selectHotels(budget, count = 3) {
  const budgetKey = budget || 'medium';
  const hotels = hotelsData.budget[budgetKey] || hotelsData.budget.medium;

  // Devuelve los primeros 'count' hoteles, o todos si hay menos
  return hotels.slice(0, Math.min(count, hotels.length));
}

/**
 * Selecciona el itinerario según destino e intensidad
 * @param {string} destination - Nombre de la ciudad (ej: "paris")
 * @param {string} intensity - "wellness" | "relaxed" | "balanced" | "active"
 * @returns {Object} Objeto con días del itinerario
 */
export function selectItinerary(destination, intensity) {
  const destKey = destination.toLowerCase();
  const intensityKey = intensity || 'balanced';

  const cityData = itinerariesData.destinations[destKey];
  if (!cityData) {
    // Fallback a París si el destino no existe
    return itinerariesData.destinations.paris[intensityKey];
  }

  return cityData[intensityKey] || cityData.balanced;
}

/**
 * Calcula la duración del viaje en días
 * @param {string} startDate - Fecha de inicio "DD/MM/YYYY"
 * @param {string} endDate - Fecha de fin "DD/MM/YYYY"
 * @returns {number} Número de días
 */
export function calculateDuration(startDate, endDate) {
  const [startDay, startMonth, startYear] = startDate.split('/').map(Number);
  const [endDay, endMonth, endYear] = endDate.split('/').map(Number);

  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Genera el resumen del viaje
 * @param {Object} preferences - Preferencias del usuario
 * @returns {Object} Resumen del viaje
 */
export function generateTripSummary(preferences) {
  const { destination, startDate, endDate } = preferences;
  const duration = calculateDuration(startDate, endDate);

  // Extraer ciudad y país del destino
  const [city, country] = destination.split(',').map((s) => s.trim());

  return {
    destination: city || destination,
    country: country || 'Francia',
    duration: duration,
    totalDays: duration,
    departureCity: 'Madrid', // Esto podría ser dinámico
    subtitle: `Madrid → ${city} | ${duration} días de experiencia inolvidable`,
  };
}

/**
 * Añade las fechas a cada día del itinerario
 * @param {Object} itinerary - Itinerario base
 * @param {string} startDate - Fecha de inicio "DD/MM/YYYY"
 * @returns {Object} Itinerario con fechas
 */
export function addDatesToItinerary(itinerary, startDate) {
  const [startDay, startMonth, startYear] = startDate.split('/').map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);

  const updatedItinerary = {};

  Object.keys(itinerary).forEach((dayKey, index) => {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + index);

    const day = currentDate.getDate().toString().padStart(2, '0');
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const year = currentDate.getFullYear();

    updatedItinerary[dayKey] = {
      ...itinerary[dayKey],
      dayNumber: index + 1,
      date: `${day}/${month}/${year}`,
    };
  });

  return updatedItinerary;
}

/**
 * Genera los datos completos del viaje basándose en las preferencias del usuario
 * @param {Object} preferences - Preferencias del formulario
 * @returns {Object} Datos completos del viaje
 */
export function generateTrip(preferences) {
  const { destination, startDate, budget, intensity } = preferences;

  // Normalizar nombre del destino para buscar en los datos
  const cityKey = destination.toLowerCase().split(',')[0].trim();
  const normalizedCity = cityKey === 'parís' ? 'paris' : cityKey;

  // Seleccionar datos
  const hotels = selectHotels(budget);
  const baseItinerary = selectItinerary(normalizedCity, intensity);
  const itinerary = addDatesToItinerary(baseItinerary, startDate);

  return {
    tripId: generateTripId(),
    userPreferences: preferences,
    tripSummary: generateTripSummary(preferences),
    hotels: hotels,
    itinerary: itinerary,
  };
}

/**
 * Obtiene las coordenadas de todos los eventos de un día
 * @param {Object} day - Día del itinerario
 * @returns {Array} Array de coordenadas {lat, lng, name, time}
 */
export function getDayCoordinates(day) {
  return day.events.map((event) => ({
    lat: event.location.coordinates.lat,
    lng: event.location.coordinates.lng,
    name: event.location.name,
    time: event.time,
  }));
}

/**
 * Filtra eventos por tipo
 * @param {Array} events - Array de eventos
 * @param {string} type - Tipo de evento
 * @returns {Array} Eventos filtrados
 */
export function filterEventsByType(events, type) {
  return events.filter((event) => event.type === type);
}

/**
 * Calcula el precio total estimado del viaje
 * @param {Object} tripData - Datos completos del viaje
 * @param {number} hotelNights - Número de noches de hotel
 * @returns {Object} Desglose de precios
 */
export function calculateTotalCost(tripData, hotelNights = 3) {
  let hotelCost = 0;
  let activitiesCost = 0;
  let mealsCost = 0;

  // Costo promedio de hoteles
  if (tripData.hotels.length > 0) {
    const avgHotelPrice =
      tripData.hotels.reduce((sum, hotel) => sum + hotel.price.amount, 0) /
      tripData.hotels.length;
    hotelCost = avgHotelPrice * hotelNights;
  }

  // Costo de eventos
  Object.values(tripData.itinerary).forEach((day) => {
    day.events.forEach((event) => {
      if (event.price) {
        if (event.type === 'restaurant') {
          mealsCost += event.price.amount;
        } else {
          activitiesCost += event.price.amount;
        }
      }
    });
  });

  const total = hotelCost + activitiesCost + mealsCost;

  return {
    hotel: Math.round(hotelCost),
    activities: Math.round(activitiesCost),
    meals: Math.round(mealsCost),
    total: Math.round(total),
    currency: 'EUR',
  };
}

/**
 * Valida las preferencias del usuario
 * @param {Object} preferences - Preferencias a validar
 * @returns {Object} {valid: boolean, errors: Array}
 */
export function validatePreferences(preferences) {
  const errors = [];

  if (!preferences.destination) {
    errors.push('El destino es requerido');
  }

  if (!preferences.startDate) {
    errors.push('La fecha de inicio es requerida');
  }

  if (!preferences.endDate) {
    errors.push('La fecha de fin es requerida');
  }

  if (!preferences.budget) {
    errors.push('El presupuesto es requerido');
  }

  if (!preferences.intensity) {
    errors.push('La intensidad del viaje es requerida');
  }

  // Validar que la fecha de fin sea posterior a la de inicio
  if (preferences.startDate && preferences.endDate) {
    const duration = calculateDuration(
      preferences.startDate,
      preferences.endDate
    );
    if (duration < 1) {
      errors.push('La fecha de fin debe ser posterior a la fecha de inicio');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

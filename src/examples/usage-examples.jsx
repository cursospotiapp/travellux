/**
 * EJEMPLO DE USO - Cómo implementar los datos en componentes React
 * Este archivo NO se ejecuta, es solo referencia
 */

import {
  generateTrip,
  calculateTotalCost,
  getDayCoordinates,
} from '../utils/dataHelpers';

// =============================================================================
// EJEMPLO 1: Generar viaje desde el formulario
// =============================================================================

function handleFormSubmit(formData) {
  // formData viene del formulario de landing_trip.html
  const tripData = generateTrip({
    destination: formData.destination, // "París, Francia"
    startDate: formData.startDate, // "15/12/2025"
    endDate: formData.endDate, // "18/12/2025"
    budget: formData.budget, // "medium"
    intensity: formData.intensity, // "balanced"
  });

  // Guardar en sessionStorage
  sessionStorage.setItem('currentTrip', JSON.stringify(tripData));

  // Redirigir a la página de resultados
  window.location.href = '/trip-planner';
}

// =============================================================================
// EJEMPLO 2: Componente de hoteles
// =============================================================================

function HotelsSection({ hotels }) {
  return (
    <div className="hotels-grid">
      {hotels.map((hotel) => (
        <div key={hotel.id} className="hotel-card">
          <img src={hotel.image} alt={hotel.name} className="hotel-image" />
          <div className="hotel-content">
            <div className="hotel-header">
              <h3 className="hotel-name">{hotel.name}</h3>
              <div className="hotel-stars">{'★'.repeat(hotel.stars)}</div>
            </div>
            <div className="hotel-location">
              <LocationIcon />
              <span>
                {hotel.location.area}, {hotel.location.description}
              </span>
            </div>
            <div className="hotel-amenities">
              {hotel.amenities.map((amenity, i) => (
                <span key={i} className="amenity-tag">
                  {amenity}
                </span>
              ))}
            </div>
            <div className="hotel-price">
              <div>
                <div className="price-amount">
                  {hotel.price.currency}€{hotel.price.amount}
                </div>
                <div className="price-label">por {hotel.price.period}</div>
              </div>
            </div>
            <a
              href={hotel.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              Ver Disponibilidad
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// EJEMPLO 3: Componente de itinerario con carrusel
// =============================================================================

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';

function EventCard({ event }) {
  return (
    <div className="event-card">
      <div className="event-content-wrapper">
        {/* Carrusel de imágenes */}
        <div className="event-carousel">
          <Swiper
            modules={[Navigation, Pagination, Autoplay]}
            loop={true}
            autoplay={{ delay: 4000, disableOnInteraction: false }}
            pagination={{ clickable: true }}
            navigation={true}
          >
            {event.images.map((image, index) => (
              <SwiperSlide key={index}>
                <img src={image} alt={`${event.title} - ${index + 1}`} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {/* Información del evento */}
        <div className="event-info">
          <div className="event-header">
            <div className="event-icon">
              <EventTypeIcon type={event.type} />
            </div>
            <div className="event-title-group">
              <div className="event-time-badge">{event.time}</div>
              <h4 className="event-title">{event.title}</h4>
            </div>
          </div>

          <p className="event-description">{event.description}</p>

          {/* Tip/Consejo */}
          {event.tip && (
            <div className="event-tip">
              <LightbulbIcon />
              <div className="event-tip-content">
                <div className="event-tip-title">{event.tip.title}</div>
                <div className="event-tip-text">{event.tip.content}</div>
              </div>
            </div>
          )}

          {/* Detalles */}
          <div className="event-details">
            <div className="event-detail-item">
              <ClockIcon />
              <span>
                <strong>Duración:</strong> {event.duration}
              </span>
            </div>
            <div className="event-detail-item">
              <CurrencyIcon />
              <span>
                <strong>Precio:</strong> €{event.price.amount} (
                {event.price.description})
              </span>
            </div>
            {event.nextTransport && (
              <div className="event-detail-item">
                <ArrowIcon />
                <span>
                  <strong>Siguiente:</strong> {event.nextTransport.duration}{' '}
                  {event.nextTransport.description}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// EJEMPLO 4: Componente de día completo
// =============================================================================

function DayItinerary({ day, dayKey }) {
  const [mapOpen, setMapOpen] = useState(false);
  const coordinates = getDayCoordinates(day);

  return (
    <div className="itinerary-day">
      <div className="day-header">
        <h3 className="day-title">{day.title}</h3>
        <button className="btn-map" onClick={() => setMapOpen(true)}>
          <MapIcon />
          Ver en Mapa
        </button>
      </div>
      <div className="day-content">
        {day.events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Modal de mapa */}
      {mapOpen && (
        <MapModal coordinates={coordinates} onClose={() => setMapOpen(false)} />
      )}
    </div>
  );
}

// =============================================================================
// EJEMPLO 5: Página completa de trip planner
// =============================================================================

function TripPlannerPage() {
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cargar datos del viaje desde sessionStorage
    const savedTrip = sessionStorage.getItem('currentTrip');

    if (savedTrip) {
      const data = JSON.parse(savedTrip);
      setTripData(data);
    } else {
      // Si no hay datos, cargar ejemplo o redirigir
      import('../data/example-trip-paris.json').then((module) => {
        setTripData(module.default);
      });
    }

    setLoading(false);
  }, []);

  if (loading || !tripData) {
    return <LoadingSpinner />;
  }

  const costBreakdown = calculateTotalCost(tripData);

  return (
    <div className="trip-planner">
      {/* Header */}
      <header>
        <h1>Tu Viaje a {tripData.tripSummary.destination}</h1>
        <p>{tripData.tripSummary.subtitle}</p>
      </header>

      <div className="container">
        {/* Sección de hoteles */}
        <section>
          <h2 className="section-title">Alojamiento Recomendado</h2>
          <p className="section-subtitle">
            Opciones cuidadosamente seleccionadas para tu estancia
          </p>
          <HotelsSection hotels={tripData.hotels} />
        </section>

        {/* Sección de itinerario */}
        <section>
          <h2 className="section-title">
            Itinerario de {tripData.tripSummary.duration} Días
          </h2>
          <p className="section-subtitle">
            Una experiencia cuidadosamente planificada para descubrir lo mejor
            de {tripData.tripSummary.destination}
          </p>

          {Object.entries(tripData.itinerary).map(([dayKey, day]) => (
            <DayItinerary key={dayKey} day={day} dayKey={dayKey} />
          ))}
        </section>

        {/* Resumen de costos */}
        <section className="cost-summary">
          <h2 className="section-title">Presupuesto Estimado</h2>
          <div className="cost-breakdown">
            <div className="cost-item">
              <span>Alojamiento:</span>
              <strong>€{costBreakdown.hotel}</strong>
            </div>
            <div className="cost-item">
              <span>Actividades:</span>
              <strong>€{costBreakdown.activities}</strong>
            </div>
            <div className="cost-item">
              <span>Comidas:</span>
              <strong>€{costBreakdown.meals}</strong>
            </div>
            <div className="cost-item total">
              <span>Total Estimado:</span>
              <strong>€{costBreakdown.total}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// =============================================================================
// EJEMPLO 6: Mapa interactivo con Leaflet
// =============================================================================

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from 'react-leaflet';
import L from 'leaflet';

function MapModal({ coordinates, onClose }) {
  const center =
    coordinates.length > 0
      ? [coordinates[0].lat, coordinates[0].lng]
      : [48.8566, 2.3522];

  // Crear marcadores personalizados numerados
  const createNumberedIcon = (number) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div class="custom-marker">${number}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  };

  return (
    <div className="map-modal active">
      <div className="map-container">
        <button className="map-close" onClick={onClose}>
          <CloseIcon />
        </button>

        <MapContainer
          center={center}
          zoom={13}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          {/* Marcadores */}
          {coordinates.map((coord, index) => (
            <Marker
              key={index}
              position={[coord.lat, coord.lng]}
              icon={createNumberedIcon(index + 1)}
            >
              <Popup>
                <strong>{coord.name}</strong>
                <br />
                {coord.time}
              </Popup>
            </Marker>
          ))}

          {/* Línea de ruta */}
          <Polyline
            positions={coordinates.map((c) => [c.lat, c.lng])}
            color="#d4af37"
            weight={3}
            opacity={0.7}
            dashArray="10, 10"
          />
        </MapContainer>
      </div>
    </div>
  );
}

export default TripPlannerPage;

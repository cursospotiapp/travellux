import React, { useState, useEffect, useRef } from 'react';
import AOS from 'aos';
import L from 'leaflet';
import Swiper from 'swiper';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'aos/dist/aos.css';
import 'leaflet/dist/leaflet.css';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { generateTrip, calculateTotalCost } from '../utils/dataHelpers';
import exampleTrip from '../data/example-trip-paris.json';
import './TripPlannerDemo.css';

// Helper para calcular hora de fin a partir de hora inicio y duración
function calculateEndTime(startTime, duration) {
  if (!startTime || !duration) return null;

  // Parsear hora de inicio (formato "HH:mm" o "HH:MM")
  const [hours, minutes] = startTime.split(':').map(Number);

  // Parsear duración (formato "2h", "1.5h", "30min", etc.)
  let durationMinutes = 0;
  const hourMatch = duration.match(/(\d+\.?\d*)h/);
  const minMatch = duration.match(/(\d+)\s*min/);

  if (hourMatch) {
    durationMinutes += parseFloat(hourMatch[1]) * 60;
  }
  if (minMatch) {
    durationMinutes += parseInt(minMatch[1]);
  }

  // Calcular hora final
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = Math.floor(totalMinutes % 60);

  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(
    2,
    '0'
  )}`;
}

function TripPlannerDemo() {
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [currentDay, setCurrentDay] = useState(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    try {
      // Initialize AOS
      AOS.init({
        duration: 800,
        once: true,
        offset: 100,
      });

      // Check if there are preferences in sessionStorage
      const storedAI = sessionStorage.getItem('aiTripData');
      const storedPrefs = sessionStorage.getItem('travelPreferences');

      let trip = null;

      // Prioridad 1: Datos generados por IA
      if (storedAI) {
        try {
          trip = JSON.parse(storedAI);
          console.log('🤖 Using AI-generated trip data');
          console.log('📊 AI Trip:', trip);
        } catch (e) {
          console.warn('Failed to parse aiTripData, falling back.', e);
        }
      }

      // Prioridad 2: Generar con preferencias del usuario
      if (!trip && storedPrefs) {
        try {
          const prefs = JSON.parse(storedPrefs);
          console.log('⚙️ Using generateTrip() with preferences:', prefs);
          trip = generateTrip(prefs);
        } catch (e) {
          console.warn('Failed to generate trip from prefs:', e);
        }
      }

      // Prioridad 3: Datos de ejemplo por defecto
      if (!trip) {
        console.log('📦 Using example trip data (full 3 days)');
        trip = exampleTrip;
      }

      console.log('🚀 Trip Data Loaded:', trip);
      console.log('📅 Itinerary Days:', Object.keys(trip.itinerary));
      console.log('📊 Full Itinerary:', trip.itinerary);

      setTripData(trip);
      setLoading(false);
    } catch (err) {
      console.error('Error loading trip data:', err);
      setError('Error al cargar los datos del viaje');
      setLoading(false);
    }
  }, []);

  // Initialize Swiper carousels after data is loaded
  useEffect(() => {
    if (!tripData) return;

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      const swipers = document.querySelectorAll('.event-carousel .swiper');
      swipers.forEach((swiperEl) => {
        new Swiper(swiperEl, {
          modules: [Navigation, Pagination, Autoplay],
          loop: true,
          autoplay: {
            delay: 4000,
            disableOnInteraction: false,
          },
          pagination: {
            el: swiperEl.querySelector('.swiper-pagination'),
            clickable: true,
          },
          navigation: {
            nextEl: swiperEl.querySelector('.swiper-button-next'),
            prevEl: swiperEl.querySelector('.swiper-button-prev'),
          },
        });
      });
    }, 100);
  }, [tripData]);

  // Close map on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mapVisible) {
        closeMap();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mapVisible]);

  const openMap = (dayIndex, eventIndexToOpen = null) => {
    setMapVisible(true);
    setCurrentDay(dayIndex);

    setTimeout(() => {
      if (!mapInstanceRef.current) {
        // Obtener coordenadas del centro de la ciudad desde tripSummary
        const centerCoords = tripData?.tripSummary?.centerCoordinates || {
          lat: 40.4168,
          lng: -3.7038,
        };

        // Initialize map with center from trip data
        mapInstanceRef.current = L.map(mapRef.current).setView(
          [centerCoords.lat, centerCoords.lng],
          12
        );
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(mapInstanceRef.current);
      }

      // Clear previous markers and polyline
      markersRef.current.forEach((marker) =>
        mapInstanceRef.current.removeLayer(marker)
      );
      if (polylineRef.current)
        mapInstanceRef.current.removeLayer(polylineRef.current);
      markersRef.current = [];

      const selectedDayKey = `day${dayIndex + 1}`;
      const selectedDay = tripData.itinerary[selectedDayKey];

      console.log(`[MAP] Opening map - selected day: ${selectedDayKey}`, {
        dayExists: !!selectedDay,
        eventsCount: selectedDay?.events?.length || 0,
      });

      if (!selectedDay || !selectedDay.events) {
        console.error('No day data found for', selectedDayKey);
        return;
      }

      // 🔥 MOSTRAR TODOS LOS DÍAS EN EL MAPA
      const allDayLatLngs = []; // Para calcular bounds de todos los días
      const selectedDayLatLngs = []; // Para zoom inicial en el día seleccionado

      Object.keys(tripData.itinerary).forEach((dayKey) => {
        const day = tripData.itinerary[dayKey];
        const dayNum = parseInt(dayKey.replace('day', ''));
        const isSelectedDay = dayKey === selectedDayKey;

        if (!day || !day.events) return;

        // Add numbered markers for each event
        day.events.forEach((event, index) => {
          if (event.location && event.location.coordinates) {
            const coords = [
              event.location.coordinates.lat,
              event.location.coordinates.lng,
            ];

            // Color diferente para cada día
            const dayColors = [
              '#d4af37',
              '#4299e1',
              '#48bb78',
              '#ed8936',
              '#9f7aea',
            ];
            const markerColor = dayColors[(dayNum - 1) % dayColors.length];

            const markerIcon = L.divIcon({
              className: 'custom-marker-wrapper',
              html: `<div class="custom-marker" style="background-color: ${markerColor}; ${
                isSelectedDay ? 'transform: scale(1.2);' : 'opacity: 0.7;'
              }">${index + 1}</div>`,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            });

            const marker = L.marker(coords, { icon: markerIcon })
              .addTo(mapInstanceRef.current)
              .bindPopup(
                `<div class="custom-popup">
                  <strong>${event.title}</strong>
                  <span class="popup-time">📅 Día ${dayNum} - 🕐 ${event.time}</span>
                  <span class="popup-duration">⏱️ ${event.duration}</span>
                </div>`,
                { className: 'custom-leaflet-popup', maxWidth: 300 }
              );

            // If this is the event to open on the selected day
            if (
              isSelectedDay &&
              eventIndexToOpen !== null &&
              index === eventIndexToOpen
            ) {
              setTimeout(() => {
                marker.openPopup();
                mapInstanceRef.current.setView(coords, 15);
              }, 200);
            }

            markersRef.current.push(marker);
            allDayLatLngs.push(coords);

            if (isSelectedDay) {
              selectedDayLatLngs.push(coords);
            }
          }
        });

        // Draw route lines for this day
        const dayLatLngs = day.events
          .filter((e) => e.location?.coordinates)
          .map((e) => [e.location.coordinates.lat, e.location.coordinates.lng]);

        if (dayLatLngs.length > 1) {
          for (let i = 0; i < dayLatLngs.length - 1; i++) {
            const dayColors = [
              '#d4af37',
              '#4299e1',
              '#48bb78',
              '#ed8936',
              '#9f7aea',
            ];
            const lineColor = dayColors[(dayNum - 1) % dayColors.length];

            const line = L.polyline([dayLatLngs[i], dayLatLngs[i + 1]], {
              color: lineColor,
              weight: isSelectedDay ? 4 : 2,
              opacity: isSelectedDay ? 0.85 : 0.4,
              smoothFactor: 1,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(mapInstanceRef.current);

            markersRef.current.push(line);
          }
        }
      });

      console.log(
        `[MAP] Total markers/lines: ${markersRef.current.length}, Selected day POIs: ${selectedDayLatLngs.length}, All days POIs: ${allDayLatLngs.length}`
      );

      // 🔥 ZOOM INICIAL: Centrar en el día seleccionado, pero usuario puede hacer zoom out para ver todos
      if (eventIndexToOpen === null) {
        if (selectedDayLatLngs.length > 1) {
          mapInstanceRef.current.fitBounds(selectedDayLatLngs, {
            padding: [50, 50],
          });
        } else if (selectedDayLatLngs.length === 1) {
          mapInstanceRef.current.setView(selectedDayLatLngs[0], 14);
        }
      }
    }, 100);
  };

  const closeMap = () => {
    setMapVisible(false);
    setCurrentDay(null);
  };

  if (loading) {
    return (
      <div className="trip-planner-loading">
        <div className="spinner"></div>
        <p>Cargando tu viaje perfecto...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="trip-planner-error">
        <h2>❌ {error}</h2>
        <button onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    );
  }

  const costs = calculateTotalCost(tripData);

  return (
    <div className="trip-planner-demo">
      <header data-aos="fade-down">
        <button
          className="btn-back-home"
          onClick={() => {
            sessionStorage.removeItem('travelPreferences');
            sessionStorage.removeItem('aiTripData');
            window.showLanding();
          }}
          title="Volver al inicio"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Planificar otro viaje
        </button>
        <h1>Tu Viaje a {tripData.tripSummary.destination}</h1>
        <p>
          Madrid → {tripData.tripSummary.destination} |{' '}
          {tripData.tripSummary.duration} días de experiencia inolvidable
        </p>

        {/* Badge indicando uso de POIs reales de OpenStreetMap */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            padding: '8px 16px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'white',
            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>POIs verificados con OpenStreetMap + Wikidata</span>
        </div>
      </header>

      {/* Hotels Section */}
      <section className="container">
        <h2 className="section-title" data-aos="fade-up">
          Alojamiento Recomendado
        </h2>
        <p className="section-subtitle" data-aos="fade-up" data-aos-delay="100">
          Opciones cuidadosamente seleccionadas para tu estancia
        </p>

        <div className="hotels-grid">
          {tripData.hotels.map((hotel, index) => (
            <div
              key={hotel.id}
              className="hotel-card"
              data-aos="fade-up"
              data-aos-delay={200 + index * 100}
            >
              <img
                src={hotel.image || '/placeholder.svg?height=220&width=400'}
                alt={hotel.name}
                className="hotel-image"
                onError={(e) => {
                  e.target.src =
                    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=220&fit=crop';
                }}
              />
              <div className="hotel-content">
                <div className="hotel-header">
                  <h3 className="hotel-name">{hotel.name}</h3>
                  <div className="hotel-stars">{'★'.repeat(hotel.stars)}</div>
                </div>
                <div className="hotel-location">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>
                    {hotel.location.area}, {hotel.location.description}
                  </span>
                </div>
                {hotel.amenities && hotel.amenities.length > 0 && (
                  <div className="hotel-amenities">
                    {hotel.amenities.map((amenity, i) => (
                      <span key={i} className="amenity-tag">
                        {amenity}
                      </span>
                    ))}
                  </div>
                )}
                <div className="hotel-price">
                  <div>
                    <div className="price-amount">€{hotel.price.amount}</div>
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
      </section>

      {/* Itinerary Section */}
      <section className="container">
        <h2 className="section-title" data-aos="fade-up">
          Itinerario de {tripData.tripSummary.duration} Días
        </h2>
        <p className="section-subtitle" data-aos="fade-up" data-aos-delay="100">
          Una experiencia cuidadosamente planificada para descubrir lo mejor de{' '}
          {tripData.tripSummary.destination}
        </p>

        {(() => {
          const days = Object.entries(tripData.itinerary);
          console.log(
            '🗓️ Rendering days:',
            days.length,
            days.map(([k, v]) => `${k}: ${v.events?.length || 0} events`)
          );
          return days.map(([dayKey, day], dayIndex) => (
            <div key={dayKey} className="itinerary-day" data-aos="fade-up">
              <div className="day-header">
                <h3 className="day-title">
                  {day.title && day.title.startsWith('Día')
                    ? day.title
                    : `Día ${dayIndex + 1}: ${
                        day.title || tripData.tripSummary.destination
                      }`}
                </h3>
                <button className="btn-map" onClick={() => openMap(dayIndex)}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                  Ver en Mapa
                </button>
              </div>
              <div className="day-content">
                {day.events && day.events.length > 0 ? (
                  day.events.map((event, eventIndex) => (
                    <div key={event.id} className="event-card">
                      <div className="event-content-wrapper">
                        {/* Event Carousel */}
                        <div className="event-carousel">
                          <div className="swiper">
                            <div className="swiper-wrapper">
                              {(event.images && event.images.length > 0
                                ? event.images
                                : [
                                    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&h=320&fit=crop',
                                  ]
                              ).map((image, imgIndex) => (
                                <div key={imgIndex} className="swiper-slide">
                                  <img
                                    src={image}
                                    alt={`${event.title} ${imgIndex + 1}`}
                                    onError={(e) => {
                                      e.target.src =
                                        'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&h=320&fit=crop';
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="swiper-button-next"></div>
                            <div className="swiper-button-prev"></div>
                            <div className="swiper-pagination"></div>
                          </div>
                        </div>

                        {/* Event Info */}
                        <div className="event-info">
                          <div className="event-header">
                            <div
                              className="event-icon event-icon-clickable"
                              onClick={() => openMap(dayIndex, eventIndex)}
                              title="Ver en el mapa"
                            >
                              <span className="event-number">
                                {eventIndex + 1}
                              </span>
                            </div>
                            <div className="event-title-group">
                              <div className="event-time-badge">
                                {event.time}
                                {event.duration &&
                                  calculateEndTime(
                                    event.time,
                                    event.duration
                                  ) && (
                                    <>
                                      {' '}
                                      -{' '}
                                      {calculateEndTime(
                                        event.time,
                                        event.duration
                                      )}
                                    </>
                                  )}
                              </div>
                              <h4 className="event-title">{event.title}</h4>
                            </div>
                          </div>
                          <p className="event-description">
                            {event.description}
                          </p>

                          {/* Tips - soportar tanto array como objeto/string */}
                          {(event.tips || event.tip) && (
                            <div className="event-tip">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                                />
                              </svg>
                              <div className="event-tip-content">
                                <div className="event-tip-title">
                                  Consejos Pro
                                </div>
                                <div className="event-tip-text">
                                  {event.tips ? (
                                    <ul>
                                      {event.tips.map((tip, i) => (
                                        <li key={i}>{tip}</li>
                                      ))}
                                    </ul>
                                  ) : typeof event.tip === 'object' ? (
                                    event.tip.content || event.tip.title
                                  ) : (
                                    event.tip
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tiempo de viaje */}
                          {event.travelTime && (
                            <div className="event-travel-time">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                style={{ width: '16px', height: '16px' }}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                />
                              </svg>
                            </div>
                          )}

                          <div className="event-details">
                            <div className="event-detail-item">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <span>
                                <strong>Duración:</strong> {event.duration}
                              </span>
                            </div>
                            <div className="event-detail-item">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <span>
                                <strong>Precio:</strong>{' '}
                                {event.price.amount > 0
                                  ? `€${event.price.amount}`
                                  : event.price.description}
                              </span>
                            </div>
                            {event.travelTime && (
                              <div className="event-detail-item">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                  />
                                </svg>
                                <span>
                                  <strong>Siguiente:</strong> {event.travelTime}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-events">No hay eventos para este día</div>
                )}
              </div>
            </div>
          ));
        })()}
      </section>

      {/* Map Modal */}
      <div
        className={`map-modal ${mapVisible ? 'active' : ''}`}
        onClick={(e) => e.target.classList.contains('map-modal') && closeMap()}
      >
        <div className="map-container">
          <button className="map-close" onClick={closeMap}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
          <div id="map" ref={mapRef}></div>
        </div>
      </div>
    </div>
  );
}

export default TripPlannerDemo;

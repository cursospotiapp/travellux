import React, { useEffect, useRef, useState } from 'react';
import AOS from 'aos';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'aos/dist/aos.css';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/material_blue.css';
import './LandingPage.css';
import { generateWithFallback } from '../services/tripAiServiceOptimized';

function LandingPage() {
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const startDatePickerRef = useRef(null);
  const endDatePickerRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  useEffect(() => {
    // Initialize AOS
    AOS.init({
      duration: 800,
      easing: 'ease-out',
      once: true,
    });

    // Initialize Flatpickr for date inputs
    startDatePickerRef.current = flatpickr(startDateRef.current, {
      locale: Spanish,
      minDate: 'today',
      dateFormat: 'd/m/Y',
      onChange: function (selectedDates, dateStr) {
        if (endDatePickerRef.current) {
          endDatePickerRef.current.set('minDate', dateStr);
        }
      },
    });

    endDatePickerRef.current = flatpickr(endDateRef.current, {
      locale: Spanish,
      minDate: 'today',
      dateFormat: 'd/m/Y',
      onChange: function (selectedDates, dateStr) {
        // Validar que no se excedan 15 días
        const startDate = startDatePickerRef.current.selectedDates[0];
        const endDate = selectedDates[0];

        if (startDate && endDate) {
          const diffTime = Math.abs(endDate - startDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays > 15) {
            // Mostrar alerta y limpiar fecha
            alert(
              '⚠️ El viaje no puede superar los 15 días. Por favor, selecciona una fecha de fin más cercana.'
            );
            endDatePickerRef.current.clear();
          }
        }
      },
    });

    // Add smooth hover effect to form inputs
    const formInputs = document.querySelectorAll('.form-input');
    formInputs.forEach((input) => {
      input.addEventListener('focus', function () {
        this.parentElement.style.transform = 'translateY(-2px)';
      });

      input.addEventListener('blur', function () {
        this.parentElement.style.transform = 'translateY(0)';
      });
    });

    // Cleanup
    return () => {
      if (startDatePickerRef.current) {
        startDatePickerRef.current.destroy();
      }
      if (endDatePickerRef.current) {
        endDatePickerRef.current.destroy();
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    console.log('\n[LANDING] ========== FORM SUBMISSION ==========');
    setSubmitting(true);
    setProgress(0);
    setProgressMessage('Iniciando generación optimizada...');

    const formData = {
      destination: e.target.destination.value,
      startDate: e.target.startDate.value,
      endDate: e.target.endDate.value,
      budget: e.target.budget.value,
      intensity: e.target.intensity.value,
      searchMethod: e.target.searchMethod?.value || 'original', // 'original' o 'expanded'
    };

    console.log('[LANDING] Form data:', formData);

    // Visual feedback
    const btn = e.target.querySelector('.submit-btn');
    const original = btn.innerHTML;

    try {
      // Usar la generación optimizada con fallback automático
      console.log('[LANDING] Calling generateWithFallback...');
      const result = await generateWithFallback(formData, (update) => {
        // Actualizar progreso en tiempo real
        console.log('[LANDING] Progress update:', update);

        if (update.progress !== undefined) {
          setProgress(update.progress);
        }

        switch (update.type) {
          case 'start':
            setProgressMessage(`Analizando ${update.data.destination}...`);
            btn.innerHTML = `✨ Analizando ${update.data.destination}...`;
            break;
          case 'summary':
            setProgressMessage('Generando resumen del viaje...');
            btn.innerHTML = '✨ Generando resumen...';
            break;
          case 'hotels':
            setProgressMessage('Seleccionando hoteles...');
            btn.innerHTML = '✨ Seleccionando hoteles...';
            break;
          case 'day':
            setProgressMessage(`Planificando día ${update.data.day}...`);
            btn.innerHTML = `✨ Planificando día ${update.data.day}...`;
            break;
          case 'complete':
            setProgressMessage('¡Viaje generado!');
            btn.innerHTML = '✨ ¡Completado!';
            break;
          default:
            break;
        }
      });

      console.log('[LANDING] Generation result:', {
        ok: result.ok,
        fallback: result.fallback,
      });

      if (result.ok && result.data) {
        console.log(
          '[LANDING] ✓ Trip data received, storing and navigating...'
        );
        sessionStorage.setItem('aiTripData', JSON.stringify(result.data));
        sessionStorage.setItem('travelPreferences', JSON.stringify(formData));

        if (result.cached) {
          console.log('[LANDING] ℹ Using cached response');
          setProgressMessage('¡Viaje recuperado de caché!');
        } else {
          setProgressMessage('¡Viaje generado con éxito!');
        }

        setTimeout(() => {
          console.log('[LANDING] Triggering navigation to planner...');
          sessionStorage.setItem('navigateToPlanner', 'true');
          window.dispatchEvent(new Event('storage'));
        }, 500);
      } else {
        console.error('[LANDING] ✗✗✗ GENERATION FAILED');
        console.error('[LANDING] Result:', result);
        console.error('[LANDING] Error:', result.error);

        // MOSTRAR ERROR COMPLETO AL USUARIO
        const errorMsg = `
ERROR AL GENERAR VIAJE:
${result.error || 'Desconocido'}

DETALLES TÉCNICOS:
- Destino: ${formData.destination}
- Fechas: ${formData.startDate} a ${formData.endDate}
- Método: ${formData.searchMethod}

Por favor revisa:
1. ¿Está el servidor backend corriendo? (http://localhost:3000)
2. ¿Hay errores en la consola del navegador? (F12)
3. ¿Hay errores en la consola del servidor?
        `;

        alert(errorMsg);

        // NO NAVEGAR - mantener en la landing page
        btn.innerHTML = original;
        btn.style.opacity = '1';
        setSubmitting(false);
        return; // IMPORTANTE: no continuar
      }
    } catch (err) {
      console.error('[LANDING] ✗✗✗ CRITICAL ERROR:', err);
      alert('Ocurrió un error al generar el viaje: ' + String(err));
      btn.innerHTML = original;
      btn.style.opacity = '1';
    } finally {
      console.log('[LANDING] ========== SUBMISSION COMPLETE ==========\n');
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* LOADING OVERLAY WITH PREMIUM FOG EFFECT */}
      {submitting && (
        <div className="loading-overlay active">
          <div className="fog-background">
            <div className="fog-particle"></div>
            <div className="fog-particle"></div>
            <div className="fog-particle"></div>
            <div className="fog-particle"></div>

            <div className="images-carousel">
              <img
                src="https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=300&q=80"
                alt="París"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=300&q=80"
                alt="Montañas"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=300&q=80"
                alt="Playa tropical"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&q=80"
                alt="Océano"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1518066000714-58c45f1b773c?w=300&q=80"
                alt="Montaña nevada"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1519046904884-53103b34b206?w=300&q=80"
                alt="Desierto"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=300&q=80"
                alt="Bosque"
                className="carousel-image"
              />
              <img
                src="https://images.unsplash.com/photo-1512453475622-480c2ba46897?w=300&q=80"
                alt="Atardecer"
                className="carousel-image"
              />
            </div>
          </div>

          <div className="loading-content">
            <h2 className="loading-title">✨ TravelLux</h2>
            <p className="loading-subtitle">
              {progressMessage ||
                'Estamos buscando los mejores lugares para tu viaje de ensueño...'}
            </p>

            <div className="progress-container">
              <div className="progress-ring">
                <div className="progress-spinner"></div>
              </div>
              <div className="floating-dots">
                <div className="dot"></div>
                <div className="dot"></div>
                <div className="dot"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="hero">
        <div className="floating-element"></div>
        <div className="floating-element"></div>

        <div className="hero-content">
          <h1 className="logo" data-aos="fade-down" data-aos-duration="1000">
            TravelLux
          </h1>
          <p
            className="tagline"
            data-aos="fade-up"
            data-aos-duration="1000"
            data-aos-delay="200"
          >
            Experiencias de viaje personalizadas y exclusivas
          </p>

          <div
            className="form-container"
            data-aos="fade-up"
            data-aos-duration="1000"
            data-aos-delay="400"
          >
            <h2 className="form-title">Planifica tu viaje perfecto</h2>
            <p className="form-subtitle">
              Cuéntanos tus preferencias y crearemos un itinerario único para ti
            </p>

            <form id="travelForm" className="form-grid" onSubmit={handleSubmit}>
              {/* Destino */}
              <div className="form-group">
                <label className="form-label">¿A dónde quieres viajar?</label>
                <input
                  type="text"
                  className="form-input"
                  name="destination"
                  id="destination"
                  placeholder="Ej: París, Francia"
                  required
                />
              </div>

              {/* Fechas */}
              <div className="form-group">
                <label className="form-label">Fechas del viaje</label>
                <div className="date-grid">
                  <input
                    type="text"
                    className="form-input"
                    name="startDate"
                    id="startDate"
                    ref={startDateRef}
                    placeholder="Fecha de inicio"
                    required
                  />
                  <input
                    type="text"
                    className="form-input"
                    name="endDate"
                    id="endDate"
                    ref={endDateRef}
                    placeholder="Fecha de fin"
                    required
                  />
                </div>
              </div>

              {/* Presupuesto */}
              <div className="form-group">
                <label className="form-label">Presupuesto del viaje</label>
                <div className="select-group">
                  <div className="select-option">
                    <input
                      type="radio"
                      name="budget"
                      id="budget-low"
                      value="low"
                      required
                    />
                    <label htmlFor="budget-low" className="select-label">
                      <div className="select-icon">💰</div>
                      <div className="select-text">Económico</div>
                      <div className="select-description">Hasta €500/día</div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="budget"
                      id="budget-medium"
                      value="medium"
                    />
                    <label htmlFor="budget-medium" className="select-label">
                      <div className="select-icon">💳</div>
                      <div className="select-text">Medio</div>
                      <div className="select-description">€500-1000/día</div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="budget"
                      id="budget-high"
                      value="high"
                    />
                    <label htmlFor="budget-high" className="select-label">
                      <div className="select-icon">💎</div>
                      <div className="select-text">Alto</div>
                      <div className="select-description">€1000-2000/día</div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="budget"
                      id="budget-luxury"
                      value="luxury"
                    />
                    <label htmlFor="budget-luxury" className="select-label">
                      <div className="select-icon">👑</div>
                      <div className="select-text">Lujo</div>
                      <div className="select-description">+€2000/día</div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Intensidad */}
              <div className="form-group">
                <label className="form-label">Ritmo del viaje</label>
                <div className="select-group">
                  <div className="select-option">
                    <input
                      type="radio"
                      name="intensity"
                      id="intensity-wellness"
                      value="wellness"
                      required
                    />
                    <label
                      htmlFor="intensity-wellness"
                      className="select-label"
                    >
                      <div className="select-icon">🧘</div>
                      <div className="select-text">Wellness</div>
                      <div className="select-description">Spa y relax</div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="intensity"
                      id="intensity-relaxed"
                      value="relaxed"
                    />
                    <label htmlFor="intensity-relaxed" className="select-label">
                      <div className="select-icon">☕</div>
                      <div className="select-text">Relajado</div>
                      <div className="select-description">Cafés y paseos</div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="intensity"
                      id="intensity-balanced"
                      value="balanced"
                    />
                    <label
                      htmlFor="intensity-balanced"
                      className="select-label"
                    >
                      <div className="select-icon">🎯</div>
                      <div className="select-text">Equilibrado</div>
                      <div className="select-description">Mix perfecto</div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="intensity"
                      id="intensity-active"
                      value="active"
                    />
                    <label htmlFor="intensity-active" className="select-label">
                      <div className="select-icon">🚶</div>
                      <div className="select-text">Activo</div>
                      <div className="select-description">Muchas visitas</div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Método de búsqueda de POIs */}
              <div className="form-group">
                <label className="form-label">
                  Método de búsqueda de lugares
                  <span className="form-label-subtitle">
                    Elige cómo quieres explorar la ciudad
                  </span>
                </label>
                <div className="select-group">
                  <div className="select-option">
                    <input
                      type="radio"
                      name="searchMethod"
                      id="search-original"
                      value="original"
                      defaultChecked
                    />
                    <label htmlFor="search-original" className="select-label">
                      <div className="select-icon">🏛️</div>
                      <div className="select-text">Clásico</div>
                      <div className="select-description">
                        Monumentos principales
                      </div>
                    </label>
                  </div>
                  <div className="select-option">
                    <input
                      type="radio"
                      name="searchMethod"
                      id="search-expanded"
                      value="expanded"
                    />
                    <label htmlFor="search-expanded" className="select-label">
                      <div className="select-icon">🌟</div>
                      <div className="select-text">Expandido</div>
                      <div className="select-description">
                        +450% lugares (parques, plazas, barrios)
                      </div>
                    </label>
                  </div>
                </div>
                <div
                  className="search-method-info"
                  style={{
                    fontSize: '0.85rem',
                    color: '#666',
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background:
                      'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                    borderRadius: '8px',
                    lineHeight: '1.5',
                  }}
                >
                  <strong>💡 Expandido:</strong> Incluye calles emblemáticas,
                  plazas históricas, parques, miradores, mercados y barrios
                  turísticos. Ideal para descubrir la ciudad a fondo.
                </div>
              </div>

              <button
                type="submit"
                className="submit-btn"
                disabled={submitting}
              >
                {submitting
                  ? '✨ Generando tu viaje...'
                  : '✨ Planear mi viaje'}
              </button>
            </form>

            <div className="features">
              <div className="feature" data-aos="fade-up" data-aos-delay="600">
                <div className="feature-icon">🎨</div>
                <div className="feature-title">Personalizado</div>
                <div className="feature-text">
                  Itinerarios únicos adaptados a ti
                </div>
              </div>
              <div className="feature" data-aos="fade-up" data-aos-delay="700">
                <div className="feature-icon">⚡</div>
                <div className="feature-title">Instantáneo</div>
                <div className="feature-text">Resultados en segundos</div>
              </div>
              <div className="feature" data-aos="fade-up" data-aos-delay="800">
                <div className="feature-icon">🗺️</div>
                <div className="feature-title">Completo</div>
                <div className="feature-text">Vuelos, hoteles e itinerario</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;

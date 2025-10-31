import React, { useEffect, useRef } from 'react';
import AOS from 'aos';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'aos/dist/aos.css';
import 'flatpickr/dist/flatpickr.min.css';
import 'flatpickr/dist/themes/material_blue.css';
import './LandingPage.css';

function LandingPage() {
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const startDatePickerRef = useRef(null);
  const endDatePickerRef = useRef(null);

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

  const handleSubmit = (e) => {
    e.preventDefault();

    // Get form values
    const formData = {
      destination: e.target.destination.value,
      startDate: e.target.startDate.value,
      endDate: e.target.endDate.value,
      budget: e.target.budget.value,
      intensity: e.target.intensity.value,
    };

    // Store in sessionStorage for use in results page
    sessionStorage.setItem('travelPreferences', JSON.stringify(formData));

    // Add loading animation to button
    const btn = e.target.querySelector('.submit-btn');
    btn.innerHTML = '✨ Creando tu viaje perfecto...';
    btn.style.opacity = '0.8';

    // Trigger navigation to planner after short delay
    setTimeout(() => {
      sessionStorage.setItem('navigateToPlanner', 'true');
      window.dispatchEvent(new Event('storage'));
    }, 1500);
  };

  return (
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
                  <label htmlFor="intensity-wellness" className="select-label">
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
                  <label htmlFor="intensity-balanced" className="select-label">
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

            <button type="submit" className="submit-btn">
              ✨ Planear mi viaje
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
  );
}

export default LandingPage;

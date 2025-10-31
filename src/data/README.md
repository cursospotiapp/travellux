# Estructura de Datos JSON - Travel Planner

## 📁 Organización de Archivos

```
src/data/
├── hotels.json              # Base de datos de hoteles por presupuesto
├── itineraries.json         # Plantillas de itinerarios por destino e intensidad
├── example-trip-paris.json  # Ejemplo completo de datos de viaje
└── README.md               # Esta documentación
```

## 🏗️ Arquitectura de Datos

### 1. **hotels.json** - Base de Datos de Hoteles

Estructura organizada por niveles de presupuesto (budget tiers):

```json
{
  "budget": {
    "low": [], // Presupuesto bajo (€50-100/noche)
    "medium": [], // Presupuesto medio (€150-200/noche)
    "high": [], // Presupuesto alto (€250-350/noche)
    "luxury": [] // Lujo (€800+/noche)
  }
}
```

**Esquema de Hotel:**

```typescript
{
  id: string,                    // Identificador único
  name: string,                  // Nombre del hotel
  stars: number,                 // Clasificación (1-5)
  location: {
    area: string,                // Barrio/zona
    description: string,         // Descripción breve
    coordinates: {
      lat: number,
      lng: number
    }
  },
  image: string,                 // URL de imagen (Unsplash)
  amenities: string[],           // Lista de servicios
  price: {
    amount: number,
    currency: string,            // "EUR"
    period: string               // "noche"
  },
  bookingUrl: string            // Link a Booking.com
}
```

### 2. **itineraries.json** - Plantillas de Itinerarios

Estructura anidada: `destinations → city → intensity → days → events`

```json
{
  "destinations": {
    "paris": {
      // Ciudad destino
      "balanced": {}, // Intensidad: equilibrado
      "relaxed": {}, // Intensidad: relajado
      "active": {}, // Intensidad: activo
      "wellness": {} // Intensidad: wellness
    }
  }
}
```

**Esquema de Día:**

```typescript
{
  dayNumber: number,
  date: string,                 // "DD/MM/YYYY"
  title: string,
  theme: string,
  events: Event[]
}
```

**Esquema de Evento:**

```typescript
{
  id: string,
  time: string,                 // "HH:MM - HH:MM"
  duration: string,             // "Xh XXmin"
  title: string,
  description: string,
  type: string,                 // "attraction" | "restaurant" | "museum" | etc
  location: {
    name: string,
    address: string,
    coordinates: {
      lat: number,
      lng: number
    }
  },
  images: string[],             // Array de URLs (mínimo 3 para carrusel)
  price: {
    amount: number,
    currency: string,
    description: string
  },
  tip: {
    title: string,
    content: string
  },
  nextTransport: {              // null si es último evento del día
    type: string,               // "walking" | "metro" | "train" | "taxi"
    duration: string,
    description: string
  } | null
}
```

### 3. **example-trip-paris.json** - Datos Completos de Viaje

Archivo que simula la respuesta completa después de que el usuario rellena el formulario.

```typescript
{
  tripId: string,               // Identificador único del viaje
  userPreferences: {
    destination: string,        // "París, Francia"
    startDate: string,          // "DD/MM/YYYY"
    endDate: string,            // "DD/MM/YYYY"
    budget: string,             // "low" | "medium" | "high" | "luxury"
    intensity: string           // "wellness" | "relaxed" | "balanced" | "active"
  },
  tripSummary: {
    destination: string,
    country: string,
    duration: number,           // Días totales
    totalDays: number,
    departureCity: string,
    subtitle: string
  },
  hotels: Hotel[],              // 3 opciones de hoteles
  itinerary: {
    day1: Day,
    day2: Day,
    day3: Day
  }
}
```

## 🔄 Flujo de Datos

### Paso 1: Usuario rellena formulario en Landing Page

```javascript
// landing_trip.html
const formData = {
  destination: 'París, Francia',
  startDate: '15/12/2025',
  endDate: '18/12/2025',
  budget: 'medium',
  intensity: 'balanced',
};
sessionStorage.setItem('travelPreferences', JSON.stringify(formData));
```

### Paso 2: Generación de Datos de Viaje

```javascript
// Lógica futura en React
function generateTrip(preferences) {
  const { budget, intensity, destination } = preferences;

  // 1. Seleccionar hoteles según presupuesto
  const hotels = selectHotels(budget);

  // 2. Seleccionar itinerario según destino e intensidad
  const itinerary = selectItinerary(destination, intensity);

  // 3. Combinar y devolver
  return {
    tripId: generateTripId(),
    userPreferences: preferences,
    tripSummary: generateSummary(preferences),
    hotels: hotels,
    itinerary: itinerary,
  };
}
```

### Paso 3: Renderizado en index_trip_planner.html

```javascript
// La página recibe los datos y los renderiza
const tripData = getTripData(); // desde sessionStorage o API

// Renderizar hoteles
tripData.hotels.forEach((hotel) => renderHotel(hotel));

// Renderizar itinerario día por día
Object.values(tripData.itinerary).forEach((day) => renderDay(day));
```

## 📊 Mapeo de Presupuestos

| Budget Level | Rango €/noche | Estrellas | Servicios  |
| ------------ | ------------- | --------- | ---------- |
| `low`        | 50-100        | 3★        | Básicos    |
| `medium`     | 150-200       | 4★        | Completos  |
| `high`       | 250-350       | 5★        | Premium    |
| `luxury`     | 800+          | 5★        | Ultra lujo |

## 🎯 Mapeo de Intensidades

| Intensity  | Descripción    | Eventos/día | Ritmo     |
| ---------- | -------------- | ----------- | --------- |
| `wellness` | Spa y relax    | 2-3         | Muy lento |
| `relaxed`  | Cafés y paseos | 3-4         | Lento     |
| `balanced` | Mix perfecto   | 4-5         | Moderado  |
| `active`   | Muchas visitas | 5-6         | Intenso   |

## 🖼️ Imágenes

Todas las imágenes usan **Unsplash** con parámetros específicos:

- Formato: `https://images.unsplash.com/photo-{id}?w={width}&h={height}&fit=crop`
- Hoteles: `400x220`
- Eventos (carrusel): `800x600`

## 🗺️ Coordenadas de Mapa

Todas las ubicaciones incluyen coordenadas GPS precisas para:

- Integración con Leaflet.js
- Cálculo de rutas
- Visualización en mapa interactivo

## ✨ Características Especiales

### Carrusel de Imágenes

Cada evento tiene mínimo **3 imágenes** para el carrusel Swiper.

### Tips/Consejos

Cada evento incluye un **tip** con:

- `title`: Título del consejo
- `content`: Texto detallado con recomendaciones

### Transporte

Sistema de `nextTransport` para conectar eventos:

- Indica tipo de transporte
- Tiempo estimado
- `null` en el último evento del día

## 🚀 Uso en Componentes React

### Ejemplo: Cargar datos de hotel

```javascript
import hotelsData from '@/data/hotels.json';

function selectHotels(budget) {
  return hotelsData.budget[budget].slice(0, 3);
}
```

### Ejemplo: Cargar itinerario

```javascript
import itinerariesData from '@/data/itineraries.json';

function selectItinerary(destination, intensity) {
  return itinerariesData.destinations[destination][intensity];
}
```

## 📝 Notas de Implementación

1. **Extensibilidad**: Fácil agregar nuevos destinos, solo añadir nueva key en `destinations`
2. **Escalabilidad**: Estructura permite múltiples ciudades e intensidades
3. **Tipo seguro**: Puede convertirse fácilmente a TypeScript interfaces
4. **Imágenes reales**: Todas las URLs son válidas (Unsplash)
5. **Coordenadas reales**: Todas las coordenadas GPS son correctas
6. **Precios realistas**: Basados en precios reales de París 2025

## 🔮 Futuras Expansiones

- Añadir más destinos: Roma, Londres, Barcelona, etc.
- Vuelos (integración API)
- Restaurantes específicos por presupuesto
- Actividades opcionales
- Paquetes temáticos (romántico, familiar, aventura)

# 📚 Índice Completo de Archivos - Travel Planner Data

## 📂 Estructura Completa

```
src/
├── 📁 data/                           # Datos JSON del sistema
│   ├── 📄 hotels.json                 # Base de datos de hoteles (8 hoteles)
│   ├── 📄 itineraries.json            # Plantillas de itinerarios (2 completos)
│   ├── 📄 example-trip-paris.json     # Ejemplo listo para usar
│   ├── 📖 README.md                   # Documentación detallada
│   └── 📋 STRUCTURE-SUMMARY.md        # Este resumen ejecutivo
│
├── 📁 utils/                          # Funciones auxiliares
│   └── 📄 dataHelpers.js              # 9 funciones para procesar datos
│
├── 📁 types/                          # TypeScript definitions
│   └── 📄 index.ts                    # Interfaces y tipos completos
│
└── 📁 examples/                       # Ejemplos de implementación
    └── 📄 usage-examples.jsx          # 6 ejemplos de uso en React
```

## 📄 Descripción de Archivos

### 1. `hotels.json` (208 líneas)

**Propósito**: Base de datos completa de hoteles organizados por presupuesto

**Contiene**:

- 8 hoteles únicos
- 4 niveles de presupuesto (low, medium, high, luxury)
- 2 hoteles por nivel
- Rango: €89 - €950 por noche

**Campos por hotel**:

- ✅ ID único
- ✅ Nombre y estrellas
- ✅ Ubicación con coordenadas GPS
- ✅ Imagen de Unsplash
- ✅ Lista de amenidades
- ✅ Precio detallado
- ✅ URL de reserva

**Ejemplo de uso**:

```javascript
import hotelsData from './hotels.json';
const mediumHotels = hotelsData.budget.medium; // [2 hoteles]
```

---

### 2. `itineraries.json` (276 líneas)

**Propósito**: Plantillas de itinerarios por destino e intensidad

**Contiene**:

- 1 destino completo (París)
- 2 niveles de intensidad (balanced, relaxed)
- 3 días completos en "balanced"
- 1 día ejemplo en "relaxed"
- 13 eventos totales con todos los detalles

**Estructura**:

```
destinations
  └── paris
       ├── balanced (COMPLETO)
       │    ├── day1: 4 eventos
       │    ├── day2: 4 eventos
       │    └── day3: 3 eventos
       └── relaxed (EJEMPLO)
            └── day1: 1 evento
```

**Ejemplo de uso**:

```javascript
import itineraries from './itineraries.json';
const parisBalanced = itineraries.destinations.paris.balanced;
```

---

### 3. `example-trip-paris.json` (450 líneas)

**Propósito**: Ejemplo completo y funcional de un viaje generado

**Contiene**:

- ID de viaje único
- Preferencias del usuario (fechas, presupuesto, intensidad)
- Resumen del viaje (destino, duración, subtítulo)
- 3 hoteles del nivel "medium"
- Itinerario completo de 3 días (12 eventos)
- Datos listos para renderizar

**Uso ideal**:

- Testing y desarrollo
- Preview sin formulario
- Fallback si no hay datos del usuario

**Ejemplo de uso**:

```javascript
import exampleTrip from './example-trip-paris.json';
// Usar directamente en componentes
<TripPlanner tripData={exampleTrip} />;
```

---

### 4. `dataHelpers.js` (280 líneas)

**Propósito**: Funciones para procesar y generar datos de viajes

**9 Funciones principales**:

| Función                 | Líneas  | Propósito                                     |
| ----------------------- | ------- | --------------------------------------------- |
| `generateTripId()`      | 7-11    | Genera ID único para viaje                    |
| `selectHotels()`        | 18-26   | Filtra hoteles por presupuesto                |
| `selectItinerary()`     | 33-45   | Filtra itinerario por destino/intensidad      |
| `calculateDuration()`   | 52-63   | Calcula días entre fechas                     |
| `generateTripSummary()` | 70-84   | Crea resumen del viaje                        |
| `addDatesToItinerary()` | 91-113  | Añade fechas reales a días                    |
| `generateTrip()`        | 120-145 | **FUNCIÓN PRINCIPAL** - Genera viaje completo |
| `getDayCoordinates()`   | 152-159 | Extrae coordenadas para mapa                  |
| `calculateTotalCost()`  | 181-213 | Calcula presupuesto estimado                  |
| `validatePreferences()` | 220-254 | Valida datos del formulario                   |

**Función estrella - generateTrip()**:

```javascript
const trip = generateTrip({
  destination: 'París, Francia',
  startDate: '15/12/2025',
  endDate: '18/12/2025',
  budget: 'medium',
  intensity: 'balanced',
});
// Retorna TripData completo listo para usar
```

---

### 5. `README.md` (320 líneas)

**Propósito**: Documentación completa del sistema de datos

**Secciones**:

1. 📁 Organización de archivos
2. 🏗️ Arquitectura de datos
3. 📊 Esquemas detallados (Hotel, Day, Event)
4. 🔄 Flujo de datos
5. 📊 Mapeo de presupuestos e intensidades
6. 🖼️ Configuración de imágenes
7. 🗺️ Sistema de coordenadas
8. ✨ Características especiales
9. 🚀 Guía de uso en React
10. 🔮 Expansiones futuras

**Ideal para**:

- Onboarding de nuevos desarrolladores
- Referencia rápida de esquemas
- Guía de implementación

---

### 6. `STRUCTURE-SUMMARY.md` (200 líneas)

**Propósito**: Resumen ejecutivo visual y rápido

**Contiene**:

- ✅ Checklist de archivos creados
- 🎯 Decisiones de diseño explicadas
- 🔄 Diagrama de flujo visual
- 📊 Estadísticas de datos
- 🛠️ Tabla de funciones disponibles
- 🚀 Próximos pasos sugeridos
- 📝 Notas finales

**Ideal para**:

- Vista rápida del proyecto
- Presentaciones
- Decisiones arquitectónicas

---

### 7. `index.ts` (220 líneas)

**Propósito**: Definiciones TypeScript completas

**Contiene**:

- 30+ interfaces TypeScript
- Type aliases (BudgetLevel, IntensityLevel, etc.)
- Props de componentes
- Type guards
- Ejemplo de uso comentado

**Interfaces principales**:

```typescript
Hotel,
  Event,
  Day,
  Itinerary,
  UserPreferences,
  TripData,
  TripSummary,
  CostBreakdown,
  MapCoordinate;
```

**Ideal para**:

- Proyectos TypeScript
- Autocompletado en IDE
- Validación de tipos
- Documentación de código

---

### 8. `usage-examples.jsx` (320 líneas)

**Propósito**: Ejemplos prácticos de implementación en React

**6 Ejemplos completos**:

1. **handleFormSubmit** - Procesar formulario y generar viaje
2. **HotelsSection** - Componente de lista de hoteles
3. **EventCard** - Tarjeta de evento con carrusel Swiper
4. **DayItinerary** - Día completo con eventos
5. **TripPlannerPage** - Página completa funcional
6. **MapModal** - Modal de mapa con Leaflet

**Ideal para**:

- Copiar y pegar código
- Entender integración
- Acelerar desarrollo

---

## 🎯 Guía de Uso Rápido

### Para empezar desde cero:

1. Lee `STRUCTURE-SUMMARY.md` (5 min)
2. Revisa `README.md` sección "Flujo de Datos" (10 min)
3. Copia ejemplos de `usage-examples.jsx` (15 min)

### Para implementar hoteles:

1. Importa `dataHelpers.js`
2. Usa `selectHotels(budget, 3)`
3. Renderiza con ejemplo de `HotelsSection`

### Para implementar itinerario:

1. Importa `dataHelpers.js`
2. Usa `generateTrip(preferences)`
3. Renderiza con ejemplo de `DayItinerary`

### Para TypeScript:

1. Importa types: `import type { TripData } from '@/types'`
2. Tipea componentes: `const MyComp: React.FC<Props> = ...`
3. Usa type guards para validación

---

## 📊 Métricas de Código

| Archivo                 | Líneas    | Tamaño      | Tipo     |
| ----------------------- | --------- | ----------- | -------- |
| hotels.json             | 208       | ~12 KB      | Data     |
| itineraries.json        | 276       | ~18 KB      | Data     |
| example-trip-paris.json | 450       | ~28 KB      | Data     |
| dataHelpers.js          | 280       | ~9 KB       | Code     |
| index.ts                | 220       | ~7 KB       | Types    |
| usage-examples.jsx      | 320       | ~11 KB      | Examples |
| README.md               | 320       | ~25 KB      | Docs     |
| STRUCTURE-SUMMARY.md    | 200       | ~15 KB      | Docs     |
| **TOTAL**               | **2,274** | **~125 KB** | -        |

---

## 🔍 Búsqueda Rápida

**"¿Cómo hago X?"**

| Necesito...            | Ver archivo...     | Línea/Sección   |
| ---------------------- | ------------------ | --------------- |
| Esquema de hotel       | README.md          | Línea 40-60     |
| Esquema de evento      | README.md          | Línea 120-160   |
| Generar viaje completo | dataHelpers.js     | Línea 120-145   |
| Renderizar hoteles     | usage-examples.jsx | Línea 30-80     |
| Implementar carrusel   | usage-examples.jsx | Línea 100-150   |
| Mostrar mapa           | usage-examples.jsx | Línea 250-320   |
| TypeScript types       | index.ts           | Todo el archivo |
| Validar formulario     | dataHelpers.js     | Línea 220-254   |
| Calcular presupuesto   | dataHelpers.js     | Línea 181-213   |

---

## ✅ Checklist de Implementación

### Backend/Data

- [x] Estructura de datos diseñada
- [x] Hotels.json creado (8 hoteles)
- [x] Itineraries.json creado (2 completos)
- [x] Example-trip creado
- [x] Funciones helpers implementadas
- [x] Validaciones añadidas

### Frontend (Pendiente)

- [ ] Conectar landing con trip planner
- [ ] Implementar HotelsSection
- [ ] Implementar EventCard con Swiper
- [ ] Implementar DayItinerary
- [ ] Implementar MapModal con Leaflet
- [ ] Añadir animaciones AOS
- [ ] Responsive design

### Testing (Pendiente)

- [ ] Test de funciones helpers
- [ ] Validación de JSON schemas
- [ ] Test de componentes React
- [ ] Test de integración

---

## 🎓 Conceptos Clave

### 1. Separación de Concerns

- **Data layer**: JSON files (hoteles, itinerarios)
- **Business logic**: dataHelpers.js (procesamiento)
- **Presentation**: Components React (UI)
- **Types**: TypeScript definitions (contratos)

### 2. Data Flow

```
User Input → Validation → Data Selection → Processing → Rendering
```

### 3. Escalabilidad

- Fácil añadir ciudades (nuevo key en destinations)
- Fácil añadir intensidades (nuevo key en ciudad)
- Fácil añadir hoteles (push al array de budget)

---

**Última actualización**: 31 de Octubre, 2025
**Estado**: ✅ Completo y listo para desarrollo
**Versión**: 1.0.0

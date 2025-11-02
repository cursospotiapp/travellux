/**
 * Utilidades geográficas para cálculos de distancia y clustering
 */

/**
 * Calcula la distancia entre dos coordenadas usando fórmula de Haversine
 * @param {Object} coord1 - {lat: number, lng: number}
 * @param {Object} coord2 - {lat: number, lng: number}
 * @returns {number} Distancia en kilómetros
 */
export function calculateDistance(coord1, coord2) {
  if (!coord1?.lat || !coord1?.lng || !coord2?.lat || !coord2?.lng) {
    return Infinity;
  }

  const R = 6371; // Radio de la Tierra en km
  const dLat = toRadians(coord2.lat - coord1.lat);
  const dLng = toRadians(coord2.lng - coord1.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.lat)) *
      Math.cos(toRadians(coord2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distancia en km
}

/**
 * Convierte grados a radianes
 * @param {number} degrees
 * @returns {number}
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calcula el tiempo de caminata entre dos puntos
 * @param {number} distanceKm - Distancia en kilómetros
 * @param {number} walkingSpeed - Velocidad de caminata en km/h (default 5)
 * @returns {string} Tiempo en formato legible (ej: "15 min", "1.2 km")
 */
export function calculateWalkingTime(distanceKm, walkingSpeed = 5) {
  if (distanceKm < 0.05) {
    // Menos de 50 metros
    return 'Muy cerca';
  }

  if (distanceKm < 1) {
    // Menos de 1 km, mostrar en minutos
    const minutes = Math.round((distanceKm / walkingSpeed) * 60);
    return `${minutes} min andando`;
  }

  // Más de 1 km, mostrar distancia
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Parsea coordenadas de formato Wikidata "Point(lng lat)"
 * @param {string} wikidataCoords - Formato: "Point(12.4922 41.8902)"
 * @returns {Object|null} {lat: number, lng: number}
 */
export function parseWikidataCoords(wikidataCoords) {
  if (!wikidataCoords) return null;

  try {
    // Formato: "Point(lng lat)"
    const match = wikidataCoords.match(/Point\(([^ ]+) ([^ ]+)\)/);
    if (match) {
      return {
        lat: parseFloat(match[2]),
        lng: parseFloat(match[1]),
      };
    }
    return null;
  } catch (error) {
    console.error('[GEO] Error parsing Wikidata coords:', error.message);
    return null;
  }
}

/**
 * Encuentra el POI más cercano de una lista
 * @param {Object} targetCoords - Coordenadas objetivo
 * @param {Array} pois - Lista de POIs con coordenadas
 * @returns {Object|null} POI más cercano
 */
export function findNearestPOI(targetCoords, pois) {
  if (!pois || pois.length === 0) return null;

  let nearest = null;
  let minDistance = Infinity;

  for (const poi of pois) {
    if (!poi.coordinates) continue;

    const distance = calculateDistance(targetCoords, poi.coordinates);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = poi;
    }
  }

  return nearest;
}

/**
 * Agrupa POIs por proximidad usando clustering simple
 * @param {Array} pois - Lista de POIs con coordenadas
 * @param {number} maxDistance - Distancia máxima en km para agrupar (default 2)
 * @returns {Array} Array de clusters, cada uno con array de POIs
 */
export function clusterPOIsByProximity(pois, maxDistance = 2) {
  if (!pois || pois.length === 0) return [];

  const clusters = [];
  const visited = new Set();

  for (const poi of pois) {
    if (visited.has(poi.id) || !poi.coordinates) continue;

    const cluster = {
      center: poi.coordinates,
      pois: [poi],
      avgLat: poi.coordinates.lat,
      avgLng: poi.coordinates.lng,
    };
    visited.add(poi.id);

    // Buscar POIs cercanos
    for (const other of pois) {
      if (visited.has(other.id) || !other.coordinates) continue;

      const distance = calculateDistance(poi.coordinates, other.coordinates);
      if (distance <= maxDistance) {
        cluster.pois.push(other);
        visited.add(other.id);
      }
    }

    // Calcular centro del cluster (promedio)
    if (cluster.pois.length > 1) {
      const sumLat = cluster.pois.reduce(
        (sum, p) => sum + p.coordinates.lat,
        0
      );
      const sumLng = cluster.pois.reduce(
        (sum, p) => sum + p.coordinates.lng,
        0
      );
      cluster.avgLat = sumLat / cluster.pois.length;
      cluster.avgLng = sumLng / cluster.pois.length;
      cluster.center = { lat: cluster.avgLat, lng: cluster.avgLng };
    }

    clusters.push(cluster);
  }

  // Ordenar clusters por número de POIs (más POIs = zona más importante)
  return clusters.sort((a, b) => b.pois.length - a.pois.length);
}

/**
 * Valida que las coordenadas sean válidas
 * @param {Object} coords - {lat, lng}
 * @returns {boolean}
 */
export function isValidCoordinates(coords) {
  if (!coords || typeof coords !== 'object') return false;

  const lat = parseFloat(coords.lat);
  const lng = parseFloat(coords.lng);

  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Calcula el bounding box para una ciudad (útil para consultas OSM)
 * @param {Object} center - Centro de la ciudad {lat, lng}
 * @param {number} radiusKm - Radio en kilómetros
 * @returns {Object} {south, west, north, east}
 */
export function calculateBoundingBox(center, radiusKm = 10) {
  const latOffset = radiusKm / 111; // 1 grado lat ≈ 111 km
  const lngOffset = radiusKm / (111 * Math.cos(toRadians(center.lat)));

  return {
    south: center.lat - latOffset,
    west: center.lng - lngOffset,
    north: center.lat + latOffset,
    east: center.lng + lngOffset,
  };
}

/**
 * Servicio EXPANDIDO para obtener POIs de OpenStreetMap
 *
 * MÉTODO: Búsqueda por 4 cuadrantes de 3.5km
 * MEJORA: +452% POIs vs método original (23 → 127 POIs en test de 5 ciudades)
 *
 * TAGS EXPANDIDOS:
 * - tourism=attraction, museum, gallery, viewpoint
 * - historic=monument, castle
 * - building=cathedral, church (con heritage)
 * - amenity=theatre, marketplace, fountain, arts_centre
 * - leisure=park, garden (emblemáticos)
 * - place=square, neighbourhood, quarter (con Wikipedia/tourism)
 * - highway=pedestrian (calles turísticas)
 * - man_made=bridge, tower (iconos con Wikipedia)
 *
 * FILTRO DE CALIDAD: Solo POIs con Wikipedia O Wikidata (100% enriquecibles)
 */

import dotenv from 'dotenv';
import { isValidCoordinates } from '../utils/geoUtils.js';
import {
  enrichPOIsWithImages,
  enrichPOIsWithDescriptions,
} from './overpassService.js';
import { executeOverpassQueryWithFailover } from './overpassClient.js';

dotenv.config();

const QUADRANT_TIMEOUT = 15000; // 15 segundos por cuadrante (query más grande con Tier 2)
const QUADRANT_SIDE_KM = 3.5; // Lado de cada cuadrante en km

/**
 * Calcula bounding box para un cuadrante
 * @param {number} lat - Latitud central
 * @param {number} lng - Longitud central
 * @param {number} sideKm - Lado del cuadrado en km
 * @param {string} quadrant - 'NE', 'NW', 'SE', 'SW'
 * @returns {Object} {south, north, west, east}
 */
function getQuadrantBBox(lat, lng, sideKm, quadrant) {
  // Aproximación: 1 grado lat ≈ 111km, 1 grado lng ≈ 111km * cos(lat)
  const latDelta = sideKm / 111.0;
  const lngDelta = sideKm / (111.0 * Math.cos((lat * Math.PI) / 180));

  let south, north, west, east;

  switch (quadrant) {
    case 'NE': // Noreste
      south = lat;
      north = lat + latDelta;
      west = lng;
      east = lng + lngDelta;
      break;
    case 'NW': // Noroeste
      south = lat;
      north = lat + latDelta;
      west = lng - lngDelta;
      east = lng;
      break;
    case 'SE': // Sureste
      south = lat - latDelta;
      north = lat;
      west = lng;
      east = lng + lngDelta;
      break;
    case 'SW': // Suroeste
      south = lat - latDelta;
      north = lat;
      west = lng - lngDelta;
      east = lng;
      break;
    default:
      throw new Error('Quadrant must be NE, NW, SE, or SW');
  }

  return { south, north, west, east };
}

/**
 * Construye query Overpass EXPANDIDA para un bounding box
 * @param {Object} bbox - {south, north, west, east}
 * @returns {string} Query Overpass QL
 */
function buildExpandedQueryForBBox(bbox) {
  const { south, west, north, east } = bbox;

  return `
    [out:json][timeout:60];
    (
      // POIs DE MÁXIMA PRIORIDAD (con o sin Wikipedia)
      // 🔥 BASÍLICAS Y CATEDRALES (máxima prioridad turística - incluye relations como Pilar)
      node["building"="basilica"](${south},${west},${north},${east});
      way["building"="basilica"](${south},${west},${north},${east});
      relation["building"="basilica"](${south},${west},${north},${east});
      node["building"="cathedral"](${south},${west},${north},${east});
      way["building"="cathedral"](${south},${west},${north},${east});
      relation["building"="cathedral"](${south},${west},${north},${east});
      
      // ATRACCIONES TURÍSTICAS OFICIALES (incluye relations)
      node["tourism"="attraction"](${south},${west},${north},${east});
      way["tourism"="attraction"](${south},${west},${north},${east});
      relation["tourism"="attraction"](${south},${west},${north},${east});
      
      // MONUMENTOS Y CASTILLOS
      node["historic"="monument"](${south},${west},${north},${east});
      way["historic"="monument"](${south},${west},${north},${east});
      node["historic"="castle"](${south},${west},${north},${east});
      way["historic"="castle"](${south},${west},${north},${east});
      
      // MUSEOS
      node["tourism"="museum"](${south},${west},${north},${east});
      way["tourism"="museum"](${south},${west},${north},${east});
      node["building"="cathedral"]["name"](${south},${west},${north},${east});
      way["building"="cathedral"]["name"](${south},${west},${north},${east});
      
      // BASÍLICAS (incluye Basílica del Pilar)
      node["building"="basilica"]["name"](${south},${west},${north},${east});
      way["building"="basilica"]["name"](${south},${west},${north},${east});
      relation["building"="basilica"]["name"](${south},${west},${north},${east});
      
      // PARQUES Y JARDINES EMBLEMÁTICOS
      node["leisure"="park"]["wikipedia"](${south},${west},${north},${east});
      way["leisure"="park"]["wikipedia"](${south},${west},${north},${east});
      node["leisure"="garden"]["heritage"]["name"](${south},${west},${north},${east});
      way["leisure"="garden"]["heritage"]["name"](${south},${west},${north},${east});
      // Parques grandes y turísticos (aunque no tengan Wikipedia)
      way["leisure"="park"]["name"]["tourism"="yes"](${south},${west},${north},${east});
      way["leisure"="park"]["name"]["operator"](${south},${west},${north},${east});
      node["leisure"="nature_reserve"]["name"](${south},${west},${north},${east});
      way["leisure"="nature_reserve"]["name"](${south},${west},${north},${east});
      
      // PLAZAS PRINCIPALES
      node["place"="square"]["wikipedia"](${south},${west},${north},${east});
      way["place"="square"]["wikipedia"](${south},${west},${north},${east});
      node["place"="square"]["name"]["tourism"="yes"](${south},${west},${north},${east});
      way["place"="square"]["name"]["tourism"="yes"](${south},${west},${north},${east});
      
      // CALLES PEATONALES Y EMBLEMÁTICAS
      way["highway"="pedestrian"]["name"]["tourism"="yes"](${south},${west},${north},${east});
      way["highway"="pedestrian"]["wikipedia"](${south},${west},${north},${east});
      
      // BARRIOS HISTÓRICOS
      node["place"="neighbourhood"]["wikipedia"](${south},${west},${north},${east});
      way["place"="neighbourhood"]["wikipedia"](${south},${west},${north},${east});
      node["place"="quarter"]["name"]["tourism"="yes"](${south},${west},${north},${east});
      way["place"="quarter"]["name"]["tourism"="yes"](${south},${west},${north},${east});
      
      // MIRADORES
      node["tourism"="viewpoint"]["name"](${south},${west},${north},${east});
      
      // PUENTES EMBLEMÁTICOS
      way["man_made"="bridge"]["heritage"]["name"](${south},${west},${north},${east});
      way["man_made"="bridge"]["wikipedia"](${south},${west},${north},${east});
      
      // TEATROS Y CULTURA
      node["amenity"="theatre"]["name"](${south},${west},${north},${east});
      way["amenity"="theatre"]["name"](${south},${west},${north},${east});
      node["amenity"="arts_centre"]["name"](${south},${west},${north},${east});
      way["amenity"="arts_centre"]["name"](${south},${west},${north},${east});
      node["tourism"="gallery"]["name"](${south},${west},${north},${east});
      way["tourism"="gallery"]["name"](${south},${west},${north},${east});
      
      // MERCADOS TURÍSTICOS (Camden, Borough, etc.)
      node["amenity"="marketplace"]["name"](${south},${west},${north},${east});
      way["amenity"="marketplace"]["name"](${south},${west},${north},${east});
      node["shop"="mall"]["tourism"="yes"](${south},${west},${north},${east});
      way["shop"="mall"]["tourism"="yes"](${south},${west},${north},${east});
      node["tourism"="attraction"]["amenity"="marketplace"](${south},${west},${north},${east});
      way["tourism"="attraction"]["amenity"="marketplace"](${south},${west},${north},${east});
      // Mercados con Wikipedia (máxima prioridad)
      node["amenity"="marketplace"]["wikipedia"](${south},${west},${north},${east});
      way["amenity"="marketplace"]["wikipedia"](${south},${west},${north},${east});
      
      // FUENTES EMBLEMÁTICAS
      node["amenity"="fountain"]["heritage"]["name"](${south},${west},${north},${east});
      node["amenity"="fountain"]["wikipedia"](${south},${west},${north},${east});
      
      // IGLESIAS PATRIMONIALES
      node["building"="church"]["heritage"]["name"](${south},${west},${north},${east});
      way["building"="church"]["heritage"]["name"](${south},${west},${north},${east});
      
      // 🔥 TIER 2: POIs SIN WIKIPEDIA (para relleno en ciudades pequeñas)
      // Solo POIs turísticos, NO hoteles/restaurantes/tiendas
      
      // Iglesias y capillas (todas con nombre)
      node["building"="church"]["name"](${south},${west},${north},${east});
      way["building"="church"]["name"](${south},${west},${north},${east});
      node["building"="chapel"]["name"](${south},${west},${north},${east});
      way["building"="chapel"]["name"](${south},${west},${north},${east});
      
      // Monumentos históricos
      node["historic"="memorial"]["name"](${south},${west},${north},${east});
      way["historic"="memorial"]["name"](${south},${west},${north},${east});
      node["historic"="ruins"]["name"](${south},${west},${north},${east});
      way["historic"="ruins"]["name"](${south},${west},${north},${east});
      
      // Parques y jardines (todos)
      node["leisure"="park"]["name"](${south},${west},${north},${east});
      way["leisure"="park"]["name"](${south},${west},${north},${east});
      node["leisure"="garden"]["name"](${south},${west},${north},${east});
      way["leisure"="garden"]["name"](${south},${west},${north},${east});
      
      // Plazas importantes (todas)
      node["place"="square"]["name"](${south},${west},${north},${east});
      way["place"="square"]["name"](${south},${west},${north},${east});
      
      // Barrios conocidos
      node["place"="neighbourhood"]["name"](${south},${west},${north},${east});
      way["place"="neighbourhood"]["name"](${south},${west},${north},${east});
      node["place"="quarter"]["name"](${south},${west},${north},${east});
      way["place"="quarter"]["name"](${south},${west},${north},${east});
      
      // Torres y puertas
      node["man_made"="tower"]["name"](${south},${west},${north},${east});
      way["man_made"="tower"]["name"](${south},${west},${north},${east});
      node["historic"="city_gate"]["name"](${south},${west},${north},${east});
      way["historic"="city_gate"]["name"](${south},${west},${north},${east});
      
      // Puentes (todos)
      way["man_made"="bridge"]["name"](${south},${west},${north},${east});
      
      // Fuentes
      node["amenity"="fountain"]["name"](${south},${west},${north},${east});
      
      // Galerías y arte
      node["tourism"="artwork"]["name"](${south},${west},${north},${east});
      way["tourism"="artwork"]["name"](${south},${west},${north},${east});
    );
    out center tags;
  `.trim();
}

/**
 * Ejecuta query Overpass en un cuadrante
 * @param {Object} bbox - Bounding box
 * @param {string} quadrantName - Nombre del cuadrante (para logs)
 * @returns {Promise<Array>} POIs encontrados
 */
async function queryQuadrant(bbox, quadrantName) {
  const query = buildExpandedQueryForBBox(bbox);
  const startTime = Date.now();

  try {
    const response = await executeOverpassQueryWithFailover(
      query,
      QUADRANT_TIMEOUT,
      0
    );

    const duration = Date.now() - startTime;
    const elements = response?.elements || [];

    console.log(
      `[EXPANDED-OSM] ✓ ${quadrantName}: ${elements.length} raw POIs in ${(
        duration / 1000
      ).toFixed(2)}s`
    );

    return elements;
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error.code === 'ECONNABORTED') {
      console.log(
        `[EXPANDED-OSM] ⏱️ ${quadrantName}: timeout after ${(
          duration / 1000
        ).toFixed(2)}s`
      );
    } else {
      console.log(`[EXPANDED-OSM] ❌ ${quadrantName}: ${error.message}`);
    }

    return []; // Continuar con otros cuadrantes
  }
}

/**
 * Busca POIs usando estrategia de 4 cuadrantes
 * @param {Object} cityCoords - {lat, lng}
 * @param {number} sideKm - Lado de cada cuadrante en km
 * @returns {Promise<Array>} POIs únicos filtrados
 */
async function searchByQuadrants(cityCoords, sideKm = QUADRANT_SIDE_KM) {
  const { lat, lng } = cityCoords;

  // 🔥 VOLVER A 4 CUADRANTES SIMPLES (funcionaban antes)
  const quadrants = [
    { name: 'Noreste', quadrant: 'NE' },
    { name: 'Noroeste', quadrant: 'NW' },
    { name: 'Sureste', quadrant: 'SE' },
    { name: 'Suroeste', quadrant: 'SW' },
  ];

  console.log(
    `[EXPANDED-OSM] Starting 4-quadrant search (${sideKm}km side)...`
  );

  let allElements = [];
  let successCount = 0;

  // Ejecutar queries en los 4 cuadrantes
  for (let i = 0; i < quadrants.length; i++) {
    const quad = quadrants[i];
    const bbox = getQuadrantBBox(lat, lng, sideKm, quad.quadrant);
    const elements = await queryQuadrant(bbox, quad.name);

    if (elements.length > 0) {
      allElements.push(...elements);
      successCount++;
    }

    // Pausa de 1s entre cuadrantes
    if (i < quadrants.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(
    `[EXPANDED-OSM] ✓ ${successCount}/4 quadrants successful, ${allElements.length} total elements`
  );

  // Parsear y deduplicar
  const pois = parsePOIs(allElements);
  const deduplicated = deduplicatePOIs(pois);

  console.log(
    `[EXPANDED-OSM] ✓ ${deduplicated.length} unique POIs after filtering`
  );

  return deduplicated;
}

/**
 * Parsea elementos OSM a formato estándar
 * @param {Array} elements - Elementos OSM crudos
 * @returns {Array} POIs parseados
 */
function parsePOIs(elements) {
  const pois = [];

  for (const el of elements) {
    if (!el.tags || !el.tags.name) continue;

    // Obtener coordenadas
    const coords =
      el.lat && el.lon
        ? { lat: el.lat, lng: el.lon }
        : el.center
        ? { lat: el.center.lat, lng: el.center.lon }
        : null;

    if (!coords || !isValidCoordinates(coords)) continue;

    // Verificar calidad del POI
    const hasWikipedia = !!(
      el.tags.wikipedia ||
      el.tags['wikipedia:es'] ||
      el.tags['wikipedia:en']
    );
    const hasWikidata = !!el.tags.wikidata;
    const hasHeritage = !!(el.tags.heritage || el.tags['heritage:operator']);
    const isTourismAttraction =
      el.tags.tourism === 'attraction' || el.tags.tourism === 'yes';
    const isIconicBuilding =
      el.tags.building === 'cathedral' ||
      el.tags.building === 'basilica' ||
      el.tags.building === 'castle' ||
      el.tags.building === 'church';

    // 🔥 TIPOS TURÍSTICOS ACEPTABLES (para ciudades pequeñas sin Wikipedia)
    const acceptableTypes = [
      'attraction',
      'museum',
      'gallery',
      'artwork',
      'viewpoint', // Turismo
      'monument',
      'memorial',
      'castle',
      'ruins',
      'archaeological_site',
      'fort', // Histórico
      'cathedral',
      'basilica',
      'church',
      'chapel',
      'monastery',
      'shrine', // Religioso
      'palace',
      'manor',
      'historic', // Edificios nobles
      'park',
      'garden',
      'nature_reserve', // Naturaleza
      'square',
      'pedestrian',
      'neighbourhood', // Urbano
      'bridge',
      'tower',
      'lighthouse',
      'city_gate',
      'fountain', // Arquitectura
    ];

    const tourism = el.tags.tourism;
    const historic = el.tags.historic;
    const building = el.tags.building;
    const leisure = el.tags.leisure;
    const place = el.tags.place;
    const manMade = el.tags.man_made;
    const amenity = el.tags.amenity;

    const hasAcceptableType =
      acceptableTypes.includes(tourism) ||
      acceptableTypes.includes(historic) ||
      acceptableTypes.includes(building) ||
      acceptableTypes.includes(leisure) ||
      acceptableTypes.includes(place) ||
      acceptableTypes.includes(manMade);

    // 🔥 TIPOS A EXCLUIR (aunque tengan nombre)
    const excludedTypes = [
      'hotel',
      'hostel',
      'guest_house',
      'apartment',
      'motel', // Alojamiento
      'information',
      'picnic_site', // Info
      'fuel',
      'parking',
      'toilets',
      'bench',
      'waste_basket', // Servicios
      'restaurant',
      'cafe',
      'bar',
      'fast_food',
      'pub', // Gastronomía (excepto mercados emblemáticos)
      'shop',
      'supermarket',
      'mall',
      'marketplace', // Comercio (excepto mercados históricos)
    ];

    const isExcluded =
      excludedTypes.includes(tourism) ||
      excludedTypes.includes(amenity) ||
      el.tags.shop; // Cualquier tienda

    // Excepción: Mercados históricos CON Wikipedia sí se aceptan
    const isHistoricMarket =
      amenity === 'marketplace' && (hasWikipedia || hasWikidata);

    if (isExcluded && !isHistoricMarket) continue;

    // Filtro de calidad ESCALONADO:
    // Tier 1: Wikipedia O Wikidata O Heritage (máxima calidad)
    const isTier1 = hasWikipedia || hasWikidata || hasHeritage;

    // Tier 2: Sin Wikipedia pero tipo turístico aceptable (para relleno en ciudades pequeñas)
    const isTier2 =
      !isTier1 &&
      (hasAcceptableType || isTourismAttraction || isIconicBuilding);

    const isHighQuality = isTier1 || isTier2;

    if (!isHighQuality) continue;

    // Determinar tipo (PRIORIDAD A EDIFICIOS ICÓNICOS)
    let type = 'attraction';
    if (el.tags.building === 'basilica') type = 'basilica';
    else if (el.tags.building === 'cathedral') type = 'cathedral';
    else if (el.tags.building === 'castle') type = 'castle';
    else if (el.tags.tourism) type = el.tags.tourism;
    else if (el.tags.historic) type = 'historic';
    else if (el.tags.amenity) type = el.tags.amenity;
    else if (el.tags.leisure) type = el.tags.leisure;
    else if (el.tags.place) type = el.tags.place;
    else if (el.tags.highway) type = 'street';
    else if (el.tags.man_made) type = el.tags.man_made;

    // Determinar tier de calidad
    const qualityTier = isTier1 ? 1 : 2;

    // Calcular score de relevancia
    const relevanceScore = calculateRelevanceScore(el.tags, type, qualityTier);

    pois.push({
      id: `osm-${el.id}`,
      name: el.tags.name,
      type,
      coordinates: coords,
      wikipedia:
        el.tags.wikipedia ||
        el.tags['wikipedia:es'] ||
        el.tags['wikipedia:en'] ||
        null,
      wikidata: el.tags.wikidata || null,
      website: el.tags.website || null,
      openingHours: el.tags.opening_hours || null,
      source: 'OpenStreetMap-Expanded',
      osmId: el.id,
      rawTags: el.tags,
      relevanceScore,
      qualityTier, // 1=Wikipedia/Wikidata, 2=Sin Wikipedia pero tipo aceptable
    });
  }

  // Ordenar por relevancia
  pois.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return pois;
}

/**
 * Calcula score de relevancia turística de un POI
 * CLAVE: Priorizar monumentos icónicos, catedrales, museos, plazas principales
 * @param {Object} tags - Tags OSM
 * @param {string} type - Tipo de POI
 * @param {number} qualityTier - Tier de calidad (1=Wikipedia/Wikidata, 2=Sin Wikipedia)
 * @returns {number} Score de relevancia
 */
function calculateRelevanceScore(tags, type, qualityTier = 1) {
  let score = 0;

  // FACTOR 0: Penalización por falta de Wikipedia (Tier 2)
  // Los POIs Tier 2 (sin Wikipedia) tendrán menor score y se usarán para rellenar
  if (qualityTier === 2) {
    score -= 30; // Penalización para que vayan al final
  }

  // FACTOR 1: Tiene Wikipedia (muy importante)
  if (tags.wikipedia || tags['wikipedia:es'] || tags['wikipedia:en']) {
    score += 50;

    // Bonus por múltiples idiomas
    const wikiLangs = Object.keys(tags).filter((k) =>
      k.startsWith('wikipedia:')
    ).length;
    score += wikiLangs * 5;
  }

  // FACTOR 2: Tiene Wikidata
  if (tags.wikidata) {
    score += 10;
  }

  // FACTOR 3: Tipo de POI (prioridad turística)
  const typePriority = {
    // Monumentos y edificios icónicos
    basilica: 28, // BASÍLICAS (máxima prioridad)
    cathedral: 25,
    castle: 24,
    palace: 23,
    monument: 22,
    attraction: 20,
    museum: 20,

    // Espacios públicos importantes
    square: 18,
    park: 15,
    market: 16,
    bridge: 14,
    tower: 14,

    // Cultura
    gallery: 13,
    theatre: 13,
    viewpoint: 12,

    // Barrios y calles
    neighbourhood: 11,
    street: 10,
    historic: 15,
  };
  score += typePriority[type] || 5;

  // FACTOR 4: Es tourism=attraction (tag específico)
  if (tags.tourism === 'attraction') {
    score += 15;
  }

  // FACTOR 5: Patrimonio UNESCO
  if (tags.heritage || tags['heritage:operator'] || tags['heritage:website']) {
    score += 20;
  }

  // FACTOR 6: Es catedral, basílica o iglesia importante (MÁXIMA PRIORIDAD)
  if (tags.building === 'cathedral') {
    score += 30; // Catedrales
  }
  if (tags.building === 'basilica') {
    score += 35; // Basílicas (MÁXIMA PRIORIDAD - ej: Pilar)
  }
  if (tags.building === 'church' && tags.heritage) {
    score += 15;
  }

  // FACTOR 7: Tiene nombre en múltiples idiomas (relevancia internacional)
  const nameKeys = Object.keys(tags).filter((k) => k.startsWith('name:'));
  score += nameKeys.length * 2;

  // FACTOR 8: Tiene website oficial
  if (tags.website) {
    score += 3;
  }

  // FACTOR 9: Tiene imagen en Wikimedia
  if (tags.wikimedia_commons || tags.image) {
    score += 5;
  }

  // FACTOR 10: Bonus para categorías específicas muy turísticas
  if (tags.historic === 'monument' || tags.historic === 'castle') {
    score += 10;
  }
  if (tags.amenity === 'marketplace' && tags.tourism === 'attraction') {
    score += 30; // Mercados turísticos (Camden, Boquería, etc.)
  }

  return score;
}

/**
 * Deduplica POIs por ID y por nombre similar
 * @param {Array} pois - Array de POIs
 * @returns {Array} POIs únicos
 */
function deduplicatePOIs(pois) {
  const seen = new Set();
  const unique = [];

  for (const poi of pois) {
    // Deduplicar por ID
    if (seen.has(poi.id)) continue;

    // Deduplicar por nombre similar (normalizado)
    const normalizedName = poi.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (seen.has(normalizedName)) continue;

    seen.add(poi.id);
    seen.add(normalizedName);
    unique.push(poi);
  }

  return unique;
}

/**
 * Obtiene coordenadas de una ciudad (reutiliza caché de overpassService)
 * @param {string} cityName - Nombre de la ciudad
 * @returns {Promise<Object>} {lat, lng}
 */
async function getCityCoordinates(cityName) {
  // Importar función de overpassService
  const { fetchPOIsFromCity } = await import('./overpassService.js');

  // Usar Nominatim para geocoding (misma estrategia que overpassService)
  const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

  try {
    const response = await axios.get(NOMINATIM_ENDPOINT, {
      params: {
        q: cityName,
        format: 'json',
        limit: 1,
      },
      headers: {
        'User-Agent': 'TripPlannerApp/1.0',
      },
      timeout: 10000,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error(`No coordinates found for ${cityName}`);
    }

    const result = response.data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };
  } catch (error) {
    throw new Error(`Geocoding failed for ${cityName}: ${error.message}`);
  }
}

/**
 * Método principal: Obtiene POIs usando búsqueda expandida por cuadrantes
 * @param {string} cityName - Nombre de la ciudad
 * @param {Object} options - Opciones { interests, limit }
 * @returns {Promise<Array>} Array de POIs
 */
export async function fetchPOIsFromCityExpanded(cityName, options = {}) {
  const {
    interests = ['history', 'culture'],
    limit = 100,
    includeHotels = false,
  } = options;

  console.log(`\n[EXPANDED-OSM] ========== EXPANDED POI Search ==========`);
  console.log(`[EXPANDED-OSM] City: ${cityName}`);
  console.log(`[EXPANDED-OSM] Method: 4 quadrants × ${QUADRANT_SIDE_KM}km`);
  console.log(
    `[EXPANDED-OSM] Filter: Wikipedia OR Wikidata (+ hotels if requested)`
  );

  try {
    // Obtener coordenadas
    console.log(`[EXPANDED-OSM] Geocoding ${cityName}...`);
    const cityCoords = await getCityCoordinates(cityName);
    console.log(
      `[EXPANDED-OSM] ✓ Coordinates: ${cityCoords.lat}, ${cityCoords.lng}`
    );

    // Buscar POIs por cuadrantes
    const allPOIs = await searchByQuadrants(cityCoords, QUADRANT_SIDE_KM);

    // Separar hoteles de POIs turísticos
    const hotels = allPOIs.filter(
      (poi) => poi.type === 'hotel' || poi.rawTags?.tourism === 'hotel'
    );
    const touristPOIs = allPOIs.filter(
      (poi) => poi.type !== 'hotel' && poi.rawTags?.tourism !== 'hotel'
    );

    console.log(
      `[EXPANDED-OSM] ✓ Found ${touristPOIs.length} tourist POIs + ${hotels.length} hotels`
    );

    // Limitar resultados si se especifica
    const finalPOIs =
      limit && touristPOIs.length > limit
        ? touristPOIs.slice(0, limit)
        : touristPOIs;

    console.log(
      `[EXPANDED-OSM] ✓ Returning ${finalPOIs.length} POIs for itinerary`
    );
    console.log(`[EXPANDED-OSM] ========================================\n`);

    // Si se solicitan hoteles, devolver ambos
    if (includeHotels) {
      return {
        pois: finalPOIs,
        hotels: hotels.slice(0, 4), // Top 4 hoteles
      };
    }

    return finalPOIs;
  } catch (error) {
    console.error(`[EXPANDED-OSM] ✗ Error:`, error.message);
    throw error;
  }
}

export default {
  fetchPOIsFromCityExpanded,
  enrichPOIsWithImages,
  enrichPOIsWithDescriptions,
};

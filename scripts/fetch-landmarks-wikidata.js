/**
 * Script para obtener landmarks de una ciudad desde Wikidata
 * Genera datos en formato listo para usar en landmarkDatabase.js
 */

import axios from 'axios';

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';

/**
 * Coordenadas de ciudades principales
 */
const CITY_COORDS = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Barcelona: { lat: 41.3874, lng: 2.1686 },
  Valencia: { lat: 39.4699, lng: -0.3763 },
  Sevilla: { lat: 37.3886, lng: -5.9823 },
  Zaragoza: { lat: 41.6488, lng: -0.8891 },
};

/**
 * Mapeo de tipos Wikidata a tipos simples
 */
const TYPE_MAPPING = {
  museum: 'museum',
  museo: 'museum',
  palace: 'monument',
  palacio: 'monument',
  castle: 'monument',
  castillo: 'monument',
  church: 'monument',
  iglesia: 'monument',
  cathedral: 'monument',
  catedral: 'monument',
  plaza: 'plaza',
  square: 'plaza',
  park: 'park',
  parque: 'park',
  garden: 'park',
  jardín: 'park',
  street: 'street',
  calle: 'street',
  avenue: 'street',
  avenida: 'street',
  building: 'monument',
  edificio: 'monument',
  monument: 'monument',
  monumento: 'monument',
  attraction: 'attraction',
  atracción: 'attraction',
};

/**
 * Obtiene landmarks desde Wikidata usando SPARQL
 */
async function fetchLandmarksFromWikidata(cityName, cityCoords) {
  const query = `
SELECT DISTINCT ?item ?itemLabel ?coords ?instanceLabel ?sitelinks WHERE {
  ?item wdt:P625 ?coords.
  FILTER(geof:distance(?coords, "Point(${cityCoords.lng} ${cityCoords.lat})"^^geo:wktLiteral) < 10).
  
  # Tipos principales
  ?item wdt:P31 ?instance.
  VALUES ?instance {
    wd:Q33506   # museum
    wd:Q570116  # tourist attraction
    wd:Q174782  # plaza
    wd:Q1006791 # park
    wd:Q23413   # castle
    wd:Q16970   # church
    wd:Q2977    # cathedral
    wd:Q1865291 # palace
    wd:Q34442   # road/street
    wd:Q35535   # gate
    wd:Q5003624 # memorial
    wd:Q811979  # architectural structure
  }
  
  ?item wikibase:sitelinks ?sitelinks.
  FILTER(?sitelinks > 12).
  
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
ORDER BY DESC(?sitelinks)
LIMIT 50
  `;

  console.log(`\n🔍 Fetching landmarks for ${cityName}...`);
  console.log(`📍 Center: ${cityCoords.lat}, ${cityCoords.lng}`);

  try {
    const response = await axios.get(WIKIDATA_ENDPOINT, {
      params: {
        query: query.trim(),
        format: 'json',
      },
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'TripPlannerApp/1.0',
      },
      timeout: 60000,
    });

    const bindings = response.data?.results?.bindings || [];
    console.log(`✅ Found ${bindings.length} results from Wikidata\n`);

    const landmarks = bindings.map((item) => {
      const coords = parseWikidataCoords(item.coords?.value);
      const sitelinks = parseInt(item.sitelinks?.value || 0);
      const instanceLabel = (
        item.instanceLabel?.value || 'attraction'
      ).toLowerCase();

      return {
        name: item.itemLabel?.value || 'Unknown',
        coords: coords,
        type: inferType(instanceLabel),
        priority: calculatePriority(sitelinks),
        sitelinks: sitelinks,
        wikidataId: extractWikidataId(item.item?.value),
      };
    });

    // Filtrar landmarks sin coordenadas
    const valid = landmarks.filter(
      (l) => l.coords && l.coords.lat && l.coords.lng
    );

    // Deduplicar por nombre (mantener el de mayor prioridad)
    const deduplicated = [];
    const seen = new Map();

    for (const landmark of valid) {
      const key = landmark.name.toLowerCase().trim();
      const existing = seen.get(key);

      if (!existing || landmark.priority > existing.priority) {
        if (existing) {
          // Reemplazar en el array
          const idx = deduplicated.indexOf(existing);
          deduplicated[idx] = landmark;
        } else {
          deduplicated.push(landmark);
        }
        seen.set(key, landmark);
      }
    }

    return deduplicated;
  } catch (error) {
    console.error(`❌ Error fetching from Wikidata:`, error.message);
    return [];
  }
}

/**
 * Parsea coordenadas de Wikidata "Point(lng lat)"
 */
function parseWikidataCoords(coordString) {
  if (!coordString) return null;

  try {
    const match = coordString.match(/Point\(([^ ]+) ([^ ]+)\)/);
    if (match) {
      return {
        lat: parseFloat(match[2]),
        lng: parseFloat(match[1]),
      };
    }
  } catch (error) {
    console.error('Error parsing coords:', coordString);
  }
  return null;
}

/**
 * Extrae ID de Wikidata
 */
function extractWikidataId(wikidataUrl) {
  if (!wikidataUrl) return null;
  const match = wikidataUrl.match(/Q\d+$/);
  return match ? match[0] : null;
}

/**
 * Infiere tipo simple desde label de Wikidata
 */
function inferType(instanceLabel) {
  const normalized = instanceLabel.toLowerCase();

  for (const [key, value] of Object.entries(TYPE_MAPPING)) {
    if (normalized.includes(key)) {
      return value;
    }
  }

  return 'attraction';
}

/**
 * Calcula prioridad basada en número de sitelinks
 */
function calculatePriority(sitelinks) {
  if (sitelinks >= 150) return 10; // Museo del Prado (156), Palacio Real (134)
  if (sitelinks >= 100) return 10;
  if (sitelinks >= 70) return 9;
  if (sitelinks >= 50) return 8;
  if (sitelinks >= 30) return 7;
  if (sitelinks >= 20) return 6;
  if (sitelinks >= 15) return 5;
  return 4;
}

/**
 * Genera código JavaScript listo para copiar
 */
function generateJavaScriptOutput(cityName, landmarks) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RESULTS FOR ${cityName.toUpperCase()}`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`'${cityName}': [`);

  landmarks.forEach((landmark, idx) => {
    const comma = idx < landmarks.length - 1 ? ',' : '';
    console.log(
      `  { name: '${
        landmark.name
      }', coords: {lat: ${landmark.coords.lat.toFixed(
        4
      )}, lng: ${landmark.coords.lng.toFixed(4)}}, type: '${
        landmark.type
      }', priority: ${landmark.priority} }${comma}`
    );
  });

  console.log(`],\n`);

  // Tabla resumen
  console.log(`\n📈 SUMMARY:`);
  console.log(`   Total landmarks: ${landmarks.length}`);
  console.log(
    `   Priority 10: ${landmarks.filter((l) => l.priority === 10).length}`
  );
  console.log(
    `   Priority 9: ${landmarks.filter((l) => l.priority === 9).length}`
  );
  console.log(
    `   Priority 8: ${landmarks.filter((l) => l.priority === 8).length}`
  );
  console.log(
    `   Types: ${[...new Set(landmarks.map((l) => l.type))].join(', ')}`
  );
  console.log(`\n${'='.repeat(80)}\n`);
}

/**
 * Main
 */
async function main() {
  const cityToTest = process.argv[2] || 'Madrid';

  if (!CITY_COORDS[cityToTest]) {
    console.error(`❌ City "${cityToTest}" not found in database`);
    console.log(`\nAvailable cities: ${Object.keys(CITY_COORDS).join(', ')}`);
    process.exit(1);
  }

  const coords = CITY_COORDS[cityToTest];
  const landmarks = await fetchLandmarksFromWikidata(cityToTest, coords);

  if (landmarks.length === 0) {
    console.error(`❌ No landmarks found for ${cityToTest}`);
    process.exit(1);
  }

  generateJavaScriptOutput(cityToTest, landmarks);
}

main();

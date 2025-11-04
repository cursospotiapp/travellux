/**
 * Servicio para obtener POIs de OpenStreetMap usando Overpass API
 * 100% gratuito, sin API key necesaria
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { isValidCoordinates } from '../utils/geoUtils.js';

// Cargar variables de entorno ANTES de usar process.env
dotenv.config();

const OVERPASS_ENDPOINT =
  process.env.OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter';
const TIMEOUT = parseInt(process.env.OVERPASS_TIMEOUT) || 180000; // 3 minutos
const MAX_RETRIES = parseInt(process.env.OVERPASS_MAX_RETRIES) || 3;
const DEFAULT_RADIUS = parseInt(process.env.OVERPASS_DEFAULT_RADIUS) || 8000; // 8km por defecto

/**
 * Obtiene MÚLTIPLES imágenes de Wikipedia + Wikidata para un POI
 * Sistema de fallback: Wikipedia → Wikidata (SIN Commons para evitar imágenes de otras ciudades)
 * @param {string} wikipediaUrl - URL de Wikipedia (ej: "es:Basílica_del_Pilar")
 * @returns {Promise<Array<string>>} Array de URLs de imágenes (máximo 3)
 */
async function fetchWikipediaImages(wikipediaUrl) {
  if (!wikipediaUrl) return [];

  try {
    const parts = wikipediaUrl.split(':');
    if (parts.length !== 2) return [];

    const lang = parts[0];
    let title = parts[1];
    const images = [];

    // 🔥 FUENTE 1: Wikipedia API (pageimages + images del artículo)
    try {
      const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
        title
      )}&prop=pageimages|images&piprop=original&imlimit=10&redirects=1&format=json&formatversion=2`;

      const response = await axios.get(apiUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'TripPlanner/1.0' },
      });

      let pageData = response.data?.query?.pages?.[0];

      // 🔥 Si la página no existe, buscar título correcto
      if (pageData?.missing === true) {
        const correctTitle = await searchCorrectWikipediaTitle(title, lang);
        if (correctTitle) {
          title = correctTitle;

          const retryUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
            correctTitle
          )}&prop=pageimages|images&piprop=original&imlimit=10&redirects=1&format=json&formatversion=2`;

          const retryResponse = await axios.get(retryUrl, {
            timeout: 5000,
            headers: { 'User-Agent': 'TripPlanner/1.0' },
          });

          pageData = retryResponse.data?.query?.pages?.[0];
        }
      }

      // 1A. Imagen principal (pageimages - SIEMPRE la mejor)
      if (pageData?.original?.source && !pageData.missing) {
        images.push(pageData.original.source);
      }

      // 1B. Imágenes del artículo
      if (
        pageData?.images &&
        pageData.images.length > 0 &&
        images.length < 3 &&
        !pageData.missing
      ) {
        for (const img of pageData.images) {
          if (images.length >= 3) break;

          const imgTitle = img.title;

          // Filtrar imágenes no deseadas
          if (
            imgTitle.includes('Commons-logo') ||
            imgTitle.includes('Wikidata') ||
            imgTitle.includes('Wikimedia') ||
            imgTitle.includes('Logo') ||
            imgTitle.includes('Icon') ||
            imgTitle.includes('Flag') ||
            imgTitle.includes('Coat_of_arms') ||
            imgTitle.toLowerCase().includes('mapa') ||
            imgTitle.toLowerCase().includes('map') ||
            imgTitle.endsWith('.svg')
          ) {
            continue;
          }

          // Obtener URL de esta imagen
          try {
            const imgUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
              imgTitle
            )}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&formatversion=2`;

            const imgResponse = await axios.get(imgUrl, {
              timeout: 3000,
              headers: { 'User-Agent': 'TripPlanner/1.0' },
            });

            const imgData = imgResponse.data?.query?.pages?.[0];
            const imgSourceUrl = imgData?.imageinfo?.[0]?.url;

            if (imgSourceUrl && !images.includes(imgSourceUrl)) {
              images.push(imgSourceUrl);
            }
          } catch (err) {
            // Continuar con la siguiente
          }
        }
      }
    } catch (err) {
      // Continuar con otras fuentes
    }

    // 🔥 FUENTE 2: Wikidata (imagen destacada del elemento)
    // NO usamos Commons search porque puede traer imágenes de otras ciudades con el mismo nombre
    if (images.length === 0) {
      try {
        // Obtener Wikidata ID del artículo de Wikipedia
        const wikidataUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          title
        )}&prop=pageprops&ppprop=wikibase_item&format=json&formatversion=2`;

        const wikidataResponse = await axios.get(wikidataUrl, {
          timeout: 3000,
          headers: { 'User-Agent': 'TripPlanner/1.0' },
        });

        const wikidataId =
          wikidataResponse.data?.query?.pages?.[0]?.pageprops?.wikibase_item;

        if (wikidataId) {
          // Obtener imagen (P18) del elemento de Wikidata
          const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json`;

          const entityResponse = await axios.get(entityUrl, {
            timeout: 3000,
            headers: { 'User-Agent': 'TripPlanner/1.0' },
          });

          const imageClaim = entityResponse.data?.claims?.P18?.[0];
          const imageFilename = imageClaim?.mainsnak?.datavalue?.value;

          if (imageFilename) {
            // Convertir nombre de archivo a URL de Commons
            const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(
              imageFilename
            )}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&formatversion=2`;

            const commonsResponse = await axios.get(commonsUrl, {
              timeout: 3000,
              headers: { 'User-Agent': 'TripPlanner/1.0' },
            });

            const imgUrl =
              commonsResponse.data?.query?.pages?.[0]?.imageinfo?.[0]?.url;
            if (imgUrl && !images.includes(imgUrl)) {
              images.push(imgUrl);
            }
          }
        }
      } catch (err) {
        // Última fuente, si falla devolvemos lo que tengamos
      }
    }

    return images.slice(0, 3); // Máximo 3 imágenes
  } catch (error) {
    return [];
  }
}
/**
 * Busca el título correcto de Wikipedia cuando el tag OSM está mal
 * Estrategia: Buscar con y sin modificaciones, priorizar coincidencias exactas
 * @param {string} badTitle - Título incorrecto de OSM
 * @param {string} lang - Idioma de Wikipedia
 * @returns {Promise<string|null>} Título correcto o null
 */
async function searchCorrectWikipediaTitle(badTitle, lang = 'es') {
  try {
    // ESTRATEGIA 1: Intentar múltiples variantes del título
    const variants = [];

    // Variante 1: Título original sin modificar
    variants.push(badTitle);

    // Variante 2: Convertir "de Ciudad" → "(Ciudad)"
    const withParens = badTitle.replace(
      /\s+de\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]+)$/i,
      ' ($1)'
    );
    if (withParens !== badTitle) {
      variants.push(withParens);
    }

    // Variante 3: Quitar paréntesis completamente
    const noParens = badTitle
      .replace(/\([^)]*\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    variants.push(noParens);

    // Variante 4: Convertir guiones en espacios
    variants.push(
      badTitle.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    );

    // Intentar cada variante con OpenSearch
    for (const variant of variants) {
      const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
        variant
      )}&limit=5&format=json`;

      const response = await axios.get(searchUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'TripPlanner/1.0' },
      });

      const titles = response.data?.[1];
      if (titles && titles.length > 0) {
        // PRIORIZAR: Título que contiene las palabras clave del original
        const keywords = badTitle
          .toLowerCase()
          .split(/[\s\-_()]+/)
          .filter((w) => w.length > 3);

        for (const title of titles) {
          const titleLower = title.toLowerCase();
          const matchCount = keywords.filter((k) =>
            titleLower.includes(k)
          ).length;

          // Si coinciden al menos el 70% de las palabras clave, es buena coincidencia
          if (matchCount >= keywords.length * 0.7) {
            return title;
          }
        }

        // Si no hay buena coincidencia, devolver el primer resultado de la mejor variante
        if (variant === variants[0] || variant === variants[1]) {
          return titles[0];
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Obtiene extracto REAL de Wikipedia SIEMPRE EN ESPAÑOL
 * @param {string} wikipediaUrl - URL de Wikipedia (ej: "es:Plaza_Mayor_(Madrid)" o "it:Colosseo")
 * @returns {Promise<Object|null>} {extract: string, image: string} o null
 */
async function fetchWikipediaExtract(wikipediaUrl) {
  if (!wikipediaUrl) return null;

  try {
    // Parsear idioma y título: "es:Plaza_Mayor_(Madrid)" → lang=es, title=Plaza_Mayor_(Madrid)
    const parts = wikipediaUrl.split(':');
    if (parts.length !== 2) return null;

    const originalLang = parts[0];
    const originalTitle = parts[1];

    // 🔥 PASO 1: Intentar obtener PRIMERO en español
    let result = { extract: null, image: null };

    if (originalLang !== 'es') {
      // Intentar obtener el título equivalente en español desde Wikidata
      try {
        const wikidataUrl = `https://${originalLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          originalTitle
        )}&prop=langlinks&lllang=es&format=json&formatversion=2`;
        const wikidataResponse = await axios.get(wikidataUrl, {
          timeout: 3000,
          headers: { 'User-Agent': 'TripPlanner/1.0' },
        });

        const page = wikidataResponse.data?.query?.pages?.[0];
        if (page?.langlinks?.[0]?.title) {
          const spanishTitle = page.langlinks[0].title;

          // Obtener contenido completo en español + imagen
          const spanishApiUrl = `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
            spanishTitle
          )}&prop=extracts|pageimages&exintro=0&explaintext=1&piprop=original&redirects=1&format=json&formatversion=2`;
          const spanishResponse = await axios.get(spanishApiUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'TripPlanner/1.0' },
            maxContentLength: 50000,
          });

          const pageData = spanishResponse.data?.query?.pages?.[0];
          if (pageData) {
            const extract = pageData.extract;
            if (extract && extract.length > 100) {
              // Tomar los primeros 3-4 párrafos (hasta 800 caracteres)
              const paragraphs = extract
                .split('\n')
                .filter((p) => p.trim().length > 50);
              result.extract = paragraphs
                .slice(0, 3)
                .join(' ')
                .substring(0, 800);
            }

            // Obtener imagen
            if (pageData.original?.source) {
              result.image = pageData.original.source;
            }
          }
        }
      } catch (error) {
        // Si falla, continuar con el idioma original
      }
    }

    // 🔥 PASO 2: Si ya está en español o no encontramos versión española, usar el original
    if (!result.extract) {
      let titleToUse = originalTitle;

      const apiUrl = `https://${originalLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
        titleToUse
      )}&prop=extracts|pageimages&exintro=0&explaintext=1&piprop=original&redirects=1&format=json&formatversion=2`;

      const response = await axios.get(apiUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'TripPlanner/1.0' },
        maxContentLength: 50000,
      });

      const pageData = response.data?.query?.pages?.[0];

      // 🔥 PASO 2.5: Si la página no existe (missing), buscar el título correcto
      if (pageData?.missing === true) {
        const correctTitle = await searchCorrectWikipediaTitle(
          titleToUse,
          originalLang
        );
        if (correctTitle) {
          titleToUse = correctTitle;

          // Reintentar con el título correcto
          const retryUrl = `https://${originalLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
            correctTitle
          )}&prop=extracts|pageimages&exintro=0&explaintext=1&piprop=original&redirects=1&format=json&formatversion=2`;

          const retryResponse = await axios.get(retryUrl, {
            timeout: 8000,
            headers: { 'User-Agent': 'TripPlanner/1.0' },
            maxContentLength: 50000,
          });

          const retryPageData = retryResponse.data?.query?.pages?.[0];
          if (retryPageData && !retryPageData.missing) {
            const extract = retryPageData.extract;
            if (extract && extract.length > 100) {
              const paragraphs = extract
                .split('\n')
                .filter((p) => p.trim().length > 50);
              result.extract = paragraphs
                .slice(0, 3)
                .join(' ')
                .substring(0, 800);
            }

            if (retryPageData.original?.source) {
              result.image = retryPageData.original.source;
            }
          }
        }
      } else if (pageData && !pageData.missing) {
        // Página existe con el título original
        const extract = pageData.extract;
        if (extract && extract.length > 100) {
          const paragraphs = extract
            .split('\n')
            .filter((p) => p.trim().length > 50);
          result.extract = paragraphs.slice(0, 3).join(' ').substring(0, 800);
        }

        if (!result.image && pageData.original?.source) {
          result.image = pageData.original.source;
        }
      }
    }

    return result.extract ? result : null;
  } catch (error) {
    // No logear errores, es normal que algunos fallen
    return null;
  }
}

/**
 * Obtiene información práctica de Wikipedia SIEMPRE EN ESPAÑOL
 * Busca en TODO el contenido de Wikipedia, no solo en el extracto
 * Con auto-corrección de títulos incorrectos en OSM
 * @param {string} wikipediaUrl - URL de Wikipedia (ej: "it:Colosseo" o "es:Plaza_Mayor")
 * @returns {Promise<Array<string>>} Array de tips prácticos EN ESPAÑOL
 */
async function fetchWikipediaPracticalInfo(wikipediaUrl) {
  if (!wikipediaUrl) return [];

  try {
    const parts = wikipediaUrl.split(':');
    if (parts.length !== 2) return [];

    const originalLang = parts[0];
    let originalTitle = parts[1];

    let finalLang = originalLang;
    let finalTitle = originalTitle;

    // 🔥 PASO 0: Verificar si el título existe, si no buscar el correcto
    const checkUrl = `https://${originalLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      originalTitle
    )}&format=json&formatversion=2`;

    const checkResponse = await axios.get(checkUrl, {
      timeout: 3000,
      headers: { 'User-Agent': 'TripPlanner/1.0' },
    });

    const checkPage = checkResponse.data?.query?.pages?.[0];
    if (checkPage?.missing === true) {
      // El título no existe, buscar el correcto
      const correctTitle = await searchCorrectWikipediaTitle(
        originalTitle,
        originalLang
      );
      if (correctTitle) {
        originalTitle = correctTitle;
      }
    }

    // 🔥 PASO 1: INTENTAR OBTENER VERSIÓN EN ESPAÑOL
    if (originalLang !== 'es') {
      try {
        const wikidataUrl = `https://${originalLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
          originalTitle
        )}&prop=langlinks&lllang=es&format=json&formatversion=2`;
        const wikidataResponse = await axios.get(wikidataUrl, {
          timeout: 3000,
          headers: { 'User-Agent': 'TripPlanner/1.0' },
        });

        const page = wikidataResponse.data?.query?.pages?.[0];
        if (page?.langlinks?.[0]?.title) {
          finalLang = 'es';
          finalTitle = page.langlinks[0].title;
        }
      } catch (err) {
        // Continuar con idioma original
      }
    }

    // Obtener TODO el contenido de Wikipedia en texto plano
    const apiUrl = `https://${finalLang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      finalTitle
    )}&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2`;

    const response = await axios.get(apiUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'TripPlanner/1.0' },
      maxContentLength: 200000, // Máximo 200KB para obtener más información
    });

    if (!response.data?.query?.pages?.[0]?.extract) return [];

    const text = response.data.query.pages[0].extract;
    const tips = [];

    // ✅ 1. HORARIOS - Patrones más completos
    const horarioPatterns = [
      // Horarios específicos: "10:00 a 18:00", "de 9:30 a 17:00"
      /(?:horario|abierto|abre|visitas?)[:\s]*(?:de\s+)?(\d{1,2}:\d{2})\s*(?:a|hasta|[-–])\s*(\d{1,2}:\d{2})/i,
      // Días de semana con horarios
      /(?:lunes\s+a\s+viernes|de\s+lunes\s+a\s+viernes)[:\s]*(\d{1,2}:\d{2})\s*(?:a|[-–])\s*(\d{1,2}:\d{2})/i,
      // Sábados y domingos
      /(?:sábados?|domingos?)[:\s]*(\d{1,2}:\d{2})\s*(?:a|[-–])\s*(\d{1,2}:\d{2})/i,
      // Abierto todos los días
      /abierto\s+(?:todos\s+los\s+días|diariamente)/i,
      // Cerrado días específicos
      /cerrado\s+(?:los?\s+)?(lunes|martes|miércoles|jueves|viernes|sábados?|domingos?)/i,
      // 24 horas
      /(?:abierto|disponible)\s+(?:las\s+)?24\s*horas/i,
    ];

    for (const pattern of horarioPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[0].match(/cerrado/i)) {
          tips.push(`⏰ Cerrado los ${match[1]}`);
          break;
        } else if (match[0].match(/24\s*horas/i)) {
          tips.push('⏰ Abierto 24 horas');
          break;
        } else if (match[1] && match[2]) {
          tips.push(`⏰ Horario: ${match[1]} - ${match[2]}`);
          break;
        } else if (match[0].match(/todos\s+los\s+días|diariamente/i)) {
          tips.push('⏰ Abierto todos los días');
          break;
        }
      }
    }

    // ✅ 2. PRECIOS/ENTRADA - Patrones mejorados
    const precioPatterns = [
      // Entrada gratuita
      /entrada\s+(?:es\s+)?(?:gratuita|gratis|libre)/i,
      /acceso\s+(?:gratuito|libre)/i,
      /visita\s+gratuita/i,
      /sin\s+(?:coste|costo)/i,
      // Precios específicos
      /(?:precio|tarifa|entrada|coste)[:\s]*(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/i,
      /(?:adultos?|general)[:\s]*(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/i,
      // Entrada con precio
      /entrada[:\s]*(\d+)\s*(?:€|euros?)/i,
    ];

    for (const pattern of precioPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[0].match(/gratuita|gratis|libre|sin\s+(?:coste|costo)/i)) {
          tips.push('✨ Entrada gratuita');
          break;
        } else if (match[1]) {
          const precio = match[1].replace(',', '.');
          tips.push(`💰 Entrada: ${precio}€`);
          break;
        }
      }
    }

    // ✅ 3. TRANSPORTE/METRO - Mejorado
    const transportePatterns = [
      // Metro con nombre de estación
      /(?:metro|estación)[:\s]+(?:de\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{3,25})(?:\s*\(|\.|\,|$)/i,
      // Acceso por metro
      /acceso\s+(?:por|desde|en)\s+(?:la\s+)?(?:estación|metro)\s+(?:de\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{3,25})(?:\.|,|$)/i,
      // Se encuentra en/cerca de estación
      /(?:junto\s+a|cerca\s+de|en)\s+(?:la\s+)?(?:estación|metro)\s+(?:de\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{3,25})(?:\.|,|$)/i,
    ];

    for (const pattern of transportePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const station = match[1].trim();
        // Validar que sea un nombre de estación válido (no frases genéricas)
        if (
          station.length >= 4 &&
          station.length <= 25 &&
          !station.match(/línea|distrito|ciudad|zona|barrio|calle|avenida/i)
        ) {
          tips.push(`🚇 Metro: ${station}`);
          break;
        }
      }
    }

    // ✅ 4. PATRIMONIO UNESCO
    if (
      text.match(/patrimonio\s+de\s+la\s+humanidad/i) ||
      text.match(/unesco/i)
    ) {
      const yearMatch = text.match(
        /(?:declarad[oa]|inscrit[oa]|nombrad[oa]).*?(?:patrimonio|unesco).*?(\d{4})/i
      );
      if (yearMatch) {
        tips.push(`🏛️ Patrimonio UNESCO (${yearMatch[1]})`);
      } else {
        tips.push('🏛️ Patrimonio de la Humanidad');
      }
    }

    // ✅ 5. ARQUITECTO/DISEÑADOR
    const arquitectoMatch = text.match(
      /(?:diseñad[oa]|proyectad[oa]|construid[oa])\s+por\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ\s]{3,30})(?:\s+en|\s+entre|\.|\,)/i
    );
    if (arquitectoMatch && arquitectoMatch[1]) {
      const arquitecto = arquitectoMatch[1].trim();
      if (arquitecto.length >= 5 && arquitecto.length <= 30) {
        tips.push(`👨‍🎨 Obra de ${arquitecto}`);
      }
    }

    // ✅ 6. AÑO DE CONSTRUCCIÓN
    const yearMatch = text.match(
      /(?:construid[oa]|edificad[oa]|inaugurad[oa])\s+en\s+(?:el\s+año\s+)?(\d{4})/i
    );
    if (yearMatch) {
      tips.push(`📅 Construido en ${yearMatch[1]}`);
    }

    // ✅ 7. MEJOR ÉPOCA PARA VISITAR
    const mejorEpocaMatch = text.match(
      /mejor\s+(?:época|momento|hora|horario)\s+para\s+visitar[:\s]+([^.]{10,80})/i
    );
    if (mejorEpocaMatch && mejorEpocaMatch[1]) {
      const epoca = mejorEpocaMatch[1].trim();
      if (epoca.length >= 10 && epoca.length <= 80) {
        tips.push(`🌟 ${epoca}`);
      }
    }

    // ✅ 8. RESERVA PREVIA
    if (text.match(/(?:necesaria|obligatoria|requiere)\s+reserva/i)) {
      tips.push('⚠️ Requiere reserva previa');
    }

    return tips.slice(0, 3); // Máximo 3 tips
  } catch (error) {
    // Silencioso - es normal que algunos fallen
    return [];
  }
}

/**
 * Mapeo de tipos de interés a tags de OpenStreetMap
 */
const INTEREST_TO_OSM_TAGS = {
  history: [
    'historic=monument',
    'historic=castle',
    'historic=memorial',
    'tourism=museum',
  ],
  art: ['tourism=museum', 'tourism=gallery', 'amenity=theatre'],
  architecture: [
    'historic=building',
    'building=cathedral',
    'tourism=attraction',
  ],
  nature: ['leisure=park', 'natural=beach', 'leisure=garden'],
  food: ['amenity=restaurant', 'amenity=cafe', 'amenity=bar'],
  shopping: ['shop=mall', 'shop=department_store', 'amenity=marketplace'],
  nightlife: ['amenity=bar', 'amenity=nightclub', 'amenity=pub'],
  culture: ['tourism=museum', 'amenity=theatre', 'tourism=gallery'],
  adventure: ['sport=climbing', 'leisure=water_park', 'tourism=attraction'],
  relaxation: ['leisure=spa', 'leisure=park', 'amenity=cafe'],
};

/**
 * Mapeo de ciudades a coordenadas centrales
 * Para queries más confiables en Overpass API
 * Cache de ciudades populares para evitar geocoding
 */
const CITY_COORDINATES = {
  // Europa Occidental
  Roma: { lat: 41.9028, lng: 12.4964, radius: DEFAULT_RADIUS },
  Rome: { lat: 41.9028, lng: 12.4964, radius: DEFAULT_RADIUS },
  París: { lat: 48.8566, lng: 2.3522, radius: DEFAULT_RADIUS },
  Paris: { lat: 48.8566, lng: 2.3522, radius: DEFAULT_RADIUS },
  Barcelona: { lat: 41.3851, lng: 2.1734, radius: DEFAULT_RADIUS },
  Madrid: { lat: 40.4168, lng: -3.7038, radius: DEFAULT_RADIUS },
  Londres: { lat: 51.5074, lng: -0.1278, radius: DEFAULT_RADIUS },
  London: { lat: 51.5074, lng: -0.1278, radius: DEFAULT_RADIUS },
  Ámsterdam: { lat: 52.3676, lng: 4.9041, radius: 12000 },
  Amsterdam: { lat: 52.3676, lng: 4.9041, radius: 12000 },
  Lisboa: { lat: 38.7223, lng: -9.1393, radius: 12000 },
  Lisbon: { lat: 38.7223, lng: -9.1393, radius: 12000 },
  Berlín: { lat: 52.52, lng: 13.405, radius: 18000 },
  Berlin: { lat: 52.52, lng: 13.405, radius: 18000 },
  Viena: { lat: 48.2082, lng: 16.3738, radius: 12000 },
  Vienna: { lat: 48.2082, lng: 16.3738, radius: 12000 },
  Praga: { lat: 50.0755, lng: 14.4378, radius: 12000 },
  Prague: { lat: 50.0755, lng: 14.4378, radius: 12000 },
  Bruselas: { lat: 50.8503, lng: 4.3517, radius: 10000 },
  Brussels: { lat: 50.8503, lng: 4.3517, radius: 10000 },
  Dublín: { lat: 53.3498, lng: -6.2603, radius: 12000 },
  Dublin: { lat: 53.3498, lng: -6.2603, radius: 12000 },

  // Europa del Sur
  Atenas: { lat: 37.9838, lng: 23.7275, radius: DEFAULT_RADIUS },
  Athens: { lat: 37.9838, lng: 23.7275, radius: DEFAULT_RADIUS },
  Florencia: { lat: 43.7696, lng: 11.2558, radius: 8000 },
  Florence: { lat: 43.7696, lng: 11.2558, radius: 8000 },
  Venecia: { lat: 45.4408, lng: 12.3155, radius: 8000 },
  Venice: { lat: 45.4408, lng: 12.3155, radius: 8000 },
  Milán: { lat: 45.4642, lng: 9.19, radius: 12000 },
  Milan: { lat: 45.4642, lng: 9.19, radius: 12000 },

  // Europa del Este
  Budapest: { lat: 47.4979, lng: 19.0402, radius: 12000 },
  Varsovia: { lat: 52.2297, lng: 21.0122, radius: 12000 },
  Warsaw: { lat: 52.2297, lng: 21.0122, radius: 12000 },
  Cracovia: { lat: 50.0647, lng: 19.945, radius: 10000 },
  Krakow: { lat: 50.0647, lng: 19.945, radius: 10000 },

  // América del Norte
  'Nueva York': { lat: 40.7128, lng: -74.006, radius: 25000 },
  'New York': { lat: 40.7128, lng: -74.006, radius: 25000 },
  'Los Ángeles': { lat: 34.0522, lng: -118.2437, radius: 30000 },
  'Los Angeles': { lat: 34.0522, lng: -118.2437, radius: 30000 },
  'San Francisco': { lat: 37.7749, lng: -122.4194, radius: DEFAULT_RADIUS },
  Chicago: { lat: 41.8781, lng: -87.6298, radius: 20000 },
  Miami: { lat: 25.7617, lng: -80.1918, radius: DEFAULT_RADIUS },
  Washington: { lat: 38.9072, lng: -77.0369, radius: DEFAULT_RADIUS },
  Boston: { lat: 42.3601, lng: -71.0589, radius: 12000 },

  // América Latina
  'Ciudad de México': { lat: 19.4326, lng: -99.1332, radius: 25000 },
  'Mexico City': { lat: 19.4326, lng: -99.1332, radius: 25000 },
  'Buenos Aires': { lat: -34.6037, lng: -58.3816, radius: 20000 },
  'Río de Janeiro': { lat: -22.9068, lng: -43.1729, radius: 20000 },
  'Rio de Janeiro': { lat: -22.9068, lng: -43.1729, radius: 20000 },
  Lima: { lat: -12.0464, lng: -77.0428, radius: DEFAULT_RADIUS },
  Bogotá: { lat: 4.711, lng: -74.0721, radius: DEFAULT_RADIUS },
  Santiago: { lat: -33.4489, lng: -70.6693, radius: DEFAULT_RADIUS },

  // Asia
  Tokio: { lat: 35.6762, lng: 139.6503, radius: 25000 },
  Tokyo: { lat: 35.6762, lng: 139.6503, radius: 25000 },
  Bangkok: { lat: 13.7563, lng: 100.5018, radius: 18000 },
  Singapur: { lat: 1.3521, lng: 103.8198, radius: 12000 },
  Singapore: { lat: 1.3521, lng: 103.8198, radius: 12000 },
  'Hong Kong': { lat: 22.3193, lng: 114.1694, radius: 12000 },
  Seúl: { lat: 37.5665, lng: 126.978, radius: 20000 },
  Seoul: { lat: 37.5665, lng: 126.978, radius: 20000 },
  Dubái: { lat: 25.2048, lng: 55.2708, radius: DEFAULT_RADIUS },
  Dubai: { lat: 25.2048, lng: 55.2708, radius: DEFAULT_RADIUS },
  Estambul: { lat: 41.0082, lng: 28.9784, radius: 20000 },
  Istanbul: { lat: 41.0082, lng: 28.9784, radius: 20000 },

  // Oceanía
  Sídney: { lat: -33.8688, lng: 151.2093, radius: 18000 },
  Sydney: { lat: -33.8688, lng: 151.2093, radius: 18000 },
  Melbourne: { lat: -37.8136, lng: 144.9631, radius: DEFAULT_RADIUS },
  Auckland: { lat: -36.8485, lng: 174.7633, radius: 12000 },

  // África
  'El Cairo': { lat: 30.0444, lng: 31.2357, radius: 20000 },
  Cairo: { lat: 30.0444, lng: 31.2357, radius: 20000 },
  'Ciudad del Cabo': { lat: -33.9249, lng: 18.4241, radius: DEFAULT_RADIUS },
  'Cape Town': { lat: -33.9249, lng: 18.4241, radius: DEFAULT_RADIUS },
  Marrakech: { lat: 31.6295, lng: -7.9811, radius: 10000 },
};

/**
 * Cache en memoria para coordenadas geocodeadas dinámicamente
 * Evita llamar a Nominatim repetidamente para la misma ciudad
 */
const GEOCODED_CACHE = new Map();

/**
 * Obtiene POIs de una ciudad usando Overpass API
 * @param {string} cityName - Nombre de la ciudad
 * @param {Object} options - Opciones de búsqueda
 * @param {Array<string>} options.interests - Intereses del usuario
 * @param {number} options.limit - Límite de resultados
 * @param {number} options.radius - Radio de búsqueda en km
 * @returns {Promise<Array>} Array de POIs
 */
export async function fetchPOIsFromCity(cityName, options = {}) {
  const { interests = ['history', 'culture'], limit = 100 } = options;

  console.log(`[OSM] Fetching POIs for ${cityName}...`);
  console.log(`[OSM] Interests: ${interests.join(', ')}`);
  console.log(`[OSM] Limit: ${limit}`);

  try {
    // Obtener coordenadas de la ciudad (ahora async por geocoding)
    const cityCoords = await getCityCoordinates(cityName);

    console.log(
      `[OSM] Using coordinates: ${cityCoords.lat}, ${cityCoords.lng}, radius: ${cityCoords.radius}m`
    );

    // Construir query Overpass
    const query = buildOverpassQuery(cityCoords);

    // Ejecutar query con retry
    const data = await executeOverpassQuery(query);

    // Parsear y procesar resultados
    let pois = parseOverpassResponse(data);

    console.log(`[OSM] ✓ Found ${pois.length} POIs for ${cityName}`);

    // ❌ NO ENRIQUECER AQUÍ - Se hará después de seleccionar los POIs finales
    // para ahorrar llamadas a Wikipedia API
    console.log(
      '[OSM] POIs ready (enrichment will be done on selected POIs only)'
    );

    return pois;
  } catch (error) {
    console.error(`[OSM] ✗ Error fetching POIs:`, error.message);
    throw error;
  }
}

/**
 * Obtiene coordenadas de una ciudad con fallback a geocoding
 * Estrategia híbrida: cache local > geocoding dinámico
 * @private
 */
async function getCityCoordinates(cityName) {
  // 1. Intentar búsqueda directa en caché hardcodeado
  if (CITY_COORDINATES[cityName]) {
    console.log(`[OSM] ✓ Using cached coordinates for ${cityName}`);
    return CITY_COORDINATES[cityName];
  }

  // 2. Intentar variantes normalizadas (sin acentos)
  const normalized = cityName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalizedKey.toLowerCase() === normalized.toLowerCase()) {
      console.log(
        `[OSM] ✓ Using cached coordinates for ${cityName} (matched ${key})`
      );
      return coords;
    }
  }

  // 3. Verificar cache de geocoding dinámico
  if (GEOCODED_CACHE.has(cityName)) {
    const cached = GEOCODED_CACHE.get(cityName);
    const age = Date.now() - cached.timestamp;
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 días

    if (age < maxAge) {
      console.log(
        `[OSM] ✓ Using geocoded coordinates for ${cityName} (cached ${Math.floor(
          age / (24 * 60 * 60 * 1000)
        )} days ago)`
      );
      return cached.coords;
    } else {
      console.log(
        `[OSM] ⚠ Geocoded cache expired for ${cityName}, refreshing...`
      );
      GEOCODED_CACHE.delete(cityName);
    }
  }

  // 4. Intentar geocoding con Nominatim (OSM)
  console.log(`[OSM] 🌍 Geocoding ${cityName} with Nominatim...`);
  try {
    const coords = await geocodeCityWithNominatim(cityName);

    // Guardar en cache
    GEOCODED_CACHE.set(cityName, {
      coords,
      timestamp: Date.now(),
    });

    console.log(`[OSM] ✓ Geocoded ${cityName}: ${coords.lat}, ${coords.lng}`);
    return coords;
  } catch (geocodeError) {
    console.error(
      `[OSM] ✗ Geocoding failed for ${cityName}:`,
      geocodeError.message
    );
    throw new Error(
      `Cannot find coordinates for ${cityName}. Please check the city name.`
    );
  }
}

/**
 * Geocodifica una ciudad usando Nominatim (OpenStreetMap)
 * 100% gratuito, rate limit: 1 req/segundo
 * @private
 */
async function geocodeCityWithNominatim(cityName) {
  const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

  try {
    const response = await axios.get(NOMINATIM_ENDPOINT, {
      params: {
        q: cityName,
        format: 'json',
        limit: 1,
        addressdetails: 1,
      },
      headers: {
        'User-Agent': 'TripPlannerApp/1.0', // Nominatim requiere User-Agent
      },
      timeout: 10000,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error('No results from Nominatim');
    }

    const result = response.data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Determinar radio según tipo de lugar
    let radius = DEFAULT_RADIUS; // default desde .env
    console.log(`[GEOCODE] DEFAULT_RADIUS from env: ${DEFAULT_RADIUS}`);
    console.log(
      `[GEOCODE] City type: ${result.type}, population: ${result.addressdetails?.population}`
    );

    if (result.type === 'city' && result.addressdetails?.population) {
      const population = parseInt(result.addressdetails.population);
      console.log(`[GEOCODE] Population parsed: ${population}`);
      if (population > 5000000) radius = 25000; // mega-ciudad
      else if (population > 2000000) radius = 20000; // gran ciudad
      else if (population > 500000) radius = DEFAULT_RADIUS; // ciudad grande
      else radius = 10000; // ciudad pequeña
    }

    console.log(`[GEOCODE] Final radius selected: ${radius}`);
    return { lat, lng, radius };
  } catch (error) {
    if (error.response?.status === 429) {
      throw new Error(
        'Geocoding rate limit exceeded. Please try again in a moment.'
      );
    }
    throw error;
  }
}

/**
 * Construye query OverpassQL optimizada para POIs de ALTA CALIDAD
 * ESTRATEGIA: Solo POIs con Wikipedia = relevancia garantizada
 * @private
 */
function buildOverpassQuery(cityCoords) {
  const { lat, lng, radius } = cityCoords;

  // QUERY OPTIMIZADA: Solo POIs con Wikipedia (alta calidad garantizada)
  const query = `
    [out:json][timeout:180];
    (
      // NIVEL 1: Atracciones turísticas con Wikipedia (MÁS IMPORTANTES)
      node["tourism"="attraction"]["wikipedia"](around:${radius},${lat},${lng});
      way["tourism"="attraction"]["wikipedia"](around:${radius},${lat},${lng});
      relation["tourism"="attraction"]["wikipedia"](around:${radius},${lat},${lng});
      
      // NIVEL 2: Monumentos históricos con Wikipedia
      node["historic"="monument"]["wikipedia"](around:${radius},${lat},${lng});
      way["historic"="monument"]["wikipedia"](around:${radius},${lat},${lng});
      relation["historic"="monument"]["wikipedia"](around:${radius},${lat},${lng});
      
      // NIVEL 3: Museos con Wikipedia
      node["tourism"="museum"]["wikipedia"](around:${radius},${lat},${lng});
      way["tourism"="museum"]["wikipedia"](around:${radius},${lat},${lng});
      relation["tourism"="museum"]["wikipedia"](around:${radius},${lat},${lng});
      
      // NIVEL 4: Castillos, palacios con Wikipedia
      node["historic"="castle"]["wikipedia"](around:${radius},${lat},${lng});
      way["historic"="castle"]["wikipedia"](around:${radius},${lat},${lng});
      node["building"="palace"]["wikipedia"](around:${radius},${lat},${lng});
      way["building"="palace"]["wikipedia"](around:${radius},${lat},${lng});
      
      // NIVEL 5: Catedrales, iglesias importantes con Wikipedia
      node["building"="cathedral"]["wikipedia"](around:${radius},${lat},${lng});
      way["building"="cathedral"]["wikipedia"](around:${radius},${lat},${lng});
      node["building"="church"]["wikipedia"]["heritage"](around:${radius},${lat},${lng});
      way["building"="church"]["wikipedia"]["heritage"](around:${radius},${lat},${lng});
      
      // NIVEL 6: Parques importantes con Wikipedia
      node["leisure"="park"]["wikipedia"]["name"](around:${radius},${lat},${lng});
      way["leisure"="park"]["wikipedia"]["name"](around:${radius},${lat},${lng});
      relation["leisure"="park"]["wikipedia"]["name"](around:${radius},${lat},${lng});
      
      // NIVEL 7: Plazas históricas con Wikipedia
      node["place"="square"]["wikipedia"](around:${radius},${lat},${lng});
      way["place"="square"]["wikipedia"](around:${radius},${lat},${lng});
      
      // NIVEL 8: Calles históricas/famosas con Wikipedia
      way["highway"]["wikipedia"]["name"](around:${radius},${lat},${lng});
      
      // NIVEL 9: Barrios históricos/famosos con Wikipedia
      node["place"="neighbourhood"]["wikipedia"](around:${radius},${lat},${lng});
      way["place"="neighbourhood"]["wikipedia"](around:${radius},${lat},${lng});
      relation["place"="neighbourhood"]["wikipedia"](around:${radius},${lat},${lng});
      
      // 🆕 NIVEL 10: Mercados famosos con Wikipedia (Camden Market, Mercado de la Boquería, etc.)
      node["amenity"="marketplace"]["wikipedia"](around:${radius},${lat},${lng});
      way["amenity"="marketplace"]["wikipedia"](around:${radius},${lat},${lng});
      relation["amenity"="marketplace"]["wikipedia"](around:${radius},${lat},${lng});
      
      // 🆕 NIVEL 11: Galerías de arte con Wikipedia
      node["tourism"="gallery"]["wikipedia"](around:${radius},${lat},${lng});
      way["tourism"="gallery"]["wikipedia"](around:${radius},${lat},${lng});
      
      // 🆕 NIVEL 12: Teatros y óperas con Wikipedia
      node["amenity"="theatre"]["wikipedia"](around:${radius},${lat},${lng});
      way["amenity"="theatre"]["wikipedia"](around:${radius},${lat},${lng});
      
      // 🆕 NIVEL 13: Puentes famosos con Wikipedia
      way["man_made"="bridge"]["wikipedia"](around:${radius},${lat},${lng});
      
      // 🆕 NIVEL 14: Torres famosas con Wikipedia
      node["man_made"="tower"]["wikipedia"](around:${radius},${lat},${lng});
      way["man_made"="tower"]["wikipedia"](around:${radius},${lat},${lng});
    );
    out center tags;
  `;

  console.log('[OSM] Query:', query.substring(0, 200) + '...');
  return query.trim();
}

/**
 * Ejecuta query Overpass con retry
 * @private
 */
async function executeOverpassQuery(query, retryCount = 0) {
  try {
    const response = await axios.post(OVERPASS_ENDPOINT, query, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: TIMEOUT,
    });

    return response.data;
  } catch (error) {
    console.error(
      `[OSM] Query failed (attempt ${retryCount + 1}/${MAX_RETRIES}):`,
      error.message
    );

    // Retry con backoff exponencial
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
      console.log(`[OSM] Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return executeOverpassQuery(query, retryCount + 1);
    }

    throw new Error(
      `Overpass API failed after ${MAX_RETRIES} retries: ${error.message}`
    );
  }
}

/**
 * Parsea respuesta de Overpass API a formato estándar
 * @private
 */
function parseOverpassResponse(data) {
  if (!data?.elements || !Array.isArray(data.elements)) {
    console.warn('[OSM] Invalid response format');
    return [];
  }

  let pois = [];

  for (const element of data.elements) {
    try {
      const poi = parseOSMElement(element);
      if (poi) {
        pois.push(poi);
      }
    } catch (error) {
      console.warn('[OSM] Error parsing element:', error.message);
    }
  }

  // Filtrar ruido
  pois = pois.filter((poi) => !isNoisyPOI(poi));

  // Calcular score de relevancia
  pois = pois.map((poi) => ({
    ...poi,
    relevanceScore: calculateRelevanceScore(poi),
  }));

  // Ordenar por relevancia (mayor a menor)
  pois.sort((a, b) => b.relevanceScore - a.relevanceScore);

  console.log(`[OSM] After filtering: ${pois.length} high-quality POIs`);
  if (pois.length > 0) {
    console.log(
      `[OSM] Top POI: ${pois[0].name} (score: ${pois[0].relevanceScore})`
    );
  }

  return pois;
}

/**
 * Parsea un elemento individual de OSM
 * @private
 */
function parseOSMElement(element) {
  const { id, tags, lat, lon, center } = element;

  // Validar que tiene nombre
  if (!tags?.name) {
    return null;
  }

  // Obtener coordenadas
  let coordinates;
  if (lat && lon) {
    coordinates = { lat, lng: lon };
  } else if (center?.lat && center?.lon) {
    coordinates = { lat: center.lat, lng: center.lon };
  } else {
    return null; // Sin coordenadas, descartar
  }

  // Validar coordenadas
  if (!isValidCoordinates(coordinates)) {
    return null;
  }

  // Determinar tipo de POI
  const type = determinePOIType(tags);

  // Construir POI
  return {
    id: `osm-${id}`,
    name: tags.name,
    type,
    coordinates,
    openingHours: tags.opening_hours || null,
    website: tags.website || null,
    wikipedia:
      tags.wikipedia || tags['wikipedia:es'] || tags['wikipedia:en'] || null,
    phone: tags.phone || null,
    cuisine: tags.cuisine || null,
    rating: null, // OSM no tiene ratings (usaremos Wikidata o Google Places)
    source: 'OpenStreetMap',
    osmId: id,
    rawTags: tags, // Guardar tags originales para debugging
  };
}

/**
 * Determina el tipo de POI basado en tags
 * @private
 */
function determinePOIType(tags) {
  // 🆕 Calles y barrios históricos
  if (tags.highway && tags.wikipedia) {
    return 'street'; // Gran Vía, Calle Laurel, etc.
  }
  if (tags.place === 'neighbourhood' && tags.wikipedia) {
    return 'neighbourhood'; // Chueca, Malasaña, Camden, etc.
  }

  // 🆕 Mercados
  if (tags.amenity === 'marketplace') {
    return 'market'; // Camden Market, Mercado de la Boquería, etc.
  }

  // 🆕 Puentes y torres
  if (tags.man_made === 'bridge') {
    return 'bridge'; // Tower Bridge, Puente de Brooklyn, etc.
  }
  if (tags.man_made === 'tower') {
    return 'tower'; // Torre Eiffel, Big Ben, etc.
  }

  // Prioridad: tourism > historic > amenity > leisure
  if (tags.tourism) {
    return tags.tourism; // museum, attraction, gallery, etc.
  }
  if (tags.historic) {
    return 'historic'; // monument, castle, memorial
  }
  if (tags.amenity) {
    if (['restaurant', 'cafe', 'bar'].includes(tags.amenity)) {
      return 'food';
    }
    if (tags.amenity === 'theatre') {
      return 'theatre';
    }
    return tags.amenity;
  }
  if (tags.leisure) {
    return tags.leisure; // park, garden, etc.
  }
  if (tags.natural) {
    return 'nature';
  }
  return 'attraction'; // default
}

/**
 * Calcula score de relevancia de un POI
 * CLAVE: POIs con Wikipedia son de mayor calidad
 * Métodos universales basados en datos OSM
 * @private
 */
function calculateRelevanceScore(poi) {
  let score = 0;

  // FACTOR 1: Tiene Wikipedia (MUY IMPORTANTE)
  if (poi.wikipedia) {
    score += 50; // Bonus grande

    // Bonus por número de idiomas en Wikipedia (indicador de relevancia mundial)
    const tags = poi.rawTags || {};
    const wikipediaLangs = Object.keys(tags).filter((k) =>
      k.startsWith('wikipedia:')
    ).length;
    score += wikipediaLangs * 5; // +5 por cada idioma
  }

  // FACTOR 2: Tipo de POI (prioridad basada en turismo)
  const typePriority = {
    attraction: 20,
    monument: 18,
    museum: 18,
    castle: 16,
    cathedral: 16,
    palace: 15,
    historic: 15,
    market: 16, // 🔥 AUMENTADO de 14 a 16 (mercados son muy populares)
    bridge: 13, // 🆕 Puentes icónicos (Tower Bridge, Brooklyn Bridge, etc.)
    tower: 13, // 🆕 Torres famosas (Big Ben, Torre Eiffel, etc.)
    gallery: 12, // 🆕 Galerías de arte
    theatre: 12, // 🆕 Teatros y óperas
    street: 12, // Calles históricas
    neighbourhood: 10, // Barrios históricos
    park: 10,
    plaza: 12,
    square: 12,
    church: 8,
  };
  score += typePriority[poi.type] || 5;

  // 🔥 BONUS ESPECIAL: Si es un mercado Y tiene tourism=attraction
  if (poi.type === 'market' && poi.rawTags?.tourism === 'attraction') {
    score += 30; // 🔥 AUMENTADO de 25 a 30 para mercados turísticos muy famosos
  }

  // 🔥 BONUS ADICIONAL: Mercados con múltiples características de calidad
  if (poi.type === 'market') {
    // +10 si tiene website oficial
    if (poi.website) score += 10;
    // +10 si tiene horarios de apertura
    if (poi.rawTags?.opening_hours) score += 10;
    // +5 si tiene email de contacto
    if (poi.rawTags?.email) score += 5;
  }

  // FACTOR 3: Tiene nombre en múltiples idiomas (relevancia internacional)
  if (poi.rawTags) {
    const nameKeys = Object.keys(poi.rawTags).filter((k) =>
      k.startsWith('name:')
    );
    score += nameKeys.length * 2; // +2 por cada traducción
  }

  // FACTOR 4: Tiene website oficial (indica POI bien documentado)
  if (poi.website) score += 3;

  // FACTOR 5: Es patrimonio UNESCO (heritage)
  if (poi.rawTags?.heritage || poi.rawTags?.['heritage:operator']) {
    score += 20;
  }

  // FACTOR 6: Tiene wikidata ID (datos estructurados)
  if (poi.rawTags?.wikidata) {
    score += 10;
  }

  // FACTOR 7: Ranking en Wikipedia (si existe)
  if (poi.rawTags?.['wikipedia:importance']) {
    score += parseInt(poi.rawTags['wikipedia:importance']) || 0;
  }

  // FACTOR 8: Es tourism=attraction (tag específico OSM)
  if (poi.rawTags?.tourism === 'attraction') {
    score += 15;
  }

  // FACTOR 9: Tiene image en Wikimedia
  if (poi.rawTags?.wikimedia_commons || poi.rawTags?.image) {
    score += 5;
  }

  return score;
}

/**
 * Filtra POIs de baja calidad o ruido
 * @private
 */
function isNoisyPOI(poi) {
  const name = poi.name?.toLowerCase() || '';
  const tags = poi.rawTags || {};

  // Filtrar hoteles, tiendas, restaurantes genéricos
  if (tags.tourism === 'hotel') return true;
  if (tags.shop) return true;
  if (tags.amenity === 'restaurant' && !poi.wikipedia) return true;
  if (tags.amenity === 'cafe' && !poi.wikipedia) return true;

  // Filtrar escuelas, hospitales
  if (tags.amenity === 'school') return true;
  if (tags.amenity === 'hospital') return true;
  if (tags.amenity === 'university' && !poi.wikipedia) return true;

  // Filtrar nombres muy genéricos sin Wikipedia
  if (
    !poi.wikipedia &&
    (name.includes('parking') ||
      name.includes('hotel') ||
      name.includes('hostel') ||
      name.includes('shop') ||
      name.includes('store'))
  ) {
    return true;
  }

  return false;
}

/**
 * Busca restaurantes cercanos a unas coordenadas
 * @param {Object} coordinates - {lat, lng}
 * @param {number} radiusMeters - Radio de búsqueda en metros
 * @returns {Promise<Array>} Array de restaurantes
 */
/**
 * Busca landmarks específicos por nombre exacto
 * Útil cuando la IA recomienda landmarks icónicos conocidos
 * @param {string} landmarkName - Nombre del landmark (ej: "Palacio Real de Madrid")
 * @param {string} cityName - Ciudad para acotar búsqueda
 * @returns {Promise<Object|null>} POI encontrado o null
 */
export async function searchLandmarkByName(landmarkName, cityName) {
  console.log(
    `[OSM] Searching for specific landmark: "${landmarkName}" in ${cityName}`
  );

  const cityCoords = CITY_COORDINATES[cityName];
  if (!cityCoords) {
    console.warn(`[OSM] City ${cityName} not in cache, using wider search`);
  }

  const query = cityCoords
    ? `
    [out:json][timeout:60];
    (
      node["name"~"${sanitizeForRegex(landmarkName)}",i](around:${
        cityCoords.radius
      },${cityCoords.lat},${cityCoords.lng});
      way["name"~"${sanitizeForRegex(landmarkName)}",i](around:${
        cityCoords.radius
      },${cityCoords.lat},${cityCoords.lng});
      relation["name"~"${sanitizeForRegex(landmarkName)}",i](around:${
        cityCoords.radius
      },${cityCoords.lat},${cityCoords.lng});
    );
    out center 5;
  `
    : `
    [out:json][timeout:60];
    (
      node["name"~"${sanitizeForRegex(landmarkName)}",i];
      way["name"~"${sanitizeForRegex(landmarkName)}",i];
    );
    out center 5;
  `;

  try {
    const data = await executeOverpassQuery(query);
    const results = parseOverpassResponse(data);

    if (results.length > 0) {
      // Buscar el mejor match (nombre más similar)
      const bestMatch = results.reduce((best, current) => {
        const currentScore = similarity(
          current.name.toLowerCase(),
          landmarkName.toLowerCase()
        );
        const bestScore = similarity(
          best.name.toLowerCase(),
          landmarkName.toLowerCase()
        );
        return currentScore > bestScore ? current : best;
      });

      console.log(
        `[OSM] ✓ Found landmark: "${bestMatch.name}" (${bestMatch.type})`
      );
      return bestMatch;
    }

    console.warn(`[OSM] Landmark "${landmarkName}" not found in OSM`);
    return null;
  } catch (error) {
    console.error(
      `[OSM] Error searching landmark "${landmarkName}":`,
      error.message
    );
    return null;
  }
}

/**
 * Busca múltiples landmarks en batch
 * @param {Array<string>} landmarkNames - Array de nombres de landmarks
 * @param {string} cityName - Ciudad
 * @returns {Promise<Array>} Array de POIs encontrados
 */
export async function searchMultipleLandmarks(landmarkNames, cityName) {
  console.log(
    `[OSM] Searching for ${landmarkNames.length} landmarks in ${cityName}...`
  );

  const results = [];

  // Procesar en paralelo pero con límite para no saturar
  const batchSize = 3;
  for (let i = 0; i < landmarkNames.length; i += batchSize) {
    const batch = landmarkNames.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((name) => searchLandmarkByName(name, cityName))
    );

    results.push(...batchResults.filter((r) => r !== null));

    // Pausa entre batches
    if (i + batchSize < landmarkNames.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(
    `[OSM] ✓ Found ${results.length}/${landmarkNames.length} landmarks`
  );
  return results;
}

/**
 * Sanitiza string para uso en regex de Overpass
 * @private
 */
function sanitizeForRegex(str) {
  return str
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escapar caracteres especiales
    .replace(/\s+/g, '.*'); // Permitir espacios variables
}

/**
 * Calcula similitud entre dos strings (simple)
 * @private
 */
function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Distancia de Levenshtein (edición)
 * @private
 */
function levenshtein(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export async function findNearbyRestaurants(coordinates, radiusMeters = 1000) {
  console.log(
    `[OSM] Finding restaurants near ${coordinates.lat}, ${coordinates.lng}`
  );

  const query = `
    [out:json][timeout:60];
    (
      node["amenity"="restaurant"](around:${radiusMeters},${coordinates.lat},${coordinates.lng});
      node["amenity"="cafe"](around:${radiusMeters},${coordinates.lat},${coordinates.lng});
    );
    out center 20;
  `;

  try {
    const data = await executeOverpassQuery(query);
    const restaurants = parseOverpassResponse(data);

    console.log(`[OSM] ✓ Found ${restaurants.length} restaurants nearby`);
    return restaurants;
  } catch (error) {
    console.error('[OSM] Error finding restaurants:', error.message);
    return [];
  }
}

/**
 * Obtiene información detallada de un POI por su ID de OSM
 * @param {string|number} osmId - ID del elemento en OSM
 * @returns {Promise<Object|null>} POI detallado
 */
export async function getPOIDetails(osmId) {
  console.log(`[OSM] Fetching details for OSM ID: ${osmId}`);

  const query = `
    [out:json][timeout:30];
    (
      node(${osmId});
      way(${osmId});
    );
    out center;
  `;

  try {
    const data = await executeOverpassQuery(query);
    const pois = parseOverpassResponse(data);

    if (pois.length > 0) {
      console.log(`[OSM] ✓ Found details for ${pois[0].name}`);
      return pois[0];
    }

    console.warn(`[OSM] No details found for OSM ID ${osmId}`);
    return null;
  } catch (error) {
    console.error('[OSM] Error fetching POI details:', error.message);
    return null;
  }
}

/**
 * Enriquece POIs SELECCIONADOS con descripciones y tips de Wikipedia
 * OPTIMIZACIÓN: Solo procesar los POIs que realmente se van a mostrar
 * MEJORADO: Procesamiento en batches más eficiente
 * @param {Array} pois - Array de POIs seleccionados
 * @returns {Promise<void>} Modifica los POIs in-place
 */
export async function enrichPOIsWithDescriptions(pois) {
  console.log(
    `[WIKIPEDIA] Enriching ${pois.length} SELECTED POIs with descriptions and tips...`
  );

  const BATCH_SIZE = 8; // Aumentado de 5 a 8 para más paralelismo
  let enrichedCount = 0;
  let tipsCount = 0;
  const startTime = Date.now();

  // Filtrar POIs que tienen Wikipedia
  const poisWithWikipedia = pois.filter((p) => p.wikipedia);
  console.log(
    `[WIKIPEDIA] Processing ${poisWithWikipedia.length}/${pois.length} POIs with Wikipedia tags`
  );

  for (let i = 0; i < poisWithWikipedia.length; i += BATCH_SIZE) {
    const batch = poisWithWikipedia.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (poi) => {
        try {
          // Ejecutar en paralelo: descripción + tips
          const [wikiData, practicalInfo] = await Promise.all([
            fetchWikipediaExtract(poi.wikipedia),
            fetchWikipediaPracticalInfo(poi.wikipedia),
          ]);

          // Asignar descripción
          if (wikiData && wikiData.extract && wikiData.extract.length > 50) {
            poi.wikipediaDescription = wikiData.extract;
            enrichedCount++;
          }

          // Asignar tips
          if (practicalInfo && practicalInfo.length > 0) {
            poi.wikipediaTips = practicalInfo;
            tipsCount++;
          }
        } catch {
          // Silenciar errores individuales
        }
      })
    );

    // Pequeña pausa entre batches para no saturar Wikipedia API
    if (i + BATCH_SIZE < poisWithWikipedia.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[WIKIPEDIA] ✓ Enriched ${enrichedCount}/${pois.length} POIs with descriptions in ${totalTime}s`
  );
  console.log(
    `[WIKIPEDIA] ✓ Added practical tips to ${tipsCount}/${pois.length} POIs`
  );
}

/**
 * Obtiene imágenes de Wikipedia + Commons + Wikidata para POIs seleccionados
 * MEJORADO: Procesamiento paralelo más eficiente
 * @param {Array} pois - Array de POIs con campo 'wikipedia' y 'name'
 * @returns {Promise<void>} Modifica los POIs añadiendo campo 'wikipediaImages' (array)
 */
export async function enrichPOIsWithImages(pois) {
  console.log(
    `[WIKIPEDIA] Fetching images from Wikipedia + Wikidata for ${pois.length} selected POIs...`
  );

  const BATCH_SIZE = 8; // Aumentado para más paralelismo
  let poisWithImages = 0;
  let totalImages = 0;
  const startTime = Date.now();

  // Filtrar POIs que tienen Wikipedia
  const poisWithWikipedia = pois.filter((p) => p.wikipedia);
  console.log(
    `[WIKIPEDIA] Processing ${poisWithWikipedia.length}/${pois.length} POIs with Wikipedia tags`
  );

  for (let i = 0; i < poisWithWikipedia.length; i += BATCH_SIZE) {
    const batch = poisWithWikipedia.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (poi) => {
        const images = await fetchWikipediaImages(poi.wikipedia);
        if (images.length > 0) {
          poi.wikipediaImages = images;
          poisWithImages++;
          totalImages += images.length;
        }
      })
    );

    // Pequeña pausa entre batches
    if (i + BATCH_SIZE < poisWithWikipedia.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(
    `[WIKIPEDIA] ✓ Added ${totalImages} images to ${poisWithImages}/${
      pois.length
    } POIs in ${totalTime}s (avg: ${
      poisWithImages > 0 ? (totalImages / poisWithImages).toFixed(1) : 0
    } per POI)`
  );
}

export default {
  fetchPOIsFromCity,
  findNearbyRestaurants,
  getPOIDetails,
  searchLandmarkByName,
  searchMultipleLandmarks,
  enrichPOIsWithImages,
  enrichPOIsWithDescriptions,
};

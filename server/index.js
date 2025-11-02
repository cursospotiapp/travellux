/* Simple Express server to call Gemma 27B IT via OpenRouter and return structured trip JSON */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import smartPOIService from './services/smartPOIService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787; // backend
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-1.5-flash';

// Cache en memoria para respuestas
const responseCache = new Map();
const CACHE_TTL = 3600000; // 1 hora en ms

app.use(cors({ origin: true }));

// Convertir fecha de dd/mm/yyyy o yyyy-mm-dd a objeto Date
function parseDate(dateStr) {
  if (!dateStr) return null;

  // Si ya es formato yyyy-mm-dd, usar Date.UTC para evitar problemas de zona horaria
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Si es formato dd/mm/yyyy, convertir usando Date.UTC
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Intentar parsear de todas formas
  return new Date(dateStr);
}

// Formatear fecha a yyyy-mm-dd (siempre en UTC)
function formatDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date)) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Factory para crear modelo con configuración optimizada
function getModel(temperature = 0.7, maxTokens = 800) {
  console.log(
    `[MODEL] Creating model instance: temp=${temperature}, maxTokens=${maxTokens}`
  );
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const isGemini = /^gemini/i.test(MODEL_NAME);

  return genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(isGemini ? { responseMimeType: 'application/json' } : {}),
    },
    ...(isGemini
      ? {
          systemInstruction:
            'You are a trip planner assistant. Return ONLY valid JSON. ALL text content must be in Spanish (es-ES). Property names stay in English.',
        }
      : {}),
  });
}

app.use(express.json());
function parseJSON(text) {
  if (!text) {
    console.warn('[PARSE] Empty text received');
    return null;
  }

  // Helper to attempt JSON.parse and return null on failure
  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // 1) Direct parse
  const direct = tryParse(text);
  if (direct) {
    console.log('[PARSE] ✓ Direct JSON parse successful');
    return direct;
  }

  // 2) Extract fenced code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const cb = codeBlockMatch[1];
    const p = tryParse(cb);
    if (p) {
      console.log('[PARSE] ✓ Extraction from code block successful');
      return p;
    }
    text = cb; // continue with the extracted block
  }

  // 3) Find first JSON-like structure
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!jsonMatch) {
    console.error('[PARSE] ✗ No JSON structure found in text');
    return null;
  }

  let jsonText = jsonMatch[1];

  // 3a) Direct parse of candidate
  const directCandidate = tryParse(jsonText);
  if (directCandidate) {
    console.log('[PARSE] ✓ JSON structure parse successful');
    return directCandidate;
  }

  // 4) Light cleanup: remove stray newlines, trailing commas, fix unquoted keys, single->double quotes
  console.log('[PARSE] Attempting aggressive repair (light)');
  let cleaned = jsonText
    .replace(/\r?\n/g, ' ') // remove raw newlines
    .replace(/,\s*([}\]])/g, '$1') // remove trailing commas
    .replace(/([,{[]\s*)([A-Za-z0-9_-]+)\s*:/g, '$1"$2":') // quote keys
    .replace(/'([^']*)'/g, '"$1"') // single to double
    .replace(new RegExp(String.fromCharCode(0), 'g'), '');

  const parsedCleaned = tryParse(cleaned);
  if (parsedCleaned) {
    console.log('[PARSE] ✓ Repair successful (light)');
    return parsedCleaned;
  }

  console.log('[PARSE] Light repair failed, attempting targeted fixes...');

  // 5) Targeted fixes based on error position heuristics
  // Extract numeric position from common error messages
  const extractPos = (msg) => {
    const m = msg && msg.match(/position\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  };

  // Try to parse and capture exception message to guide repairs
  try {
    JSON.parse(cleaned);
  } catch (err) {
    const pos = extractPos(err.message);
    if (pos && pos > 0 && pos < cleaned.length) {
      // Try inserting a closing quote at pos and nearby offsets
      for (let delta = 0; delta <= 5; delta++) {
        for (const sign of [0, -1, 1]) {
          const i = Math.max(0, Math.min(cleaned.length, pos + sign * delta));
          // Insert a closing quote
          const attempt = cleaned.slice(0, i) + '"' + cleaned.slice(i);
          const p = tryParse(attempt);
          if (p) {
            console.log(
              '[PARSE] ✓ Targeted repair successful by inserting a quote at',
              i
            );
            return p;
          }

          // Insert a comma then try
          const attempt2 = cleaned.slice(0, i) + ',' + cleaned.slice(i);
          const p2 = tryParse(attempt2);
          if (p2) {
            console.log(
              '[PARSE] ✓ Targeted repair successful by inserting a comma at',
              i
            );
            return p2;
          }
        }
      }
    }
  }

  // 6) As last resort, truncation repair like before but with better logging
  console.log('[PARSE] Attempting truncation repair...');
  for (let i = jsonText.length - 1; i > Math.floor(jsonText.length / 2); i--) {
    const truncated = jsonText.substring(0, i);
    let closed = truncated;
    if (truncated.trim().endsWith(',')) {
      closed = truncated.trim().slice(0, -1);
    }
    const openBraces = (closed.match(/\{/g) || []).length;
    const closeBraces = (closed.match(/\}/g) || []).length;
    const openBrackets = (closed.match(/\[/g) || []).length;
    const closeBrackets = (closed.match(/\]/g) || []).length;
    closed += '}'.repeat(Math.max(0, openBraces - closeBraces));
    closed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
    try {
      const result = JSON.parse(closed);
      console.log(
        '[PARSE] ✓ Truncation repair successful (truncated at',
        i,
        ')'
      );
      console.log('[PARSE] NOTE: Result may be partial due to truncation');
      return result;
    } catch {
      // continue
    }
  }

  console.error('[PARSE] ✗ All repair attempts failed. Showing preview:');
  console.error(jsonText.substring(0, 400));
  return null;
}
// Generación con retry automático
async function generateWithRetry(model, prompt, partName, maxRetries = 2) {
  console.log(
    `[RETRY] Starting generation for "${partName}", max retries: ${maxRetries}`
  );
  for (let i = 0; i <= maxRetries; i++) {
    try {
      console.log(
        `[RETRY] Attempt ${i + 1}/${maxRetries + 1} for "${partName}"`
      );
      const tLabel = `gen_${partName}_attempt_${i + 1}`;
      console.time(tLabel);
      const result = await model.generateContent(prompt);
      console.timeEnd(tLabel);

      const text = result?.response?.text?.() || '';
      console.log(`[RETRY] Received ${text.length} chars for "${partName}"`);

      const parsed = parseJSON(text);
      if (parsed) {
        console.log(`[RETRY] ✓ Success for "${partName}" on attempt ${i + 1}`);
        return parsed;
      }

      if (i === maxRetries) {
        console.error(
          `[RETRY] ✗ Failed to parse "${partName}" after all retries. Text preview:`,
          text.substring(0, 200)
        );
        return null;
      }
      console.warn(`[RETRY] Parse failed for "${partName}", retrying...`);
    } catch (err) {
      console.error(
        `[RETRY] ✗ Error on attempt ${i + 1} for "${partName}":`,
        err.message
      );
      if (i === maxRetries) {
        console.error(
          `[RETRY] Giving up on "${partName}" after ${maxRetries + 1} attempts`
        );
        return null;
      }
      const backoffMs = 1000 * (i + 1);
      console.log(`[RETRY] Waiting ${backoffMs}ms before retry...`);
      await new Promise((r) => setTimeout(r, backoffMs)); // Backoff
    }
  }
  return null;
}

// ============================================================================
// ENDPOINTS
// ============================================================================

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// 🔥 ENDPOINT OPTIMIZADO: Sin IA, solo POIs de Wikipedia
app.post('/api/generate-trip-fast', async (req, res) => {
  console.log('\n[FAST] ========== WIKIPEDIA-ONLY GENERATION ==========');
  console.time('total_request');

  try {
    const { preferences } = req.body || {};
    const { destination, startDate, endDate, intensity } = preferences || {};

    console.log('[FAST] Preferences:', JSON.stringify(preferences, null, 2));

    // Check cache
    const cacheKey = JSON.stringify(preferences);
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[FAST] ✓ Cache hit!');
      console.timeEnd('total_request');
      return res.json({ ok: true, data: cached.data, cached: true });
    }

    // Calcular días
    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start || !end || isNaN(start) || isNaN(end)) {
      console.error('[FAST] ✗ Invalid dates');
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    console.log(`[FAST] Trip: ${days} days, intensity: ${intensity}`);

    // 🔥 OBTENER POIs CON ALGORITMO WIKIPEDIA
    console.log('[FAST] Fetching Wikipedia POIs...');
    console.time('poi_algorithm');

    const poiResult = await smartPOIService.getPOIsForTrip(destination, {
      interests: preferences.interests || ['history', 'art'],
      intensity: intensity || 'balanced',
      days: days,
    });

    console.timeEnd('poi_algorithm');

    if (!poiResult || !poiResult.dayByDay) {
      throw new Error('Failed to fetch POIs');
    }

    console.log(
      `[FAST] ✓ ${poiResult.stats.total} POIs (avg score: ${poiResult.stats.avgRelevanceScore})`
    );

    // 🔥 CONVERTIR POIs A FORMATO DE EVENTOS (SIN IA)
    console.log('[FAST] Converting POIs to events...');
    const itinerary = [];

    // Helper para generar descripciones DINÁMICAS basadas en datos OSM
    const generateSpanishDescription = (poi, destination) => {
      // 🔥 PRIORIDAD 1: Usar descripción REAL de Wikipedia si existe
      if (poi.wikipediaDescription && poi.wikipediaDescription.length > 100) {
        return poi.wikipediaDescription;
      }

      // ❌ SI NO HAY DESCRIPCIÓN DE WIKIPEDIA, DEVOLVER NOMBRE SIMPLE
      // Mejor vacío que basura genérica
      return `${poi.name} - ${destination}`;
    };

    // Helper para generar tips DINÁMICOS basados en el POI
    const generateSpanishTips = (poi) => {
      const tags = poi.rawTags || {};
      const tips = [];

      // ✅ SOLO INFORMACIÓN REAL Y ESPECÍFICA DEL POI

      // 1️⃣ Tips desde Wikipedia (información práctica REAL)
      if (poi.wikipediaTips && poi.wikipediaTips.length > 0) {
        tips.push(...poi.wikipediaTips);
      }

      // 2️⃣ Horarios REALES desde OSM
      if (tags.opening_hours) {
        const hours = tags.opening_hours;
        if (hours.includes('24/7')) {
          tips.push('⏰ Abierto 24 horas');
        } else if (hours.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/)) {
          const match = hours.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
          tips.push(`⏰ Horario: ${match[1]} - ${match[2]}`);
        } else if (hours.match(/Mo-Su/)) {
          tips.push('⏰ Abierto todos los días');
        } else if (hours.match(/Mo-Fr/)) {
          tips.push('⏰ Solo entre semana');
        }
      }

      // 3️⃣ Entrada gratuita o precio REAL desde OSM
      if (tags.fee === 'no' || tags.charge === 'no') {
        tips.push('✨ Entrada gratuita');
      } else if (tags.charge) {
        // Solo mostrar si hay precio específico
        tips.push(`💰 ${tags.charge}`);
      }

      // 4️⃣ UNESCO/Patrimonio
      if (tags['unesco:inscription_date']) {
        tips.push(`🏛️ Patrimonio UNESCO (${tags['unesco:inscription_date']})`);
      } else if (tags.heritage === 'yes' || tags['heritage:operator']) {
        tips.push('🏛️ Patrimonio histórico');
      }

      // 5️⃣ Arquitecto/Diseñador
      if (tags.architect) {
        tips.push(`👨‍🎨 Obra de ${tags.architect}`);
      }

      // 6️⃣ Año de construcción
      if (tags.start_date && tags.start_date.match(/^\d{4}$/)) {
        tips.push(`📅 Construido en ${tags.start_date}`);
      } else if (tags['building:age'] || tags.year) {
        const year = tags['building:age'] || tags.year;
        if (year.match(/^\d{4}$/)) {
          tips.push(`📅 Del año ${year}`);
        }
      }

      // 7️⃣ Accesibilidad SOLO si está documentada
      if (tags.wheelchair === 'yes') {
        tips.push('♿ Accesible');
      } else if (tags.wheelchair === 'no') {
        tips.push('♿ No accesible');
      }

      // 8️⃣ Web oficial SOLO si NO hay otros tips
      if (tips.length === 0 && (poi.website || tags.website)) {
        tips.push('🌐 Consulta web oficial para más información');
      }

      // ❌ NO TIPS GENÉRICOS - Si no hay información real, mejor vacío
      return tips.slice(0, 3);
    };

    // Helper para calcular distancia entre dos coordenadas (fórmula de Haversine)
    const calculateDistance = (coord1, coord2) => {
      const R = 6371; // Radio de la Tierra en km
      const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
      const dLon = ((coord2.lng - coord1.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((coord1.lat * Math.PI) / 180) *
          Math.cos((coord2.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distancia en km
    };

    // Helper para calcular tiempo de viaje estimado
    const calculateTravelTime = (distance) => {
      // Velocidad promedio caminando: 5 km/h
      const walkingSpeed = 5;
      const minutes = Math.round((distance / walkingSpeed) * 60);

      if (minutes <= 5) return `${minutes} min caminando`;
      if (minutes <= 15) return `${minutes} min caminando`;
      if (minutes <= 30) return `${minutes} min (metro recomendado)`;
      return `${Math.round(minutes / 5) * 5} min en transporte`;
    };

    Object.keys(poiResult.dayByDay).forEach((dayKey, index) => {
      const dayData = poiResult.dayByDay[dayKey];
      const date = new Date(start);
      date.setDate(date.getDate() + index);

      const events = dayData.pois.map((poi, idx) => {
        // Calcular tiempo AL SIGUIENTE POI (no del anterior)
        let travelTime = '';
        if (idx < dayData.pois.length - 1) {
          // Si NO es el último POI, calcular distancia al siguiente
          const nextPOI = dayData.pois[idx + 1];
          const distance = calculateDistance(
            poi.coordinates,
            nextPOI.coordinates
          );
          travelTime = calculateTravelTime(distance);
        } else {
          // Último POI del día no tiene "siguiente"
          travelTime = '';
        }

        return {
          id: `evt-${index + 1}-${idx + 1}`,
          time: `${9 + idx * 2}:00`,
          duration: '2h',
          title: poi.name,
          description: generateSpanishDescription(poi, destination),
          type: poi.type || 'Atracción',
          location: {
            name: poi.name,
            address: poi.address || `${destination}`,
            coordinates: poi.coordinates,
          },
          price: {
            amount: poi.price || 15,
            currency: 'EUR',
          },
          images:
            poi.wikipediaImages && poi.wikipediaImages.length > 0
              ? poi.wikipediaImages
              : ['https://placehold.co/600x400'],
          tips: generateSpanishTips(poi),
          travelTime: travelTime,
        };
      });

      itinerary.push({
        dayNumber: index + 1,
        date: formatDate(date),
        title: `Día ${index + 1} en ${destination}`,
        description: `Explora ${dayData.zone}`,
        events: events,
      });
    });

    console.log(
      `[FAST] ✓ Generated ${itinerary.length} days with ${itinerary.reduce(
        (sum, d) => sum + d.events.length,
        0
      )} events`
    );

    // 🔥 CONVERTIR ARRAY A OBJETO CON CLAVES day1, day2, day3...
    const itineraryObject = {};
    itinerary.forEach((day, index) => {
      itineraryObject[`day${index + 1}`] = day;
    });

    console.log(
      `[FAST] Itinerary converted to object with keys:`,
      Object.keys(itineraryObject)
    );

    // 🔥 CALCULAR CENTRO GEOGRÁFICO DE LA CIUDAD (para el mapa)
    const allCoordinates = [];
    Object.values(poiResult.dayByDay).forEach((day) => {
      day.pois.forEach((poi) => {
        if (poi.coordinates?.lat && poi.coordinates?.lng) {
          allCoordinates.push(poi.coordinates);
        }
      });
    });

    const cityCenter =
      allCoordinates.length > 0
        ? {
            lat:
              allCoordinates.reduce((sum, c) => sum + c.lat, 0) /
              allCoordinates.length,
            lng:
              allCoordinates.reduce((sum, c) => sum + c.lng, 0) /
              allCoordinates.length,
          }
        : { lat: 40.4168, lng: -3.7038 }; // Fallback a Madrid

    console.log(
      `[FAST] City center calculated: ${cityCenter.lat}, ${cityCenter.lng}`
    );

    // 🔥 GENERAR SUMMARY DESCRIPTIVO
    const totalEvents = itinerary.reduce((sum, d) => sum + d.events.length, 0);
    const topPOIs = Object.values(poiResult.dayByDay)
      .flatMap((day) => day.pois)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 3)
      .map((poi) => poi.name);

    const intensityText = {
      relaxed: 'un ritmo relajado para disfrutar sin prisas',
      balanced: 'un ritmo equilibrado entre visitas y descanso',
      active: 'un ritmo activo para aprovechar cada momento',
    };

    const subtitle = `Descubre ${destination} en ${days} ${
      days === 1 ? 'día' : 'días'
    } con ${
      intensityText[intensity] || intensityText.balanced
    }. Visitarás ${totalEvents} lugares increíbles incluyendo ${topPOIs
      .slice(0, 2)
      .join(', ')}${topPOIs.length > 2 ? ` y ${topPOIs[2]}` : ''}.`;

    // 🔥 ENSAMBLAR RESPUESTA FINAL
    const tripData = {
      tripId: `trip-${destination
        .toLowerCase()
        .replace(/\s+/g, '-')}-${Date.now()}`,
      userPreferences: preferences,
      tripSummary: {
        destination,
        country: 'España',
        duration: days,
        totalDays: days,
        departureCity: 'Madrid',
        subtitle: subtitle,
        centerCoordinates: cityCenter, // Para centrar el mapa correctamente
      },
      hotels: [],
      itinerary: itineraryObject, // ← OBJETO con day1, day2, day3...
      generationStats: {
        totalTime: 0,
        poisFound: poiResult.stats.total,
        avgRelevanceScore: poiResult.stats.avgRelevanceScore,
      },
    };

    // Cache response
    responseCache.set(cacheKey, {
      data: tripData,
      timestamp: Date.now(),
    });

    console.timeEnd('total_request');
    console.log('[FAST] ========== SUCCESS ==========\n');

    return res.json({ ok: true, data: tripData, cached: false });
  } catch (error) {
    console.error('[FAST] ✗ Error:', error.message);
    console.timeEnd('total_request');
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ENDPOINT STREAMING OPTIMIZADO: Genera por partes y envía progresivamente
app.post('/api/generate-trip-progressive', async (req, res) => {
  console.log(
    '\n[PROGRESSIVE] ========== NEW PROGRESSIVE GENERATION REQUEST =========='
  );

  // Prompts para generación con IA (solo usados en endpoint progressive)
  const PROMPTS = {
    summary: (destination, startDate, endDate) =>
      `Return ONLY valid JSON object, no markdown:
{"destination":"${destination}","country":"Country Name","duration":3,"totalDays":3,"departureCity":"Madrid","subtitle":"Brief subtitle in Spanish"}

Calculate duration from ${startDate} to ${endDate}. ALL text in Spanish.`,

    hotels: (destination, budget, days) =>
      `Return ONLY valid JSON array, no markdown, no explanation. Generate exactly 3 hotels in ${destination} for ${budget} budget, ${days} nights:
[{"id":"hotel-1","name":"Hotel Name","stars":3,"price":{"amount":80,"currency":"EUR","period":"noche"},"location":{"area":"District","description":"Near metro","coordinates":{"lat":48.8566,"lng":2.3522}},"image":"https://placehold.co/400x300","amenities":["WiFi","Breakfast"],"bookingUrl":"https://booking.com"}]

Adjust prices: low=30-60€, medium=80-150€, high=180-300€, luxury=350€+. Include breakfast for medium+. ALL text in Spanish except property names.`,

    dayEvents: (destination, dayNum, date, intensity) =>
      `Generate 3-4 events for Day ${dayNum} in ${destination} (${date}).
Intensity: ${intensity}. Return ONLY JSON array, no markdown:
[{"id":"evt-1","time":"09:00","duration":"2h","title":"Monument name","description":"Description in Spanish","type":"Monument","location":{"name":"Name","address":"Address","coordinates":{"lat":40.4168,"lng":-3.7038}},"price":{"amount":15,"currency":"EUR"},"images":["https://placehold.co/600x400"],"tips":["Tip 1","Tip 2","Tip 3"],"travelTime":"10 min"}]

ALL text in Spanish. Real coordinates. 3 tips per event.`,
  };

  try {
    const { preferences } = req.body || {};
    const { destination, startDate, endDate, budget, intensity } =
      preferences || {};

    console.log(
      '[PROGRESSIVE] Preferences:',
      JSON.stringify(preferences, null, 2)
    );

    if (!GOOGLE_API_KEY) {
      console.error('[PROGRESSIVE] ✗ Missing GOOGLE_API_KEY');
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('Missing GOOGLE_API_KEY');
    }

    // Setup streaming response
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    console.log('[PROGRESSIVE] SSE stream established');

    // Calcular días - convertir fechas correctamente
    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start || !end || isNaN(start) || isNaN(end)) {
      console.error('[PROGRESSIVE] ✗ Invalid dates:', { startDate, endDate });
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: 'Invalid date format',
        })}\n\n`
      );
      return res.end();
    }

    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const startFormatted = formatDate(start);
    const endFormatted = formatDate(end);

    console.log(
      `[PROGRESSIVE] Trip duration: ${days} days from ${startFormatted} to ${endFormatted}`
    );

    const fastModel = getModel(0.3, 400);

    // Send progress updates
    const sendUpdate = (type, data, progress) => {
      const message = { type, data, progress };
      res.write(`data: ${JSON.stringify(message)}\n\n`);
      console.log(
        `[PROGRESSIVE] Sent update: type=${type}, progress=${progress}%`
      );
    };

    // Generate and stream each part
    console.log('[PROGRESSIVE] Starting progressive generation...');
    sendUpdate('start', { destination }, 0);

    // 1. Summary
    console.log('[PROGRESSIVE] Generating summary...');
    const summary = await generateWithRetry(
      fastModel,
      PROMPTS.summary(destination, startFormatted, endFormatted),
      'summary'
    );
    if (summary) {
      console.log('[PROGRESSIVE] ✓ Summary complete');
      sendUpdate('summary', summary, 25);
    } else {
      console.warn('[PROGRESSIVE] ⚠ Summary failed, using fallback');
      sendUpdate(
        'summary',
        {
          destination,
          country: 'Unknown',
          duration: days,
          totalDays: days,
          departureCity: 'Madrid',
          subtitle: `Viaje de ${days} días`,
        },
        25
      );
    }

    // 2. Hotels
    console.log('[PROGRESSIVE] Generating hotels...');
    const hotels = await generateWithRetry(
      fastModel,
      PROMPTS.hotels(destination, budget, days),
      'hotels'
    );
    if (hotels) {
      console.log('[PROGRESSIVE] ✓ Hotels complete');
      sendUpdate('hotels', hotels, 50);
    } else {
      console.warn('[PROGRESSIVE] ⚠ Hotels failed, using empty array');
      sendUpdate('hotels', [], 50);
    }

    // 3. Days (one by one to show progress)
    console.log('[PROGRESSIVE] Generating days sequentially...');
    const itinerary = {};
    for (let i = 0; i < Math.min(days, 5); i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      const dateStr = formatDate(date);

      console.log(`[PROGRESSIVE] Generating day ${i + 1}...`);
      const events = await generateWithRetry(
        fastModel,
        PROMPTS.dayEvents(destination, i + 1, dateStr, intensity),
        `day${i + 1}`
      );

      if (events && Array.isArray(events)) {
        console.log(
          `[PROGRESSIVE] ✓ Day ${i + 1} complete with ${events.length} events`
        );
        itinerary[`day${i + 1}`] = {
          dayNumber: i + 1,
          date: dateStr,
          title: `Día ${i + 1} en ${destination}`,
          theme:
            intensity === 'relaxed'
              ? 'Relajado'
              : intensity === 'active'
              ? 'Activo'
              : 'Equilibrado',
          events: events.map((e) => ({
            ...e,
            description: e.description || `Visita a ${e.title}`,
            images: e.images || [
              `https://source.unsplash.com/800x600/?${destination},${
                e.type || 'travel'
              }`,
            ],
            location: {
              name: e.location?.name || e.title,
              address: e.location?.address || `${destination}`,
              coordinates: {
                lat: e.location?.coordinates?.lat || e.location?.lat || 0,
                lng: e.location?.coordinates?.lng || e.location?.lng || 0,
              },
            },
          })),
        };
      } else {
        console.warn(`[PROGRESSIVE] ⚠ Day ${i + 1} failed, skipping`);
        itinerary[`day${i + 1}`] = {
          dayNumber: i + 1,
          date: dateStr,
          title: `Día ${i + 1}`,
          events: [],
        };
      }

      const progress = 50 + (40 * (i + 1)) / days;
      sendUpdate(
        'day',
        { day: i + 1, data: itinerary[`day${i + 1}`] },
        Math.round(progress)
      );
    }

    // Final assembly
    console.log('[PROGRESSIVE] Assembling final data...');
    const tripData = {
      tripId: `trip-${destination
        .toLowerCase()
        .replace(/\s+/g, '-')}-${Date.now()}`,
      userPreferences: preferences,
      tripSummary: summary || {
        destination,
        country: 'Unknown',
        duration: days,
        totalDays: days,
        departureCity: 'Madrid',
        subtitle: `Viaje de ${days} días`,
      },
      hotels: Array.isArray(hotels) ? hotels : [],
      itinerary,
    };

    console.log('[PROGRESSIVE] ✓ All parts generated successfully');
    sendUpdate('complete', tripData, 100);
    res.write('data: [DONE]\n\n');
    console.log(
      '[PROGRESSIVE] ========== REQUEST COMPLETED SUCCESSFULLY ==========\n'
    );
    return res.end();
  } catch (err) {
    console.error('[PROGRESSIVE] ✗✗✗ FATAL ERROR:', err);
    console.error('[PROGRESSIVE] Stack:', err.stack);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    return res.end();
  }
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log(`\n🚀 ===== TRIP PLANNER API SERVER =====`);
  console.log(`   Port: http://localhost:${PORT}`);
  console.log(`   Model: ${MODEL_NAME}`);
  console.log(`\n📍 Available Endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(
    `   POST /api/generate-trip-fast ⚡ - Wikipedia POIs (FAST, ~15s)`
  );
  console.log(
    `   POST /api/generate-trip-progressive 📊 - AI with SSE (fallback)`
  );
  console.log(`\n✅ Server ready for requests\n`);
});

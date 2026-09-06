/**
 * Cliente Overpass con failover automático entre múltiples endpoints.
 *
 * Los servidores de Overpass API sufren caídas y rate-limits con frecuencia.
 * Este módulo prueba los endpoints en orden y recuerda el último que funcionó
 * para priorizarlo en las siguientes llamadas.
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const MIRROR_URLS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

function buildEndpoints() {
  const configured = process.env.OVERPASS_ENDPOINT;
  const urls = configured ? [configured, ...MIRROR_URLS] : [...MIRROR_URLS];
  return [...new Set(urls)];
}

const ENDPOINTS = buildEndpoints();
let preferredIndex = 0;

/**
 * Ejecuta una query Overpass contra los endpoints con failover.
 * @param {string} query - Query Overpass QL
 * @param {number} timeout - Timeout en ms
 * @param {number} maxRetries - Reintentos por endpoint (con backoff exponencial)
 * @returns {Promise<Object>} Respuesta JSON de Overpass
 * @throws {Error} Si todos los endpoints fallan
 */
export async function executeOverpassQueryWithFailover(
  query,
  timeout = 60000,
  maxRetries = 2
) {
  let lastError = null;

  for (let epIndex = 0; epIndex < ENDPOINTS.length; epIndex++) {
    const endpoint = ENDPOINTS[(preferredIndex + epIndex) % ENDPOINTS.length];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(endpoint, query, {
          headers: { 'Content-Type': 'text/plain' },
          timeout,
        });
        preferredIndex = (preferredIndex + epIndex) % ENDPOINTS.length;
        return response.data;
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        // 429 (rate limit) o 504: probar otro endpoint en vez de reintentar
        if (status === 429 || status === 504) break;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  throw new Error(
    `Overpass API failed on all ${ENDPOINTS.length} endpoints: ${
      lastError?.message || 'unknown error'
    }`
  );
}
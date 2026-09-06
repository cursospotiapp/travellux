/**
 * Proxy de imágenes de Wikimedia con caché en disco.
 *
 * Problema: upload.wikimedia.org devuelve 403 a las peticiones del navegador
 * (hotlinking), y las URLs "original" pueden pesar varios MB.
 *
 * Solución: el backend descarga la imagen con un User-Agent permitido,
 * la guarda en .image-cache/ y la sirve desde /api/image?src=... con CORS.
 * Los <img> de la web apuntan a este proxy.
 */

import express from 'express';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../../.image-cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB

// Solo permitir proxies de imágenes de Wikimedia (evita SSRF)
const ALLOWED_HOSTS = new Set([
  'upload.wikimedia.org',
  'thumb.wikimedia.org',
  'commons.wikimedia.org',
]);

let cacheReady = null;
function ensureCacheDir() {
  if (!cacheReady) {
    cacheReady = fs.mkdir(CACHE_DIR, { recursive: true }).catch((e) => {
      console.error('[IMG-PROXY] cache dir failed:', e.message);
      cacheReady = null;
    });
  }
  return cacheReady;
}

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const src = String(req.query.src || '');
    let parsed;
    try {
      parsed = new URL(src);
    } catch {
      return res.status(400).json({ error: 'invalid src' });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return res.status(403).json({ error: 'host not allowed' });
    }

    if (parsed.protocol !== 'https:') {
      return res.status(403).json({ error: 'https only' });
    }

    // Quitar parámetros de tracking (utm_*)
    for (const k of [...parsed.searchParams.keys()]) {
      if (k.startsWith('utm_')) parsed.searchParams.delete(k);
    }
    const cleanUrl = parsed.toString();

    const hash = crypto
      .createHash('sha1')
      .update(cleanUrl)
      .digest('hex');
    const extMatch = cleanUrl.match(/\.(jpe?g|png|gif|webp|svg)/i);
    const ext = extMatch ? extMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
    const cachePath = path.join(CACHE_DIR, `${hash}.${ext}`);

    await ensureCacheDir();

    // Cache hit
    try {
      const stat = await fs.stat(cachePath);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        res.set('Cache-Control', 'public, max-age=86400');
        res.type(ext === 'svg' ? 'svg' : ext);
        return res.sendFile(cachePath);
      }
    } catch {
      // no cacheado
    }

    // Descargar con User-Agent que Wikimedia acepta
    const response = await axios.get(cleanUrl, {
      // Wikimedia bloquea 403 a UAs de navegador; uno simple tipo CLI funciona
      headers: { 'User-Agent': 'TripPlannerImageProxy/1.0' },
      timeout: 20000,
      responseType: 'arraybuffer',
      maxContentLength: MAX_IMAGE_BYTES,
    });

    const buf = Buffer.from(response.data);
    if (buf.length === 0) {
      return res.status(502).json({ error: 'empty image' });
    }

    // Guardar en caché (best effort)
    fs.writeFile(cachePath, buf).catch(() => {});

    const contentType =
      typeof response.headers['content-type'] === 'string' &&
      response.headers['content-type'].startsWith('image/')
        ? response.headers['content-type']
        : `image/${ext === 'svg' ? 'svg+xml' : ext}`;

    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', contentType);
    return res.send(buf);
  } catch (error) {
    const status = error.response?.status ?? 500;
    console.error(
      `[IMG-PROXY] error: ${error.message} (${status})`
    );
    return res.status(status === 403 || status === 404 ? 404 : 500).json({
      error: 'image fetch failed',
    });
  }
});

export default router;
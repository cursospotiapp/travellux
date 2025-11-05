/**
 * Servicio optimizado para llamadas a IA con múltiples estrategias
 */

const API_BASE =
  (typeof window !== 'undefined' && window.AI_API_BASE) ||
  'http://localhost:3000';

/**
 * Generación rápida en paralelo (3-5 segundos típicamente)
 */
export async function generateTripFast(preferences) {
  console.log('[SERVICE] Starting fast parallel generation...');
  console.time('generateTripFast');

  try {
    const response = await fetch(`${API_BASE}/api/generate-trip-fast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    });

    const result = await response.json();
    console.timeEnd('generateTripFast');

    if (result.ok) {
      console.log('[SERVICE] ✓ Fast generation successful', {
        parallel: result.parallel,
        cached: result.cached,
      });
    } else {
      console.error('[SERVICE] ✗ Fast generation failed:', result.error);
    }

    return result;
  } catch (error) {
    console.timeEnd('generateTripFast');
    console.error('[SERVICE] ✗ Fast generation network error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Generación progresiva con actualizaciones en tiempo real
 */
export async function generateTripProgressive(preferences, onProgress) {
  console.log('[SERVICE] Starting progressive generation with SSE...');
  console.time('generateTripProgressive');

  try {
    const response = await fetch(`${API_BASE}/api/generate-trip-progressive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    });

    if (!response.ok) {
      console.error(
        '[SERVICE] ✗ Progressive generation failed with status:',
        response.status
      );
      throw new Error('Generation failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData = null;
    let updateCount = 0;

    console.log('[SERVICE] SSE stream established, reading updates...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            console.log('[SERVICE] ✓ Progressive generation complete');
            console.timeEnd('generateTripProgressive');
            return { ok: true, data: finalData };
          }

          try {
            const parsed = JSON.parse(data);
            updateCount++;
            console.log(
              `[SERVICE] Update #${updateCount}: type=${parsed.type}, progress=${parsed.progress}%`
            );

            if (parsed.type === 'complete') {
              finalData = parsed.data;
            }
            if (onProgress) {
              onProgress(parsed);
            }
          } catch (e) {
            console.warn('[SERVICE] Failed to parse SSE message:', e.message);
          }
        }
      }
    }

    console.timeEnd('generateTripProgressive');
    console.log(`[SERVICE] Stream ended after ${updateCount} updates`);
    return { ok: true, data: finalData };
  } catch (error) {
    console.timeEnd('generateTripProgressive');
    console.error('[SERVICE] ✗ Progressive generation error:', error);
    return { ok: false, error: error.message };
  }
}

/**
 * Fallback a datos locales si la IA falla
 */
export async function generateWithFallback(preferences, onProgress) {
  console.log('\n[SERVICE] ========== GENERATION WITH FALLBACK ==========');
  console.log('[SERVICE] Preferences:', preferences);

  // Intento 1: Generación rápida en paralelo
  console.log('[SERVICE] Strategy 1: Fast parallel generation...');
  const fastResult = await generateTripFast(preferences);

  if (fastResult.ok && fastResult.data) {
    console.log('[SERVICE] ✓✓✓ SUCCESS with fast parallel generation');
    console.log('[SERVICE] ===============================================\n');
    return fastResult;
  }

  console.warn('[SERVICE] ⚠ Fast generation failed, trying progressive...');

  // Intento 2: Generación progresiva
  console.log('[SERVICE] Strategy 2: Progressive generation with SSE...');
  const progressiveResult = await generateTripProgressive(
    preferences,
    onProgress
  );

  if (progressiveResult.ok && progressiveResult.data) {
    console.log('[SERVICE] ✓✓✓ SUCCESS with progressive generation');
    console.log('[SERVICE] ===============================================\n');
    return progressiveResult;
  }

  console.error(
    '[SERVICE] ⚠⚠ Both AI strategies failed, falling back to local mock data'
  );

  // Intento 3: Datos mock locales
  console.log('[SERVICE] Strategy 3: Local mock data fallback...');
  try {
    const { generateTrip } = await import('../utils/dataHelpers.js');
    const mockData = generateTrip(preferences);
    console.log('[SERVICE] ✓ Fallback to local mock successful');
    console.log('[SERVICE] ===============================================\n');
    return { ok: true, data: mockData, fallback: true };
  } catch (error) {
    console.error('[SERVICE] ✗✗✗ CRITICAL: Even fallback failed:', error);
    console.log('[SERVICE] ===============================================\n');
    return {
      ok: false,
      error: 'All generation strategies failed',
      fallback: true,
    };
  }
}

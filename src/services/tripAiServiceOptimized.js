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
  console.log('[SERVICE] API_BASE:', API_BASE);
  console.log('[SERVICE] Calling:', `${API_BASE}/api/generate-trip-fast`);
  console.time('generateTripFast');

  try {
    console.log('[SERVICE] Sending POST request...');
    const response = await fetch(`${API_BASE}/api/generate-trip-fast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences }),
    });

    console.log('[SERVICE] Response status:', response.status);
    console.log('[SERVICE] Response ok:', response.ok);

    const result = await response.json();
    console.log('[SERVICE] Response parsed:', result);
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
    console.error('[SERVICE] ✗✗✗ FETCH ERROR:', error);
    console.error('[SERVICE] Error type:', error.constructor.name);
    console.error('[SERVICE] Error message:', error.message);
    console.error('[SERVICE] Error stack:', error.stack);
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

    // Si el stream se cortó sin [DONE], finalData puede ser null:
    // devolver ok:false en vez de ok:true sin datos
    if (!finalData) {
      console.error('[SERVICE] ✗ Stream ended without complete data');
      return { ok: false, error: 'stream_incomplete' };
    }
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

  console.error('[SERVICE] ⚠⚠ Both AI strategies failed');
  console.error('[SERVICE] Fast result:', fastResult);
  console.error('[SERVICE] Progressive result:', progressiveResult);
  console.log('[SERVICE] ===============================================\n');

  // NO MÁS FALLBACK - Devolver el error
  return {
    ok: false,
    error: `Fast generation failed: ${
      fastResult.error || 'unknown'
    }. Progressive generation failed: ${progressiveResult.error || 'unknown'}`,
    fallback: false,
  };
}

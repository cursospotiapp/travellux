// Client-side helper to call the AI backend and return structured trip data
// Contract:
// - generateTripWithAI(preferences, exampleTrip?) -> { ok: boolean, data?: object, raw?: string, reason?: string }
// - preferences: { destination, startDate, endDate, budget, intensity }
// - exampleTrip: optional example object to help steer the model

const DEFAULT_API_BASE =
  (typeof window !== 'undefined' && window.AI_API_BASE) ||
  'http://localhost:3000';

export async function generateTripWithAI(preferences, exampleTrip) {
  const payload = { preferences, example: exampleTrip };
  const url = `${DEFAULT_API_BASE}/api/generate-trip`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      return { ok: false, reason: `http_${resp.status}` };
    }
    const data = await resp.json();
    return data;
  } catch (err) {
    return { ok: false, reason: 'network_error', raw: String(err) };
  }
}

// Streaming variant: progressively reads text and returns final parsed JSON when done.
// onProgress is optional callback receiving the cumulative text length.
export async function generateTripWithAIStream(
  preferences,
  exampleTrip,
  onProgress
) {
  const payload = {
    preferences,
    example: exampleTrip,
    options: { compact: true, maxOutputTokens: 1400 },
  };
  const url = `${DEFAULT_API_BASE}/api/generate-trip-stream`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok || !resp.body) {
      return { ok: false, reason: `http_${resp.status}` };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (onProgress) onProgress(text.length);
    }
    text += decoder.decode();

    // Try to extract JSON from the streamed text
    const parsed = tryExtractJSONClient(text);
    if (parsed) return { ok: true, data: parsed };
    return { ok: false, reason: 'parse_failed', raw: text };
  } catch (err) {
    return { ok: false, reason: 'network_error', raw: String(err) };
  }
}

function tryExtractJSONClient(text) {
  if (!text) return null;
  const fenceMatch =
    text.match(/```json[\s\S]*?```/i) || text.match(/```[\s\S]*?```/i);
  let candidate = null;
  if (fenceMatch) {
    candidate = fenceMatch[0].replace(/```json|```/gi, '').trim();
  } else {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      candidate = text.slice(first, last + 1);
    }
  }
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch (err) {
    void err;
  }
  // light repairs
  candidate = candidate.replace(/,\s*([}\]])/g, '$1');
  candidate = candidate.replace(
    /([,{\n\r\t\s])([A-Za-z0-9_]+)\s*:/g,
    '$1"$2":'
  );
  candidate = candidate.replace(/'([^']*)'/g, '"$1"');
  candidate = [...candidate]
    .filter((ch) => ch >= ' ' || ch === '\n' || ch === '\r' || ch === '\t')
    .join('');
  try {
    return JSON.parse(candidate);
  } catch (err) {
    void err;
    return null;
  }
}

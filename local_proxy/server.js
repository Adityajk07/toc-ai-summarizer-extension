// server.js - Gemini proxy + OpenAI verify endpoint
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// Keys + model defaults (set these in your .env)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini'; // change to an available chat model if needed
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
if (!OPENAI_CHAT_MODEL){
  console.log("Model not available");
}
console.log('Starting server.js');
console.log('GEMINI_API_KEY present?', !!GEMINI_API_KEY);
console.log('OPENAI_API_KEY present?', !!OPENAI_API_KEY);

app.use(cors());
app.use(express.json({ limit: '300kb' }));

// fetch-with-timeout helper
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/* ---------------- V1: Gemini proxy (keeps behavior) ---------------- */
app.post('/proxy/gemini', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const apiRes = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    }, 20000);
    const text = await apiRes.text();
    res.status(apiRes.status).send(text);
  } catch (err) {
    console.error('proxy/gemini error', err && err.message || err);
    if (err && err.name === 'AbortError') return res.status(504).json({ error: 'Upstream request timed out' });
    return res.status(500).json({ error: 'Proxy failed', details: err && err.message || String(err) });
  }
});

/* ---------------- Helper: call local proxy to get Gemini summary ---------------- */
async function getGeminiSummary(content) {
  const proxyUrl = `http://localhost:${PORT}/proxy/gemini`;
  const prompt = `Summarize the following Terms and Conditions or legal text in under 200 words in bullet points and an easy-to-understand style:\n\n${content}`;
  const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };

  try {
    const resp = await fetchWithTimeout(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 20000);
    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }
    if (json) {
      return json?.candidates?.[0]?.content?.parts?.[0]?.text || json.output_text || (typeof json === 'string' ? json : '');
    } else {
      return text || '';
    }
  } catch (err) {
    console.error('getGeminiSummary error', err && err.message || err);
    return '';
  }
}

/* ---------------- OpenAI: chat generate summary ---------------- */
async function openaiGenerateSummary(content) {
  if (!OPENAI_API_KEY) return { success: false, error: 'no_openai_key' };
  const url = 'https://api.openai.com/v1/chat/completions'; // legacy chat completion endpoint supported by many models
  // Some deployments use /v1/responses for newer models; adjust if needed.
  const body = {
    model: OPENAI_CHAT_MODEL,
    messages: [
      { role: 'system', content: 'You are a concise summarizer of Terms and Conditions and legal text. Produce a clear bullet-point summary, under 200 words.' },
      { role: 'user', content: `Summarize the following Terms and Conditions in under 200 words using bullet points and plain language:\n\n${content}` }
    ],
    max_tokens: 400,
    temperature: 0.2
  };

  try {
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(body)
    }, 20000);

    if (!r.ok) {
      const t = await r.text();
      return { success: false, error: `openai chat error: ${r.status} ${t}`, raw: t };
    }

    const j = await r.json();
    // extraction: many models return j.choices[0].message.content
    let text = '';
    if (j?.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) {
      text = j.choices[0].message.content;
    } else if (j?.choices && j.choices[0] && j.choices[0].text) {
      text = j.choices[0].text;
    } else if (j?.output_text) {
      text = j.output_text;
    } else {
      text = JSON.stringify(j);
    }
    return { success: true, summary: (text || '').trim(), raw: j };
  } catch (err) {
    console.error('openaiGenerateSummary error', err && err.message || err);
    if (err && err.name === 'AbortError') return { success: false, error: 'openai chat timeout' };
    return { success: false, error: String(err) };
  }
}

/* ---------------- OpenAI: embed texts ---------------- */
async function openaiEmbed(texts = []) {
  if (!OPENAI_API_KEY) return { success: false, error: 'no_openai_key' };
  const url = 'https://api.openai.com/v1/embeddings';
  const body = { model: OPENAI_EMBED_MODEL, input: texts };

  try {
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(body)
    }, 20000);

    if (!r.ok) {
      const t = await r.text();
      return { success: false, error: `openai embed error: ${r.status} ${t}`, raw: t };
    }

    const j = await r.json();
    // j.data is array of {embedding: [...]}
    const embeddings = (j && j.data) ? j.data.map(d => d.embedding) : null;
    if (!Array.isArray(embeddings)) return { success: false, error: 'no embeddings in response', raw: j };
    return { success: true, embeddings, raw: j };
  } catch (err) {
    console.error('openaiEmbed error', err && err.message || err);
    if (err && err.name === 'AbortError') return { success: false, error: 'openai embed timeout' };
    return { success: false, error: String(err) };
  }
}

/* ---------------- cosine similarity ---------------- */
function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/* ---------------- /api/verify-with-openai ----------------
 Body: { content: "..."} returns gemini + openai summary + confidence
*/
app.post('/api/verify-with-openai', async (req, res) => {
  try {
    const content = req.body.content || req.body.prompt || req.body.text;
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'content required' });

    // 1) Gemini summary
    const geminiSummary = await getGeminiSummary(content);

    // If gemini fails, still try OpenAI directly on content
    if (!geminiSummary || !String(geminiSummary).trim()) {
      console.warn('/api/verify-with-openai: empty gemini summary, continuing with content');
    }

    // 2) OpenAI generate summary (on original content to keep parity)
    const openaiGen = await openaiGenerateSummary(content);
    if (!openaiGen.success) {
      // return gemini-only fallback with provenance explaining OpenAI failure
      return res.json({
        gemini_summary: geminiSummary || '',
        openai_summary: null,
        confidence: 0,
        raw_similarity: null,
        provenance: { gemini: !!geminiSummary, openai: { success: false, error: openaiGen.error, raw: openaiGen.raw } }
      });
    }
    const openaiSummary = openaiGen.summary || '';

    // 3) Embed both summaries (use empty-string fallback)
    const embedResp = await openaiEmbed([geminiSummary || '', openaiSummary || '']);
    if (!embedResp.success) {
      return res.json({
        gemini_summary: geminiSummary || '',
        openai_summary: openaiSummary,
        confidence: 0,
        raw_similarity: null,
        provenance: { gemini: !!geminiSummary, openai: { generate_raw: openaiGen.raw, embed_success: false, embed_error: embedResp.error } }
      });
    }

    const [embGemini, embOpenAI] = embedResp.embeddings;
    const sim = cosineSimilarity(embGemini, embOpenAI);
    const confidence = Math.round(((sim + 1) / 2) * 100) / 100; // 0..1 rounded to 2 decimals

    return res.json({
      gemini_summary: geminiSummary || '',
      openai_summary: openaiSummary,
      confidence,
      raw_similarity: sim,
      provenance: {
        gemini: !!geminiSummary,
        openai: { generate_raw: openaiGen.raw, embed_raw: embedResp.raw }
      }
    });
  } catch (err) {
    console.error('/api/verify-with-openai error', err && err.message || err);
    return res.status(500).json({ error: err && err.message || 'internal error' });
  }
});

/* ---------------- start server ---------------- */
app.listen(PORT, () => console.log(`Proxy running on http://localhost:${PORT}`));

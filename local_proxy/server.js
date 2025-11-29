// Simple local proxy with NO extra tokens
require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
console.log("Starting server.js");
const app = express();
app.use(express.json());

const API_KEY = process.env.SECRET_API_KEY;
// after const API_KEY = process.env.MY_GEMINI_KEY;
console.log('proxy: API_KEY present?', !!API_KEY);
if (API_KEY) {
  const masked = API_KEY.length > 8 ? API_KEY.slice(0,4) + '...' + API_KEY.slice(-4) : '***';
  console.log('proxy: API_KEY length=', API_KEY.length, 'masked=', masked);
}


app.post('/proxy/gemini', async (req, res) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

    const apiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    const data = await apiRes.text();
    res.status(apiRes.status).send(data);
  } catch (e) {
    console.error("Proxy error:", e);
    res.status(500).json({ error: "Proxy failed" });
  }
});

app.listen(3000, () => console.log("Proxy running on http://localhost:3000"));

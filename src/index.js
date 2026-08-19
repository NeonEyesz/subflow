require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getSubtitles, resolveAndDownloadSubtitle } = require('./services/subtitles');

const app = express();
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

const MANIFEST = {
  id: 'com.syncsubs.custom',
  version: '1.0.0',
  name: 'SyncSubs',
  description: 'Legendas PT-BR automáticas para Stremio e Nuvio com seleção inteligente, múltiplas fontes, cache e fallback automático.',
  logo: 'https://syncsubs-production.up.railway.app/syncsubs-logo.png',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt']
};

// Página inicial interativa
app.get('/', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const currentBaseUrl = `${protocol}://${host}`;
  const manifestUrl = `${currentBaseUrl}/manifest.json`;
  const stremioSchemeUrl = `stremio://${host}/manifest.json`;

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SyncSubs - Legendas PT-BR para Stremio & Nuvio</title>
      <link rel="icon" href="${MANIFEST.logo}">
      <style>
        :root {
          --primary: #8b5cf6;
          --primary-hover: #7c3aed;
          --bg: #0f172a;
          --card-bg: #1e293b;
          --text: #f8fafc;
          --text-muted: #94a3b8;
          --border: #334155;
          --success: #22c55e;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 32px; max-width: 640px; width: 100%; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; }
        .logo { width: 96px; height: 96px; border-radius: 16px; margin-bottom: 20px; box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.3); }
        h1 { font-size: 28px; margin-bottom: 12px; font-weight: 700; }
        p.subtitle { color: var(--text-muted); font-size: 15px; line-height: 1.6; margin-bottom: 28px; }
        .btn-group { display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 24px; border-radius: 10px; font-weight: 600; font-size: 16px; text-decoration: none; transition: all 0.2s; cursor: pointer; border: none; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-2px); }
        .btn-secondary { background: var(--border); color: var(--text); }
        .btn-secondary:hover { background: #475569; }
        .features { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; text-align: left; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border); }
        .feature-item { font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; }
        .feature-item span { color: var(--success); font-weight: bold; }
        .url-box { background: #0b1120; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; font-family: monospace; font-size: 13px; color: #38bdf8; word-break: break-all; margin-top: 12px; }
        .toast { display: none; margin-top: 12px; color: var(--success); font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="card">
        <img class="logo" src="${MANIFEST.logo}" alt="SyncSubs Logo" onerror="this.src='https://stremio-addons.net/img/web-app-manifest-512x512.png'" />
        <h1>SyncSubs (Self-Hosted)</h1>
        <p class="subtitle">Legendas PT-BR automáticas para Stremio e Nuvio com seleção inteligente, ordenação por compatibilidade, cache persistente e fallback automático.</p>

        <div class="btn-group">
          <a class="btn btn-primary" href="${stremioSchemeUrl}">🚀 Instalar no Stremio</a>
          <button class="btn btn-secondary" onclick="copyManifest()">📋 Copiar URL do Manifest (Nuvio / Web)</button>
        </div>

        <div class="url-box" id="manifestUrlText">${manifestUrl}</div>
        <div class="toast" id="toast">✓ URL copiada para a área de transferência!</div>

        <div class="features">
          <div class="feature-item"><span>✓</span> Prioridade estrita PT-BR</div>
          <div class="feature-item"><span>✓</span> VideoHash Match</div>
          <div class="feature-item"><span>✓</span> Cache Ultra-Rápido</div>
          <div class="feature-item"><span>✓</span> Fallback Automático</div>
          <div class="feature-item"><span>✓</span> Conversão SRT/VTT</div>
          <div class="feature-item"><span>✓</span> Suporte a Séries & Filmes</div>
        </div>
      </div>

      <script>
        function copyManifest() {
          const url = document.getElementById('manifestUrlText').innerText;
          navigator.clipboard.writeText(url).then(() => {
            const toast = document.getElementById('toast');
            toast.style.display = 'block';
            setTimeout(() => { toast.style.display = 'none'; }, 3000);
          });
        }
      </script>
    </body>
    </html>
  `);
});

// Endpoint do manifesto do addon
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(MANIFEST);
});

// Endpoint de busca de legendas (sem parâmetros extras)
app.get('/subtitles/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const serverBase = `${protocol}://${host}`;

  try {
    const rawSubs = await getSubtitles({ type, id, extra: req.query });
    // Ajusta as URLs para o domínio atual do servidor
    const subtitles = rawSubs.map(s => ({
      ...s,
      url: `${serverBase}${s.url}`
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'max-age=3600, public');
    res.json({ subtitles });
  } catch (err) {
    console.error(`Erro buscando legendas para ${id}:`, err.message);
    res.json({ subtitles: [] });
  }
});

// Endpoint de busca de legendas com parâmetros extras (extra.json)
app.get('/subtitles/:type/:id/:extra.json', async (req, res) => {
  const { type, id, extra } = req.params;
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const serverBase = `${protocol}://${host}`;

  // Processa parâmetros extras de URL (ex: videoHash=abc&videoSize=123&filename=movie.mkv)
  const extraParams = { ...req.query };
  if (extra) {
    const pairs = extra.split('&');
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (k && v) {
        extraParams[decodeURIComponent(k)] = decodeURIComponent(v);
      }
    }
  }

  try {
    const rawSubs = await getSubtitles({ type, id, extra: extraParams });
    const subtitles = rawSubs.map(s => ({
      ...s,
      url: `${serverBase}${s.url}`
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'max-age=3600, public');
    res.json({ subtitles });
  } catch (err) {
    console.error(`Erro buscando legendas com extra para ${id}:`, err.message);
    res.json({ subtitles: [] });
  }
});

// Endpoint de entrega e fallback de legenda WebVTT
app.get('/subtitle/:token/:season/:episode.vtt', async (req, res) => {
  const { token } = req.params;

  try {
    const vttData = await resolveAndDownloadSubtitle(decodeURIComponent(token));

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache de 24h
    res.send(vttData);
  } catch (err) {
    console.error('Falha servindo legenda:', err.message);
    res.status(404).send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\nLegenda não encontrada\n');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SyncSubs Clone rodando em: http://localhost:${PORT}`);
  console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
  console.log(`======================================================\n`);
});

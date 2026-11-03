require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getSubtitles, resolveAndDownloadSubtitle } = require('./services/subtitles');
const cache = require('./utils/cache');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(express.json());

const BASE_MANIFEST = {
  id: 'com.azthe.subflow',
  version: '1.3.0',
  name: 'SubFlow',
  description: 'Legendas em inglês e português com prioridade por correspondência e fontes alternativas.',
  logo: 'https://raw.githubusercontent.com/Stremio/stremio-addon-sdk/master/logo.png',
  resources: ['subtitles'],
  types: ['movie', 'series'],
  catalogs: [],
  idPrefixes: ['tt']
};

// Página inicial & Configurador interativo
app.get(['/', '/configure'], (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const currentBaseUrl = `${protocol}://${host}`;
  const stats = cache.getStats();

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SubFlow - Legendas Inteligentes para Stremio & Nuvio</title>
      <style>
        :root {
          --primary: #06b6d4;
          --primary-hover: #0891b2;
          --primary-glow: rgba(6, 182, 212, 0.4);
          --bg: #070d18;
          --card-bg: #0f172a;
          --text: #f8fafc;
          --text-muted: #94a3b8;
          --border: #1e293b;
          --success: #10b981;
          --accent: #38bdf8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        body { background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; }
        .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 24px; padding: 36px; max-width: 680px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8); text-align: center; position: relative; overflow: hidden; }
        .card::before { content: ""; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, var(--primary-glow) 0%, transparent 60%); opacity: 0.15; pointer-events: none; }
        
        .logo-badge { display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 20px; background: linear-gradient(135deg, #06b6d4, #3b82f6); margin-bottom: 18px; font-size: 38px; box-shadow: 0 10px 25px -5px var(--primary-glow); }
        h1 { font-size: 32px; margin-bottom: 8px; font-weight: 800; background: linear-gradient(135deg, #ffffff 50%, var(--primary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p.subtitle { color: var(--text-muted); font-size: 14.5px; line-height: 1.6; margin-bottom: 24px; }
        
        .config-box { background: rgba(7, 13, 24, 0.7); border: 1px solid var(--border); border-radius: 16px; padding: 20px; text-align: left; margin-bottom: 24px; }
        .config-title { font-size: 15px; font-weight: 700; margin-bottom: 14px; color: var(--accent); display: flex; align-items: center; gap: 8px; }
        .toggle-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(30, 41, 59, 0.6); }
        .toggle-item:last-child { border-bottom: none; }
        .toggle-label { font-size: 14px; font-weight: 500; }
        .toggle-desc { font-size: 12px; color: var(--text-muted); }
        
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #334155; transition: .3s; border-radius: 24px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
        input:checked + .slider { background-color: var(--primary); }
        input:checked + .slider:before { transform: translateX(20px); }

        .btn-group { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 24px; border-radius: 12px; font-weight: 600; font-size: 16px; text-decoration: none; transition: all 0.2s; cursor: pointer; border: none; }
        .btn-primary { background: linear-gradient(135deg, var(--primary), #3b82f6); color: white; box-shadow: 0 10px 20px -5px var(--primary-glow); }
        .btn-primary:hover { transform: translateY(-2px); filter: brightness(1.1); }
        .btn-secondary { background: #1e293b; color: var(--text); }
        .btn-secondary:hover { background: #334155; }
        
        .url-box { background: #030712; border: 1px solid var(--border); padding: 12px 16px; border-radius: 10px; font-family: monospace; font-size: 13px; color: var(--accent); word-break: break-all; margin-top: 10px; }
        .toast { display: none; margin-top: 10px; color: var(--success); font-size: 14px; font-weight: 500; }
        
        .stats-bar { display: flex; justify-content: space-around; background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-top: 24px; font-size: 12px; color: var(--text-muted); }
        .stats-item span { color: var(--text); font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo-badge">🌊</div>
        <h1>SubFlow</h1>
        <p class="subtitle">Legendas em inglês e português. A escolha automática do idioma é feita nas configurações do player.</p>

        <div class="config-box">
          <div class="config-title">⚙️ Preferências de Legenda</div>
          
          <div class="toggle-item">
            <div>
              <div class="toggle-label">🇧🇷 Legendas em Português (PT-BR)</div>
              <div class="toggle-desc">Disponibiliza a opção em português brasileiro</div>
            </div>
            <label class="switch"><input type="checkbox" id="cfgPtbr" checked onchange="updateLinks()"><span class="slider"></span></label>
          </div>

          <div class="toggle-item">
            <div>
              <div class="toggle-label">🇺🇸 Legendas em Inglês (English Sync)</div>
              <div class="toggle-desc">Disponibiliza a opção em inglês no player</div>
            </div>
            <label class="switch"><input type="checkbox" id="cfgEng" checked onchange="updateLinks()"><span class="slider"></span></label>
          </div>

          <div class="toggle-item">
            <div>
              <div class="toggle-label">🇵🇹 Fallback PT-PT</div>
              <div class="toggle-desc">Se não houver PT-BR, aceita Português de Portugal como reserva</div>
            </div>
            <label class="switch"><input type="checkbox" id="cfgPtpt" checked onchange="updateLinks()"><span class="slider"></span></label>
          </div>

          <div class="toggle-item">
            <div>
              <div class="toggle-label">🧹 Higienização Anti-Anúncios</div>
              <div class="toggle-desc">Remove propagandas de sites e cassinos dentro das legendas</div>
            </div>
            <label class="switch"><input type="checkbox" id="cfgAds" checked onchange="updateLinks()"><span class="slider"></span></label>
          </div>
        </div>

        <div class="btn-group">
          <a class="btn btn-primary" id="btnStremio" href="stremio://${host}/manifest.json">🚀 Instalar no Stremio</a>
          <button class="btn btn-secondary" onclick="copyManifest()">📋 Copiar URL do Manifest (Nuvio / Web)</button>
        </div>

        <div class="url-box" id="manifestUrlText">${currentBaseUrl}/manifest.json</div>
        <div class="toast" id="toast">✓ URL copiada para a área de transferência!</div>

        <div class="stats-bar">
          <div class="stats-item">⚡ Cache RAM: <span>${stats.memoryEntries} itens</span></div>
          <div class="stats-item">💾 Cache Disco: <span>${stats.diskFiles} arquivos (${stats.diskSizeMB} MB)</span></div>
          <div class="stats-item">🛡️ Status: <span style="color: var(--success)">Ativo & Saudável</span></div>
        </div>
      </div>

      <script>
        const baseUrl = '${currentBaseUrl}';
        const rawHost = '${host}';

        function updateLinks() {
          const ptbr = document.getElementById('cfgPtbr').checked ? '1' : '0';
          const eng = document.getElementById('cfgEng').checked ? '1' : '0';
          const ptpt = document.getElementById('cfgPtpt').checked ? '1' : '0';
          const ads = document.getElementById('cfgAds').checked ? '1' : '0';

          const params = new URLSearchParams({ ptbr, eng, ptpt, ads }).toString();
          const isDefault = ptbr === '1' && eng === '1' && ptpt === '1' && ads === '1';

          const manifestPath = isDefault ? '/manifest.json' : '/' + encodeURIComponent(params) + '/manifest.json';
          const fullManifestUrl = baseUrl + manifestPath;
          const stremioUrl = 'stremio://' + rawHost + manifestPath;

          document.getElementById('manifestUrlText').innerText = fullManifestUrl;
          document.getElementById('btnStremio').href = stremioUrl;
        }

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

// Manifesto Padrão
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(BASE_MANIFEST);
});

// Manifesto Customizado por Configuração
app.get('/:config/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json({
    ...BASE_MANIFEST,
    name: 'SubFlow'
  });
});

// Helper para responder legendas
async function handleSubtitlesRequest(req, res, config = '') {
  const { type, id, extra } = req.params;
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const serverBase = `${protocol}://${host}`;

  const extraParams = { ...req.query };
  if (extra) {
    const pairs = extra.split('&');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx !== -1) {
        const k = pair.substring(0, idx);
        const v = pair.substring(idx + 1);
        extraParams[decodeURIComponent(k)] = decodeURIComponent(v);
      }
    }
  }

  try {
    const rawSubs = await getSubtitles({ type, id, extra: extraParams, config });
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
}

// Rotas de Busca de Legendas (Padrão)
app.get('/subtitles/:type/:id.json', (req, res) => handleSubtitlesRequest(req, res, ''));
app.get('/subtitles/:type/:id/:extra.json', (req, res) => handleSubtitlesRequest(req, res, ''));

// Rotas de Busca de Legendas (Com Configuração do Usuário)
app.get('/:config/subtitles/:type/:id.json', (req, res) => handleSubtitlesRequest(req, res, req.params.config));
app.get('/:config/subtitles/:type/:id/:extra.json', (req, res) => handleSubtitlesRequest(req, res, req.params.config));

// Endpoint de entrega e streaming WebVTT
app.get('/subtitle/:token/:season/:episode.vtt', async (req, res) => {
  const { token } = req.params;

  try {
    const vttData = await resolveAndDownloadSubtitle(token);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(vttData);
  } catch (err) {
    console.error('Falha servindo legenda:', err.message);
    res.status(404).send('WEBVTT\n\n1\n00:00:01.000 --> 00:00:05.000\nLegenda não encontrada\n');
  }
});

// Telemetria & Status
app.get('/stats', (req, res) => {
  res.json({
    status: 'ok',
    addon: 'SubFlow',
    version: '1.3.0',
    uptime: process.uptime(),
    cache: cache.getStats()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'SubFlow' });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🌊 SubFlow Addon rodando em: http://localhost:${PORT}`);
  console.log(`📋 Manifest URL: http://localhost:${PORT}/manifest.json`);
  console.log(`======================================================\n`);
});

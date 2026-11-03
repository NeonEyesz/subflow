const axios = require('axios');
const zlib = require('zlib');
const { bufferToUtf8, srtToVtt } = require('../utils/converter');

const PLUS = 'https://opensubtitles.stremio.homes/pt-br|pt-pt|en/ai-translated=true|from=all|auto-adjustment=false';
const OFFICIAL = 'https://opensubtitles-v3.strem.io';
const USER_AGENT = 'SubFlow/1.3 (+https://subflow-3qa3.onrender.com)';
const TTL_MS = 5 * 60 * 1000;
const searches = new Map();

function allowedDownloadUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
      (u.hostname === 'opensubtitles.stremio.homes' || /^subs\d*\.strem\.io$/.test(u.hostname));
  } catch { return false; }
}

function normalizeCandidate(sub, source) {
  const code = String(sub.lang_code || sub.lang || '').toLowerCase();
  const language = ['pt-br', 'pob', 'pb'].includes(code) ? 'pob' :
    ['en', 'eng'].includes(code) ? 'eng' :
    ['pt', 'pt-pt', 'por'].includes(code) ? 'por' : null;
  if (!language || !allowedDownloadUrl(sub.url)) return null;
  const releaseName = String(sub.title || sub.subtitleFileName || sub.movieReleaseName || '');
  return {
    sourceKey: source,
    providerId: String(sub.sub_id || sub.id || ''),
    downloadUrl: sub.url,
    releaseName,
    language,
    isPtBr: language === 'pob',
    isForced: /\bforced\b|forçada/i.test(releaseName),
    fromHashMatch: sub.m === 'h' || sub.hash_match === true,
    aiTranslated: sub.ai_translated === true
  };
}

async function searchOpenSubtitlesV3Plus({ type, id, extra = {} }) {
  const params = [];
  if (extra.videoHash) params.push(`videoHash=${encodeURIComponent(extra.videoHash)}`);
  if (extra.videoSize) params.push(`videoSize=${encodeURIComponent(extra.videoSize)}`);
  if (extra.filename) params.push(`filename=${encodeURIComponent(extra.filename)}`);
  const suffix = params.length ? `/${params.join('&')}` : '';
  const safeType = encodeURIComponent(type);
  const safeId = encodeURIComponent(id);
  const key = JSON.stringify([type,id,extra.videoHash,extra.videoSize,extra.filename]);
  const cached = searches.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const ask = async (base, source, withExtra) => {
    try {
      const url = `${base}/subtitles/${safeType}/${safeId}${withExtra ? suffix : ''}.json`;
      const response = await axios.get(url, { timeout: 3500, headers: { 'User-Agent': USER_AGENT } });
      return (Array.isArray(response.data?.subtitles) ? response.data.subtitles : [])
        .map(s => normalizeCandidate(s, source)).filter(Boolean);
    } catch { return []; }
  };
  // Both sources race in parallel; the enhanced source is allowed a limited time.
  const [enhanced, official] = await Promise.all([ask(PLUS,'v3plus',true), ask(OFFICIAL,'stremio',true)]);
  let results = [...enhanced, ...official];
  // Some servers reject the optional parameters: retry the simple official route.
  if (!results.length && suffix) results = await ask(OFFICIAL,'stremio',false);
  const seen = new Set();
  results = results.filter(c => !seen.has(c.downloadUrl) && seen.add(c.downloadUrl));
  if (results.length) {
    if (searches.size >= 200) searches.delete(searches.keys().next().value);
    searches.set(key, { value: results, expires: Date.now() + TTL_MS });
  }
  return results;
}

async function downloadSubtitle(candidate, cleanAds = true, signal) {
  if (!allowedDownloadUrl(candidate.downloadUrl)) throw new Error('Endereço da legenda não permitido');
  const result = await axios.get(candidate.downloadUrl, {
    responseType: 'arraybuffer', timeout: 4500, maxRedirects: 0,
    maxContentLength: 4 * 1024 * 1024, signal, headers: { 'User-Agent': USER_AGENT }
  });
  let buffer = Buffer.from(result.data);
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = zlib.gunzipSync(buffer, { maxOutputLength: 4 * 1024 * 1024 });
  const vtt = srtToVtt(bufferToUtf8(buffer), cleanAds);
  if (!/\d{2}:\d{2}[:.]\d{2}\.\d{3}\s*-->/.test(vtt)) throw new Error('A fonte não retornou falas válidas');
  return vtt;
}

module.exports = { searchOpenSubtitlesV3Plus, downloadSubtitle, allowedDownloadUrl, normalizeCandidate };

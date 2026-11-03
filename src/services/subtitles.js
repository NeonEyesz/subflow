const crypto = require('crypto');
const { searchOpenSubtitlesV3Plus, downloadSubtitle, allowedDownloadUrl } = require('./opensubtitles');
const cache = require('../utils/cache');
const inFlight = new Map();

function tokens(s) {
  return String(s || '').toLowerCase().replace(/web[. _-]?dl/g,'webdl').replace(/blu[. _-]?ray/g,'bluray')
    .replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(Boolean);
}
function rankCandidates(candidates, {filename}) {
  const target = new Set(tokens(filename));
  const cues = ['webdl','webrip','bluray','hdtv','remux','amzn','nf','dsnp','hmax','atvp','flux','ntb','rarbg','yts'];
  return candidates.map((c,index) => {
    const parts = new Set(tokens(c.releaseName));
    let score = c.fromHashMatch ? 10000 : 0;
    for (const t of cues) {
      if (target.has(t) && parts.has(t)) score += 180;
      else if (target.has(t) && ['webdl','webrip','bluray','hdtv'].includes(t) &&
        cues.some(other => other!==t && ['webdl','webrip','bluray','hdtv'].includes(other) && parts.has(other))) score -= 160;
    }
    for (const t of ['2160p','1080p','720p','x264','x265','hevc']) if (target.has(t) && parts.has(t)) score += 20;
    if (c.isForced) score -= 2500;
    if (/\bcd[ ._-]?[12]\b/i.test(c.releaseName) && !/\bcd[ ._-]?[12]\b/i.test(filename || '')) score -= 1000;
    if (c.aiTranslated) score -= 30;
    return {...c, rankingScore: score, originalIndex: index};
  }).sort((a,b)=>b.rankingScore-a.rankingScore || a.originalIndex-b.originalIndex);
}
// Providers often list the same release several times (including HI variants).
// Keep different release names in different tracks: the first successful HTTP
// response must not silently switch the viewer to a different cut of the video.
function releaseKey(candidate) {
  const parts = tokens(candidate.releaseName);
  while (parts.length && ['srt','vtt','ass','ssa','sub','hi','sdh','cc','pt','ptbr','eng','en'].includes(parts[parts.length - 1])) parts.pop();
  return parts.length ? parts.join(' ') : `url:${candidate.downloadUrl}`;
}
function groupCandidateReleases(candidates, extra, limit = 3) {
  const groups = new Map();
  const standard = candidates.filter(candidate => !candidate.isForced &&
    !/\b(?:commentary|commentaries|director.?s[ ._-]*comments?|audio[ ._-]*commentary)\b/i.test(candidate.releaseName || ''));
  for (const candidate of rankCandidates(standard.length ? standard : candidates, extra)) {
    const key = releaseKey(candidate);
    if (!groups.has(key)) {
      if (groups.size >= limit) continue;
      groups.set(key, []);
    }
    const group = groups.get(key);
    if (group.length < 5) group.push(candidate);
  }
  return [...groups.values()];
}
function parseUserConfig(configStr) {
  const p = new URLSearchParams(configStr || '');
  return {enablePtBr:p.get('ptbr')!=='0', enableEnglish:p.get('eng')!=='0', fallbackPtPt:p.get('ptpt')!=='0', cleanAds:p.get('ads')!=='0'};
}
async function getSubtitles({type,id,extra={},config=''}) {
  if (!['movie','series'].includes(type) || !/^tt\d+(?::\d+:\d+)?$/.test(id)) return [];
  const settings = parseUserConfig(config);
  const all = await searchOpenSubtitlesV3Plus({type,id,extra});
  const parts = id.split(':'); const season = parts[1] || '0', episode = parts[2] || '0';
  const outputs = [];
  function add(language, lang, label) {
    const groups = groupCandidateReleases(all.filter(c=>c.language===language), extra);
    groups.forEach((ranked,index) => {
    const urls=ranked.map(c=>c.downloadUrl);
    const k=crypto.createHash('sha256').update(JSON.stringify([id,language,extra.videoHash||'',extra.filename||'',settings.cleanAds,urls])).digest('hex');
    const payload={v:2,u:urls,k,a:settings.cleanAds,h:ranked[0].fromHashMatch===true};
    const token=Buffer.from(JSON.stringify(payload)).toString('base64url');
    // A stable per-series/language ID lets clients that remember a track match it
    // in the next episode. The URL itself remains episode-specific.
    const trackId = type === 'series' ? parts[0] : id;
    const suffix = index === 0 ? '' : `-opcao${index + 1}`;
    outputs.push({id:`subflow-${language}-${trackId}${suffix}`,url:`/subtitle/${token}/${season}/${episode}.vtt`,lang,
      label: groups.length > 1 ? `${label} • Opção ${index + 1}` : label});
    });
  }
  // The player applies its preferred-language setting; both choices remain available.
  if(settings.enableEnglish) add('eng','eng','SubFlow • Inglês');
  if(settings.enablePtBr) {
    if(all.some(c=>c.language==='pob')) add('pob','pob','SubFlow • Português (Brasil)');
    else if(settings.fallbackPtPt) add('por','por','SubFlow • Português (Portugal)');
  }
  return outputs;
}
async function resolveAndDownloadSubtitle(token) {
  if(typeof token!=='string' || token.length>16000 || !/^[\w-]+$/.test(token)) throw new Error('Token inválido');
  let payload; try { payload=JSON.parse(Buffer.from(token,'base64url').toString('utf8')); } catch { throw new Error('Token inválido'); }
  // Existing Nuvio preferences may still point at the old compact token format.
  // Re-resolve its IDs from trusted providers rather than fabricating a URL.
  if(payload.v!==2 && Array.isArray(payload.c) && typeof payload.k==='string') {
    const match=payload.k.match(/^subflow-(en|pt)-(tt\d+(?::\d+:\d+)?)-(.+)$/);
    if(!match || payload.c.length>6) throw new Error('Token antigo inválido');
    const [,language,id,release]=match;
    const extra=release==='default'?{}:{filename:release};
    const found=await searchOpenSubtitlesV3Plus({type:id.includes(':')?'series':'movie',id,extra});
    const requested=new Map(payload.c.map((entry,index)=>[String(entry[0]),index]));
    const relevant=found.filter(c=>requested.has(String(c.providerId)) && (language==='en'?c.language==='eng':['pob','por'].includes(c.language)));
    relevant.sort((a,b)=>requested.get(String(a.providerId))-requested.get(String(b.providerId)));
    if(!relevant.length) throw new Error('Legenda antiga indisponível; selecione novamente');
    payload={v:2,u:relevant.slice(0,5).map(c=>c.downloadUrl),a:payload.a===true};
  }
  if(payload.v!==2 || !Array.isArray(payload.u) || payload.u.length<1 || payload.u.length>5 || payload.u.some(u=>!allowedDownloadUrl(u))) throw new Error('Candidatos inválidos');
  // Derive the cache key from validated contents: a token cannot choose another entry.
  const cacheKey='v2-'+crypto.createHash('sha256').update(JSON.stringify([payload.u,payload.a===true])).digest('hex');
  const existing=cache.get(cacheKey); if(existing) return existing;
  if(inFlight.has(cacheKey)) return inFlight.get(cacheKey);
  const task = (async()=>{
    const controller=new AbortController();
    const timers=[];
    const attempts=payload.u.map((url,index)=>new Promise((resolve,reject)=>{
      // Preserve the most reliable choice for a little longer when it has a hash match.
      const delay=index===0?0:(payload.h===true?2500:1000)+(index-1)*700;
      const timer=setTimeout(async()=>{
        try { resolve(await downloadSubtitle({downloadUrl:url},payload.a===true,controller.signal)); }
        catch(err) { reject(err); }
      },delay);
      timers.push(timer);
    }));
    try {
      const vtt=await Promise.any(attempts); cache.set(cacheKey,vtt); return vtt;
    } catch { throw new Error('Nenhuma legenda pôde ser carregada'); }
    finally { controller.abort(); timers.forEach(clearTimeout); }
  })();
  inFlight.set(cacheKey,task);
  try { return await task; } finally { if(inFlight.get(cacheKey)===task) inFlight.delete(cacheKey); }
}
module.exports={getSubtitles,resolveAndDownloadSubtitle,parseUserConfig,rankCandidates,groupCandidateReleases};

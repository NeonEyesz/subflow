const { searchOpenSubtitlesV3, searchOpenSubtitlesRest, downloadOpenSubtitle } = require('./opensubtitles');
const { searchSubDL, downloadSubDL } = require('./subdl');
const cache = require('../utils/cache');

/**
 * Calcula score de similaridade entre a release do arquivo e o nome da legenda
 */
function calculateReleaseMatchScore(candidateRelease, targetFilename) {
  if (!candidateRelease || !targetFilename) return 0;

  const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  const targetTokens = new Set(normalize(targetFilename));
  const candidateTokens = normalize(candidateRelease);

  let matches = 0;
  for (const token of candidateTokens) {
    if (targetTokens.has(token)) {
      matches++;
    }
  }

  return matches * 10;
}

/**
 * Classifica e ordena os candidatos de legenda
 */
function rankCandidates(candidates, { filename, moviehash }) {
  return candidates.map(candidate => {
    let score = 0;

    // Se bateu o VideoHash, prioridade máxima
    if (candidate.fromHashMatch) {
      score += 1000;
    }

    // Se é estritamente PT-BR confirmado (pob)
    if (candidate.isPtBr) {
      score += 300;
    }

    // Compatibilidade com o nome do arquivo / release
    if (filename && candidate.releaseName) {
      score += calculateReleaseMatchScore(candidate.releaseName, filename);
    }

    // Popularidade e avaliações
    score += Math.min((candidate.downloads || 0) / 100, 50);
    score += (candidate.ratings || 0) * 10;

    return {
      ...candidate,
      rankingScore: score
    };
  }).sort((a, b) => b.rankingScore - a.rankingScore);
}

/**
 * Busca legendas e gera a lista de candidatos ordenados com payload base64
 */
async function getSubtitles({ type, id, extra = {} }) {
  let imdbId = id;
  let season = null;
  let episode = null;

  // Extrai informações para séries (ex: tt0903747:1:1)
  if (id.includes(':')) {
    const parts = id.split(':');
    imdbId = parts[0];
    season = parseInt(parts[1], 10);
    episode = parseInt(parts[2], 10);
  }

  const queryParams = {
    type,
    id,
    imdbId,
    season,
    episode,
    moviehash: extra.videoHash,
    bytesize: extra.videoSize,
    filename: extra.filename,
    extra
  };

  // Executa buscas em paralelo nos múltiplos provedores
  const [openSubV3Results, openSubRestResults, subdlResults] = await Promise.all([
    searchOpenSubtitlesV3(queryParams),
    searchOpenSubtitlesRest(queryParams),
    searchSubDL(queryParams)
  ]);

  const allCandidates = [...openSubV3Results, ...openSubRestResults, ...subdlResults];

  if (allCandidates.length === 0) {
    return [];
  }

  // Ordena por ranking e compatibilidade
  const ranked = rankCandidates(allCandidates, queryParams);

  // Limita aos melhores 8 candidatos para o payload
  const topCandidates = ranked.slice(0, 8).map((cand, idx) => ({
    sourceKey: cand.sourceKey,
    providerId: cand.providerId,
    fileId: cand.fileId,
    downloadUrl: cand.downloadUrl,
    releaseName: cand.releaseName,
    ranking: idx + 1
  }));

  const payload = {
    candidatos: topCandidates,
    cacheKey: `sub-${id}-${extra.videoHash || 'nohash'}`,
    release: topCandidates.map(c => c.releaseName).filter(Boolean),
    fallback: null
  };

  const token = Buffer.from(JSON.stringify(payload)).toString('base64');
  const seasonParam = season !== null ? season : 0;
  const episodeParam = episode !== null ? episode : 0;

  return [
    {
      id: `syncsubs-external-${token.substring(0, 20)}`,
      url: `/subtitle/${encodeURIComponent(token)}/${seasonParam}/${episodeParam}.vtt`,
      lang: 'pob',
      label: 'SyncSubs [PT-BR Automático]'
    }
  ];
}

/**
 * Tenta baixar a legenda do candidato atual. Se falhar, executa fallback automático para os próximos!
 */
async function resolveAndDownloadSubtitle(token) {
  let payload;
  try {
    const jsonStr = Buffer.from(token, 'base64').toString('utf-8');
    payload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Token de legenda inválido');
  }

  const { candidatos, cacheKey } = payload;

  // 1. Verifica no cache persistente
  if (cacheKey && cache.has(cacheKey)) {
    const cachedVtt = cache.get(cacheKey);
    if (cachedVtt) {
      console.log(`[Cache Hit] Legenda servida do cache: ${cacheKey}`);
      return cachedVtt;
    }
  }

  if (!candidatos || candidatos.length === 0) {
    throw new Error('Nenhum candidato de legenda disponível');
  }

  let lastError = null;

  // 2. Loop de Fallback Automático (tenta candidato 0, 1, 2...)
  for (let i = 0; i < candidatos.length; i++) {
    const candidate = candidatos[i];
    console.log(`[SyncSubs] Tentando baixar candidato #${i + 1} (${candidate.sourceKey} - ${candidate.releaseName || candidate.providerId})`);

    try {
      let vttContent = null;

      if (candidate.sourceKey === 'opensubtitlesv3plus' || candidate.sourceKey === 'opensubtitles_rest') {
        vttContent = await downloadOpenSubtitle(candidate);
      } else if (candidate.sourceKey === 'subdl') {
        vttContent = await downloadSubDL(candidate);
      }

      if (vttContent && vttContent.includes('WEBVTT')) {
        console.log(`[SyncSubs] Sucesso no candidato #${i + 1}! Gravando em cache...`);
        // Salva no cache para acessos futuros instantâneos
        if (cacheKey) {
          cache.set(cacheKey, vttContent);
        }
        return vttContent;
      }
    } catch (err) {
      console.warn(`[SyncSubs] Falha no candidato #${i + 1}: ${err.message}. Tentando próximo...`);
      lastError = err;
    }
  }

  throw new Error(`Todos os ${candidatos.length} candidatos de legenda falharam: ${lastError ? lastError.message : 'desconhecido'}`);
}

module.exports = {
  getSubtitles,
  resolveAndDownloadSubtitle
};

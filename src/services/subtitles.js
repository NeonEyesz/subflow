const { searchOpenSubtitlesV3, searchOpenSubtitlesRest, downloadOpenSubtitle } = require('./opensubtitles');
const { searchSubDL, downloadSubDL } = require('./subdl');
const cache = require('../utils/cache');

/**
 * Normaliza e calcula similaridade entre a release do arquivo de vídeo e o título da legenda.
 */
function calculateReleaseMatchScore(candidateRelease, targetFilename) {
  if (!candidateRelease || !targetFilename) return 0;

  const clean = str => str.toLowerCase()
    .replace(/[\[\]\(\)\._-]/g, ' ')
    .replace(/\b(1080p|720p|2160p|4k|hdr|bluray|web-dl|webrip|x264|x265|hevc|aac|dts)\b/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);

  const targetTokens = new Set(clean(targetFilename));
  const candidateTokens = clean(candidateRelease);

  let matches = 0;
  for (const token of candidateTokens) {
    if (targetTokens.has(token)) {
      if (['1080p', '2160p', '4k', 'bluray', 'web-dl', 'yts', 'rarbg', 'psa'].includes(token)) {
        matches += 3;
      } else {
        matches += 1;
      }
    }
  }

  return matches * 15;
}

/**
 * Classifica e ordena os candidatos de legenda
 */
function rankCandidates(candidates, { filename, moviehash }) {
  return candidates.map(candidate => {
    let score = 0;

    // Se bateu o VideoHash, prioridade absoluta
    if (candidate.fromHashMatch) {
      score += 1000;
    }

    // Se é estritamente PT-BR confirmado (pob)
    if (candidate.isPtBr) {
      score += 300;
    }

    // Compatibilidade com o nome do arquivo / release / anime
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
 * Decodifica configurações do usuário a partir da URL
 */
function parseUserConfig(configStr) {
  const defaults = {
    enablePtBr: true,
    enableEnglish: true,
    fallbackPtPt: true,
    cleanAds: true
  };

  if (!configStr) return defaults;

  try {
    const params = new URLSearchParams(configStr);
    return {
      enablePtBr: params.get('ptbr') !== '0',
      enableEnglish: params.get('eng') !== '0',
      fallbackPtPt: params.get('ptpt') !== '0',
      cleanAds: params.get('ads') !== '0'
    };
  } catch (err) {
    return defaults;
  }
}

/**
 * Busca legendas e gera a lista de candidatos com suporte a múltiplos idiomas e configurações
 */
async function getSubtitles({ type, id, extra = {}, config = '' }) {
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

  const userConfig = parseUserConfig(config);

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

  // Executa buscas em paralelo
  const [openSubV3Results, openSubRestResults, subdlResults] = await Promise.all([
    searchOpenSubtitlesV3(queryParams),
    searchOpenSubtitlesRest(queryParams),
    searchSubDL(queryParams)
  ]);

  const allCandidates = [...openSubV3Results, ...openSubRestResults, ...subdlResults];

  if (allCandidates.length === 0) {
    return [];
  }

  const seasonParam = season !== null ? season : 0;
  const episodeParam = episode !== null ? episode : 0;
  const results = [];

  // 1. Faixa PT-BR (Português Brasileiro)
  if (userConfig.enablePtBr) {
    let ptCandidates = allCandidates.filter(c => c.language === 'pob');

    let isFallback = false;
    if (ptCandidates.length === 0 && userConfig.fallbackPtPt) {
      ptCandidates = allCandidates.filter(c => c.language === 'por');
      isFallback = ptCandidates.length > 0;
    }

    if (ptCandidates.length > 0) {
      const rankedPt = rankCandidates(ptCandidates, queryParams).slice(0, 8);
      const topPt = rankedPt.map((cand, idx) => ({
        sourceKey: cand.sourceKey,
        providerId: cand.providerId,
        fileId: cand.fileId,
        downloadUrl: cand.downloadUrl,
        releaseName: cand.releaseName,
        cleanAds: userConfig.cleanAds,
        ranking: idx + 1
      }));

      const ptPayload = {
        candidatos: topPt,
        cacheKey: `subflow-pt-${id}-${extra.videoHash || 'nohash'}`,
        release: topPt.map(c => c.releaseName).filter(Boolean),
        cleanAds: userConfig.cleanAds,
        fallback: null
      };

      const ptToken = Buffer.from(JSON.stringify(ptPayload)).toString('base64');
      results.push({
        id: `subflow-pt-${ptToken.substring(0, 16)}`,
        url: `/subtitle/${encodeURIComponent(ptToken)}/${seasonParam}/${episodeParam}.vtt`,
        lang: 'pob',
        label: isFallback ? 'SubFlow [Português - Fallback]' : 'SubFlow [PT-BR Automático]'
      });
    }
  }

  // 2. Faixa Inglês (English Sync)
  if (userConfig.enableEnglish) {
    const enCandidates = allCandidates.filter(c => c.language === 'eng');
    if (enCandidates.length > 0) {
      const rankedEn = rankCandidates(enCandidates, queryParams).slice(0, 8);
      const topEn = rankedEn.map((cand, idx) => ({
        sourceKey: cand.sourceKey,
        providerId: cand.providerId,
        fileId: cand.fileId,
        downloadUrl: cand.downloadUrl,
        releaseName: cand.releaseName,
        cleanAds: userConfig.cleanAds,
        ranking: idx + 1
      }));

      const enPayload = {
        candidatos: topEn,
        cacheKey: `subflow-en-${id}-${extra.videoHash || 'nohash'}`,
        release: topEn.map(c => c.releaseName).filter(Boolean),
        cleanAds: userConfig.cleanAds,
        fallback: null
      };

      const enToken = Buffer.from(JSON.stringify(enPayload)).toString('base64');
      results.push({
        id: `subflow-en-${enToken.substring(0, 16)}`,
        url: `/subtitle/${encodeURIComponent(enToken)}/${seasonParam}/${episodeParam}.vtt`,
        lang: 'eng',
        label: 'SubFlow [English Sync]'
      });
    }
  }

  // 3. Faixa de Legendas Forçadas (Forced Subtitles) se detectada
  const forcedCandidates = allCandidates.filter(c => c.isForced);
  if (forcedCandidates.length > 0) {
    const rankedForced = rankCandidates(forcedCandidates, queryParams).slice(0, 4);
    const topForced = rankedForced.map((cand, idx) => ({
      sourceKey: cand.sourceKey,
      providerId: cand.providerId,
      fileId: cand.fileId,
      downloadUrl: cand.downloadUrl,
      releaseName: cand.releaseName,
      cleanAds: userConfig.cleanAds,
      ranking: idx + 1
    }));

    const forcedPayload = {
      candidatos: topForced,
      cacheKey: `subflow-forced-${id}-${extra.videoHash || 'nohash'}`,
      release: topForced.map(c => c.releaseName).filter(Boolean),
      cleanAds: userConfig.cleanAds,
      fallback: null
    };

    const forcedToken = Buffer.from(JSON.stringify(forcedPayload)).toString('base64');
    results.push({
      id: `subflow-forced-${forcedToken.substring(0, 16)}`,
      url: `/subtitle/${encodeURIComponent(forcedToken)}/${seasonParam}/${episodeParam}.vtt`,
      lang: 'pob',
      label: 'SubFlow [PT-BR Forçada / Trechos Estrangeiros]'
    });
  }

  return results;
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

  const { candidatos, cacheKey, cleanAds = true } = payload;

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

  // 2. Loop de Fallback Automático
  for (let i = 0; i < candidatos.length; i++) {
    const candidate = candidatos[i];
    console.log(`[SubFlow] Tentando baixar candidato #${i + 1} (${candidate.sourceKey} - ${candidate.releaseName || candidate.providerId})`);

    try {
      let vttContent = null;

      if (candidate.sourceKey === 'opensubtitlesv3plus' || candidate.sourceKey === 'opensubtitles_rest') {
        vttContent = await downloadOpenSubtitle(candidate, cleanAds);
      } else if (candidate.sourceKey === 'subdl') {
        vttContent = await downloadSubDL(candidate);
      }

      if (vttContent && vttContent.includes('WEBVTT')) {
        console.log(`[SubFlow] Sucesso no candidato #${i + 1}! Gravando em cache...`);
        if (cacheKey) {
          cache.set(cacheKey, vttContent);
        }
        return vttContent;
      }
    } catch (err) {
      console.warn(`[SubFlow] Falha no candidato #${i + 1}: ${err.message}. Tentando próximo...`);
      lastError = err;
    }
  }

  throw new Error(`Todos os ${candidatos.length} candidatos de legenda falharam: ${lastError ? lastError.message : 'desconhecido'}`);
}

module.exports = {
  getSubtitles,
  resolveAndDownloadSubtitle,
  parseUserConfig
};

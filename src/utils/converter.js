const iconv = require('iconv-lite');
const chardet = require('chardet');

/**
 * Padrões de regex para identificar propagandas comuns em legendas
 */
const AD_PATTERNS = [
  /opensubtitles/i,
  /subdl\.com/i,
  /legendas\.tv/i,
  /baixadofilmes/i,
  /yify/i,
  /yts\.(mx|am|lt|ag)/i,
  /subscene/i,
  /traduzido por/i,
  /tradu[cç][aã]o:?/i,
  /sincronizado por/i,
  /sincronia:?/i,
  /legenda ripada/i,
  /resync by/i,
  /subtitles by/i,
  /corrected by/i,
  /encoded by/i,
  /www\.[a-z0-9-]+\.(com|net|org|br|to|tv|cc|io|xyz|top|me)/i,
  /https?:\/\/[^\s]+/i,
  /bet(365|ano|fair|777|nacional)/i,
  /1xbet/i,
  /apostas?/i,
  /cassino/i,
  /blaze/i
];

/**
 * Converte um buffer de dados de legenda para string UTF-8 limpa.
 */
function bufferToUtf8(buffer) {
  if (!buffer || buffer.length === 0) return '';

  let encoding = chardet.detect(buffer);
  if (!encoding) {
    encoding = 'UTF-8';
  }

  const encLower = encoding.toLowerCase();
  let selectedEncoding = 'utf-8';

  if (encLower.includes('windows-1252') || encLower.includes('iso-8859-1') || encLower.includes('latin')) {
    selectedEncoding = 'windows-1252';
  } else if (encLower.includes('utf-16') || encLower.includes('utf16')) {
    selectedEncoding = encLower.includes('le') ? 'utf-16le' : 'utf-16be';
  }

  try {
    const decoded = iconv.decode(buffer, selectedEncoding);
    return decoded.replace(/^\uFEFF/, '');
  } catch (err) {
    return buffer.toString('utf-8').replace(/^\uFEFF/, '');
  }
}

/**
 * Higieniza o texto de diálogo (remove tags html malformadas ou preserva formatação limpa)
 */
function sanitizeSubtitleLine(line) {
  if (!line) return '';
  // Remove tags de font color malformadas preservando o texto interno
  let cleaned = line.replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '');
  return cleaned;
}

/**
 * Remove blocos de anúncios e propagandas de uma legenda
 */
function cleanSubtitleText(text) {
  if (!text) return '';

  const blocks = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);
  const cleanedBlocks = [];
  let blockIndex = 1;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    const timeIndex = lines.findIndex(l => l.includes('-->'));
    if (timeIndex === -1) continue;

    const timeLine = lines[timeIndex];
    const dialogLines = lines.slice(timeIndex + 1).map(sanitizeSubtitleLine).filter(Boolean);

    if (dialogLines.length === 0) continue;

    const combinedDialog = dialogLines.join(' ');

    // Se o diálogo contiver padrão de propaganda, ignora este bloco
    const isAd = AD_PATTERNS.some(pattern => pattern.test(combinedDialog));
    if (!isAd) {
      cleanedBlocks.push(`${blockIndex}\n${timeLine}\n${dialogLines.join('\n')}`);
      blockIndex++;
    }
  }

  return cleanedBlocks.join('\n\n');
}

/**
 * Converte conteúdo de legenda SRT para WebVTT padrão limpo e higienizado.
 */
function srtToVtt(srtContent, shouldCleanAds = true) {
  if (!srtContent) return 'WEBVTT\n\n';

  let content = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Substitui separadores de tempo SRT (vírgula) por VTT (ponto)
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  // Limpa anúncios se habilitado
  if (shouldCleanAds) {
    content = cleanSubtitleText(content);
  }

  if (!content.startsWith('WEBVTT')) {
    content = `WEBVTT\n\n${content}\n`;
  }

  return content;
}

module.exports = {
  bufferToUtf8,
  srtToVtt,
  cleanSubtitleText,
  sanitizeSubtitleLine
};

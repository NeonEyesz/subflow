const iconv = require('iconv-lite');
const chardet = require('chardet');

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
 * Converte qualquer formato de legenda (SRT ou WebVTT bruto) em WebVTT 100% em conformidade com o padrão RFC.
 * Remove cabeçalhos duplicados, anotações NOTE que corrompem timestamps e anúncios de cassino/apostas.
 */
function srtToVtt(rawText, shouldCleanAds = true) {
  if (!rawText) return 'WEBVTT\n\n';

  let lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cleanedCues = [];
  let currentCue = null;

  const timeRegex = /(?:(\d{2}:)?\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(?:(\d{2}:)?\d{2}:\d{2}[,\.]\d{3})/;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Ignora declarações repetidas de WEBVTT ou tags de cabeçalho do scraper
    if (line.startsWith('WEBVTT') || line.startsWith('header') || line.startsWith('X-TIMESTAMP') || line.startsWith('<u>') || line.startsWith('</u>')) {
      continue;
    }

    // Limpa prefixo NOTE caso tenha sido colado na linha de tempo ou texto
    if (line.startsWith('NOTE')) {
      line = line.replace(/^NOTE\s*/i, '').trim();
    }

    // Identifica linha de tempo
    const match = line.match(timeRegex);
    if (match) {
      let timeLine = match[0].replace(/,/g, '.');
      
      // Garante formato HH:MM:SS.mmm em ambos os lados
      const parts = timeLine.split('-->').map(p => {
        let t = p.trim();
        if (t.split(':').length === 2) t = '00:' + t;
        return t;
      });
      timeLine = parts[0] + ' --> ' + parts[1];

      currentCue = {
        time: timeLine,
        lines: []
      };
      cleanedCues.push(currentCue);
      continue;
    }

    // Se estivermos dentro de uma fala
    if (currentCue && line && !line.match(/^\d+$/)) {
      // Decodifica entidades HTML e limpa tags malformadas
      line = line
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<font[^>]*>/gi, '')
        .replace(/<\/font>/gi, '');

      // Filtra anúncios se habilitado
      if (shouldCleanAds) {
        const isAd = /opensubtitles|subdl|yify|yts\.|legendas\.tv|bet(365|ano|fair|777|nacional)|1xbet|apostas?|cassino|blaze|traduzido por|sincronizado por/i.test(line);
        if (isAd) continue;
      }

      currentCue.lines.push(line);
    }
  }

  const output = ['WEBVTT\n'];
  let index = 1;

  for (const cue of cleanedCues) {
    if (cue.lines.length > 0) {
      output.push(String(index));
      output.push(cue.time);
      output.push(cue.lines.join('\n'));
      output.push('');
      index++;
    }
  }

  return output.join('\n');
}

module.exports = {
  bufferToUtf8,
  srtToVtt
};

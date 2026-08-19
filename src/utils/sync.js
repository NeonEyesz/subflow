/**
 * Utilitário de Sincronização Inteligente de Legendas
 * Sincroniza o tempo de uma legenda em Português usando os timestamps da legenda de referência em Inglês.
 */

// Converte string de tempo "00:01:23.456" para milissegundos
function timeToMs(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;

  let hours = 0;
  let mins = 0;
  let secs = 0;

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10) || 0;
    mins = parseInt(parts[1], 10) || 0;
    secs = parseFloat(parts[2].replace(',', '.')) || 0;
  } else if (parts.length === 2) {
    mins = parseInt(parts[0], 10) || 0;
    secs = parseFloat(parts[1].replace(',', '.')) || 0;
  }

  return Math.round((hours * 3600 + mins * 60 + secs) * 1000);
}

// Converte milissegundos para string de tempo WebVTT "00:01:23.456"
function msToTime(ms) {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

/**
 * Extrai blocos de fala e seus timestamps
 */
function parseCues(vttContent) {
  if (!vttContent) return [];
  const lines = vttContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues = [];
  let currentCue = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const parts = line.split('-->');
      const startMs = timeToMs(parts[0]);
      const endMs = timeToMs(parts[1].split(' ')[0]);

      currentCue = {
        startMs,
        endMs,
        lines: []
      };
      cues.push(currentCue);
    } else if (currentCue && line && !line.startsWith('WEBVTT') && !line.match(/^\d+$/)) {
      currentCue.lines.push(line);
    }
  }

  return cues;
}

/**
 * Ajusta o sincronismo da legenda (PT-BR) baseando-se na legenda de referência (Inglês)
 * Corrige atrasos de intro (Netflix vs Amazon vs Apple TV) e diferenças de FPS (23.976 vs 25fps)
 */
function autoSyncWithReference(targetVtt, referenceVtt) {
  if (!targetVtt || !referenceVtt) return targetVtt;

  try {
    const targetCues = parseCues(targetVtt);
    const refCues = parseCues(referenceVtt);

    if (targetCues.length < 5 || refCues.length < 5) {
      return targetVtt;
    }

    // Identifica o primeiro diálogo falado significativo (ignora falas abaixo de 3s se forem créditos)
    const firstTargetCue = targetCues.find(c => c.startMs > 2000) || targetCues[0];
    const firstRefCue = refCues.find(c => c.startMs > 2000) || refCues[0];

    // Calcula o offset inicial (delay da introdução/logo)
    const offsetMs = firstRefCue.startMs - firstTargetCue.startMs;

    // Se o offset for muito absurdo (> 2 minutos), provavelmente é um corte estendido diferente, não força
    if (Math.abs(offsetMs) > 120000) {
      return targetVtt;
    }

    // Calcula a duração total dos diálogos para checar drift de FPS (23.976 -> 25fps)
    const lastTargetCue = targetCues[targetCues.length - 1];
    const lastRefCue = refCues[refCues.length - 1];

    const targetDuration = lastTargetCue.startMs - firstTargetCue.startMs;
    const refDuration = lastRefCue.startMs - firstRefCue.startMs;

    let timeScale = 1.0;
    if (targetDuration > 60000 && refDuration > 60000) {
      const ratio = refDuration / targetDuration;
      // Se a diferença de FPS for conhecida (ex: 23.976 vs 25 fps ~ 1.0427 ou 0.959)
      if (Math.abs(ratio - 1.0427) < 0.02 || Math.abs(ratio - 0.959) < 0.02) {
        timeScale = ratio;
      }
    }

    // Aplica o alinhamento
    const syncedLines = ['WEBVTT\n'];
    let index = 1;

    for (const cue of targetCues) {
      const relTime = cue.startMs - firstTargetCue.startMs;
      const relEndTime = cue.endMs - firstTargetCue.startMs;

      const newStartMs = Math.max(0, Math.round(firstRefCue.startMs + (relTime * timeScale)));
      const newEndMs = Math.max(newStartMs + 500, Math.round(firstRefCue.startMs + (relEndTime * timeScale)));

      syncedLines.push(`${index}`);
      syncedLines.push(`${msToTime(newStartMs)} --> ${msToTime(newEndMs)}`);
      syncedLines.push(cue.lines.join('\n'));
      syncedLines.push('');
      index++;
    }

    console.log(`[SubFlow Sync] Auto-Sync aplicado com sucesso! Offset: ${offsetMs}ms, Scale: ${timeScale.toFixed(4)}`);
    return syncedLines.join('\n');
  } catch (err) {
    console.warn('[SubFlow Sync] Erro no auto-sync, mantendo original:', err.message);
    return targetVtt;
  }
}

module.exports = {
  timeToMs,
  msToTime,
  parseCues,
  autoSyncWithReference
};

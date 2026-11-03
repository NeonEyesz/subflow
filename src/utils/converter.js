const iconv = require('iconv-lite');
const chardet = require('chardet');

function bufferToUtf8(buffer) {
  if (!buffer || !buffer.length) return '';
  if (buffer[0]===0xff && buffer[1]===0xfe) return iconv.decode(buffer,'utf-16le').replace(/^\uFEFF/,'');
  if (buffer[0]===0xfe && buffer[1]===0xff) return iconv.decode(buffer,'utf-16be').replace(/^\uFEFF/,'');
  // Valid UTF-8 must not be reinterpreted by a statistical guess.
  const utf8=buffer.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/,'');
  const detected=chardet.detect(buffer) || 'windows-1252';
  try { return iconv.decode(buffer,iconv.encodingExists(detected)?detected:'windows-1252').replace(/^\uFEFF/,''); }
  catch { return utf8.replace(/^\uFEFF/,''); }
}
function srtToVtt(raw, cleanAds=true) {
  if (!raw) return 'WEBVTT\n\n';
  const lines=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  const timing=/^((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})(.*)$/;
  const cues=[]; let cue=null; let metadata=false;
  const finish=()=>{if(cue && cue.lines.length) cues.push(cue); cue=null;};
  for(let i=0;i<lines.length;i++) {
    const line=lines[i].trim();
    if (!line) { finish(); metadata=false; continue; }
    if (/^(WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/i.test(line)) { finish(); metadata=true; continue; }
    if (metadata) continue;
    const m=line.match(timing);
    if(m) {
      finish(); const norm=s=>{s=s.replace(',','.'); return s.split(':').length===2?'00:'+s:s;};
      cue={time:`${norm(m[1])} --> ${norm(m[2])}${m[3] || ''}`,lines:[]}; continue;
    }
    if(!cue) continue;
    if (/^\d+$/.test(line) && i+1<lines.length && timing.test(lines[i+1].trim())) continue;
    if(cleanAds && /(?:https?:\/\/|www\.)\S*(?:opensubtitles|subdl|yify|yts|legendas\.tv|bet365|betano|1xbet|blaze)|^(?:legendas?|tradu[cç][aã]o|sincroniza[cç][aã]o)\s+(?:por|by)\b/i.test(line)) continue;
    cue.lines.push(line.replace(/<\/?font\b[^>]*>/gi,''));
  }
  finish();
  return 'WEBVTT\n\n'+cues.map((c,i)=>`${i+1}\n${c.time}\n${c.lines.join('\n')}\n`).join('\n');
}
module.exports={bufferToUtf8,srtToVtt};

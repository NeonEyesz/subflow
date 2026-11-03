const test=require('node:test');
const assert=require('node:assert/strict');
const {allowedDownloadUrl,normalizeCandidate}=require('../src/services/opensubtitles');
const {rankCandidates,resolveAndDownloadSubtitle}=require('../src/services/subtitles');
const {srtToVtt,bufferToUtf8}=require('../src/utils/converter');
const axios=require('axios');

test('fallback retains its actual download URL and language',()=>{
  const item=normalizeCandidate({id:'30951',lang:'pob',subtitleFileName:'Movie.BluRay.srt',url:'https://subs5.strem.io/en/download/file/36922'},'stremio');
  assert.equal(item.downloadUrl,'https://subs5.strem.io/en/download/file/36922');
  assert.equal(item.language,'pob'); assert.equal(item.releaseName,'Movie.BluRay.srt');
  assert.equal(normalizeCandidate({lang:'spa',url:'https://subs5.strem.io/file/1'},'stremio'),null);
});
test('does not treat another source URL or unknown language as permitted',()=>{
  for(const url of ['http://subs5.strem.io/file','https://subs5.strem.io.evil.example','https://127.0.0.1','https://u:p@subs5.strem.io','file:///tmp/a']) assert.equal(allowedDownloadUrl(url),false,url);
  assert.equal(allowedDownloadUrl('https://subs5.strem.io/file'),true);
});
test('hash match and matching release outrank generic and forced tracks',()=>{
 const a=[{releaseName:'Film.WEB-DL-AMZN',fromHashMatch:false},{releaseName:'Film.BluRay-RARBG',fromHashMatch:false},{releaseName:'Film.BluRay-RARBG forced',isForced:true},{releaseName:'unrelated',fromHashMatch:true}];
 const order=rankCandidates(a,{filename:'Film.BluRay.RARBG.mkv'});
 assert.equal(order[0].releaseName,'unrelated');assert.equal(order[1].releaseName,'Film.BluRay-RARBG');assert.equal(order[3].isForced,true);
});
test('converter keeps short numeric dialogue, markup and UTF-8',()=>{
 const s='1\r\n00:00:01,000 --> 00:00:02,500\r\n2024\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n<u>Olá!</u>\r\n\r\n';
 const v=srtToVtt(bufferToUtf8(Buffer.from(s)));
 assert.match(v,/00:00:01\.000 --> 00:00:02\.500\n2024/);assert.match(v,/<u>Olá!<\/u>/);assert.equal((v.match(/-->/g)||[]).length,2);
});
test('malformed and unsafe subtitle tokens cannot be resolved',async()=>{
 await assert.rejects(resolveAndDownloadSubtitle('abc!'));
 const token=Buffer.from(JSON.stringify({v:2,u:['http://127.0.0.1/secret'],a:true})).toString('base64url');
 await assert.rejects(resolveAndDownloadSubtitle(token));
});
test('same series keeps each language track ID across episodes without reusing URLs',async()=>{
 const old=axios.get;
 axios.get=async url=>({data:{subtitles:[{id:'1',lang:'eng',url:'https://subs5.strem.io/file/1'},{id:'2',lang:'pob',url:'https://subs5.strem.io/file/2'}]}});
 try {
   const {getSubtitles}=require('../src/services/subtitles');
   const first=await getSubtitles({type:'series',id:'tt99999991:1:1'});
   const second=await getSubtitles({type:'series',id:'tt99999991:1:2'});
   assert.deepEqual(first.map(x=>x.lang),['eng','pob']);
   assert.deepEqual(first.map(x=>x.id),second.map(x=>x.id));
   assert.notEqual(first[0].url,second[0].url);
 } finally {axios.get=old;}
});
test('old saved track resolves the original provider URL and loads text',async()=>{
 const old=axios.get; let fetched=''; const expected=`https://subs5.strem.io/en/download/file/17?test=${Date.now()}-${Math.random()}`;
 axios.get=async url=>{
   if(url.includes('/subtitles/')) return {data:{subtitles:[{id:'legacy-pob-17',lang:'pob',url:expected}]}};
   fetched=url; return {data:Buffer.from('1\n00:00:02,000 --> 00:00:03,000\nOlá\n\n')};
 };
 try {
   const token=Buffer.from(JSON.stringify({c:[['legacy-pob-17','Release']],k:'subflow-pt-tt99999992-default',a:true})).toString('base64url');
   const vtt=await resolveAndDownloadSubtitle(token);
   assert.equal(fetched,expected); assert.match(vtt,/Olá/);
 } finally {axios.get=old;}
});
test('a stalled top result falls back quickly and simultaneous requests share work',async()=>{
 const old=axios.get; let requests=0; const unique=`${Date.now()}-${Math.random()}`;
 axios.get=async (url)=>{
   requests++;
   if(url.includes('primary')) return new Promise(()=>{});
   return {data:Buffer.from('1\n00:00:02,000 --> 00:00:03,000\nBackup válido\n\n')};
 };
 try {
   const token=Buffer.from(JSON.stringify({v:2,u:[`https://subs5.strem.io/primary?test=${unique}`,`https://subs5.strem.io/backup?test=${unique}`],a:true})).toString('base64url');
   const start=Date.now(); const [a,b]=await Promise.all([resolveAndDownloadSubtitle(token),resolveAndDownloadSubtitle(token)]);
   assert.equal(a,b); assert.match(a,/Backup válido/); assert.equal(requests,2); assert.ok(Date.now()-start<2500);
 } finally {axios.get=old;}
});

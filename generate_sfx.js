'use strict';
const fs = require('fs');
const SR = 22050;

// note: { f:freq, v:vol, d:dur(s), t:'square'|'triangle', s:startSec }
const SFX = {
  // matches the old Web Audio sequences exactly
  correct: [523,659,784,1047].map((f,i)=>({f,v:.14,d:.16,t:'square',s:i*0.11})),
  wrong:   [{f:300,v:.12,d:.12,t:'square',s:0},{f:200,v:.10,d:.18,t:'square',s:.13}],
  fanfare: [392,523,659,784,1047].map((f,i)=>({f,v:.14,d:.2,t:'square',s:i*0.13})),
  catch: [
    {f:330,v:.12,d:.12,t:'square',s:0},
    {f:392,v:.12,d:.12,t:'square',s:.11},
    {f:494,v:.12,d:.12,t:'square',s:.22},
    {f:659,v:.16,d:.22,t:'square',s:.36},
    {f:988,v:.12,d:.22,t:'triangle',s:.36},
    {f:880,v:.13,d:.20,t:'square',s:.85},   // ball-open ding (baked in)
  ],
  pika: [{f:880,v:.10,d:.08,t:'triangle',s:0},{f:1175,v:.10,d:.12,t:'triangle',s:.09}],
  boot: [
    ...[262,330,392,523].map((f,i)=>({f,v:.10,d:.12,t:'square',s:i*0.16})),  // no leading silence
    {f:784,v:.14,d:.18,t:'square',s:2.25},
    {f:1047,v:.10,d:.18,t:'triangle',s:2.25},
  ],
  blip: [{f:640,v:.06,d:.03,t:'square',s:0}],

  // soft UI feedback (triangle = gentle, good for frequent taps)
  tap:    [{f:880,v:.08,d:.05,t:'triangle',s:0}],
  select: [{f:660,v:.09,d:.06,t:'triangle',s:0},{f:990,v:.09,d:.09,t:'triangle',s:.06}],
  back:   [{f:520,v:.08,d:.06,t:'triangle',s:0},{f:360,v:.08,d:.10,t:'triangle',s:.07}],
};

function wave(type, ph){ // ph in radians
  const s = Math.sin(ph);
  if (type === 'triangle') return (2/Math.PI)*Math.asin(s);
  return s >= 0 ? 1 : -1; // square
}
function render(notes){
  const tail = 0.06;
  const end = Math.max(...notes.map(n=>n.s+n.d)) + tail;
  const N = Math.ceil(end*SR);
  const buf = new Float32Array(N);
  for (const n of notes){
    const start = Math.floor(n.s*SR);
    const len = Math.floor(n.d*SR);
    const k = Math.log(0.001/n.v); // exp decay exponent
    const atk = Math.floor(0.002*SR); // 2ms attack to avoid clicks
    for (let i=0;i<len;i++){
      const t = i/SR;
      let amp = n.v*Math.exp(k*(t/n.d));
      if (i<atk) amp *= i/atk;
      const ph = 2*Math.PI*n.f*t;
      const idx = start+i;
      if (idx<N) buf[idx] += amp*wave(n.t, ph);
    }
  }
  // soft clip
  for (let i=0;i<N;i++){ let v=buf[i]; if(v>0.98)v=0.98; if(v<-0.98)v=-0.98; buf[i]=v; }
  return buf;
}
function writeWav(path, buf){
  const N = buf.length;
  const bytes = Buffer.alloc(44 + N*2);
  bytes.write('RIFF',0); bytes.writeUInt32LE(36+N*2,4); bytes.write('WAVE',8);
  bytes.write('fmt ',12); bytes.writeUInt32LE(16,16); bytes.writeUInt16LE(1,20);
  bytes.writeUInt16LE(1,22); bytes.writeUInt32LE(SR,24); bytes.writeUInt32LE(SR*2,28);
  bytes.writeUInt16LE(2,32); bytes.writeUInt16LE(16,34);
  bytes.write('data',36); bytes.writeUInt32LE(N*2,40);
  for (let i=0;i<N;i++){ let s=Math.round(buf[i]*32767); if(s>32767)s=32767; if(s<-32768)s=-32768; bytes.writeInt16LE(s,44+i*2); }
  fs.writeFileSync(path, bytes);
}
for (const [name,notes] of Object.entries(SFX)){
  const buf = render(notes);
  writeWav(`sfx/${name}.wav`, buf);
  console.log(`sfx/${name}.wav  ${(fs.statSync(`sfx/${name}.wav`).size/1024).toFixed(1)} KB  (${(buf.length/SR).toFixed(2)}s)`);
}

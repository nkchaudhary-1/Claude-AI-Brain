import { CONV, SEED } from "./data/seed.js";
import { Importer } from "./importer/core.js";

/* =========================================================================
   MODEL
   ========================================================================= */
const DOMAINS = {design:{label:"Design"},ai:{label:"AI"},product:{label:"Product"},dev:{label:"Development"},career:{label:"Career"}};
const REGIONS = {
  design:{label:"Design",color:"#ff9447",c:[-.44,.4]},
  ai:{label:"AI",color:"#4a9dff",c:[.24,.5]},
  product:{label:"Product",color:"#ff4f8f",c:[-.8,-.04]},
  dev:{label:"Development",color:"#a56cff",c:[.74,.1]},
  research:{label:"Research",color:"#ffc15c",c:[-.14,-.36]},
  ideas:{label:"Ideas",color:"#25d9b8",c:[.44,-.44]}
};
const RKEYS = Object.keys(REGIONS);
const ICONS = {
  all:'<path d="M2.5 7.2L8 2.8l5.5 4.4v5.8a.9.9 0 01-.9.9H3.4a.9.9 0 01-.9-.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  design:'<path d="M3 13l1-3.5 6.5-6.5 2.5 2.5L6.5 12 3 13z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9 4.5l2.5 2.5" stroke="currentColor" stroke-width="1.2"/>',
  ai:'<rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M6.5 2v2M9.5 2v2M6.5 12v2M9.5 12v2M2 6.5h2M2 9.5h2M12 6.5h2M12 9.5h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  product:'<path d="M8 2l5.5 3v6L8 14l-5.5-3V5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M2.5 5L8 8l5.5-3M8 8v6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  dev:'<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>',
  research:'<circle cx="7" cy="7" r="4.3" stroke="currentColor" stroke-width="1.2"/><path d="M10.2 10.2L13.5 13.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  ideas:'<path d="M8 2.2a4 4 0 00-2.4 7.2c.5.4.8 1 .8 1.6h3.2c0-.6.3-1.2.8-1.6A4 4 0 008 2.2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.4 13h3.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
};
const LAYERS = [
  {key:"foundation",label:"Foundation",f:.46},{key:"skill",label:"Skills",f:.6},{key:"project",label:"Projects",f:.74},
  {key:"experiment",label:"Experiments",f:.8},{key:"research",label:"Research",f:.8},{key:"idea",label:"Ideas",f:.8}
];
const LIDX = Object.fromEntries(LAYERS.map((l,i)=>[l.key,i]));
const TYPE_LABEL = {foundation:"Foundation",skill:"Skill",project:"Project",experiment:"Experiment",research:"Research",idea:"Idea"};
const STATUS_LABEL = {learned:"Learned",exploring:"Exploring",built:"Built",experimenting:"Experimenting",archived:"Archived","in-progress":"In progress",paused:"Paused",idea:"Idea"};
const DAY = 864e5, NOW = Date.now();
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function mapDomain(s){s=String(s||"").toLowerCase().trim();if(DOMAINS[s])return s;
  if(/dev|code|engineer|tech/.test(s))return"dev";if(/design|ui|ux|visual|motion/.test(s))return"design";
  if(/ai|claude|llm|agent|prompt|ml/.test(s))return"ai";if(/career|brand|job|portfolio|personal/.test(s))return"career";return"product"}
function mapType(s){s=String(s||"").toLowerCase();if(/found|knowledge|base/.test(s))return"foundation";if(/skill/.test(s))return"skill";
  if(/experiment|test|try/.test(s))return"experiment";if(/research|reference|study/.test(s))return"research";if(/idea|concept|future/.test(s))return"idea";return"project"}
const parseDate=s=>{if(!s)return null;const t=Date.parse(s);return isNaN(t)?null:t};
const arr=v=>Array.isArray(v)?v.filter(x=>x!=null&&x!=="").map(String):[];
function regionOf(n){if(n.type==="research")return"research";if(n.type==="idea")return"ideas";const d=n.domains.find(d=>d!=="career");return d||"design"}

function normalize(raw){
  const list=Array.isArray(raw)?raw:(raw&&Array.isArray(raw.neurons)?raw.neurons:null);
  if(!list) throw new Error("No neurons found. The file needs an array of neurons, or an object with a “neurons” array.");
  const neurons=[],byId=new Map();
  list.forEach((r,i)=>{
    if(!r||typeof r!=="object")return;
    const id=String(r.id??`neuron-${i+1}`);if(byId.has(id))return;
    let domains=Array.isArray(r.domains)&&r.domains.length?r.domains.map(mapDomain):String(r.category||"").split(/[\/,·|]/).filter(Boolean).map(mapDomain);
    if(!domains.length)domains=["product"];domains=[...new Set(domains)];
    const type=LIDX[r.type]!=null?r.type:mapType(r.type||r.layer);
    const convs=(r.conversations||r.conv||[]).map(c=>typeof c==="string"?(CONV[c]?{...CONV[c]}:{title:c,date:null,summary:""}):{id:c.id!=null?String(c.id):undefined,title:String(c.title||"Untitled conversation"),date:c.date||null,summary:String(c.summary||""),approx:!!c.approx});
    const cd=convs.map(c=>parseDate(c.date)).filter(Boolean);
    const createdAt=parseDate(r.createdAt)??(cd.length?Math.min(...cd):null);
    const updatedAt=parseDate(r.updatedAt)??(cd.length?Math.max(...cd):createdAt);
    const n={id,title:String(r.title??r.name??id),domains,type,
      status:STATUS_LABEL[r.status]?r.status:(type==="idea"?"idea":String(r.status||"exploring").toLowerCase().replace(/\s+/g,"-")),
      visibility:r.visibility==="private"?"private":"public",weight:Math.max(1,Math.min(5,+r.weight||2)),
      description:String(r.description||""),learned:arr(r.learned),created:arr(r.created),insights:arr(r.insights),skills:arr(r.skills),
      conversations:convs,createdAt,updatedAt,_conn:arr(r.connections),synthetic:!!r.synthetic,source:r.source==="import"?"import":undefined};
    n.region=regionOf(n);n.idx=neurons.length;neurons.push(n);byId.set(id,n);
  });
  const adj=neurons.map(()=>new Set()),edges=[],seen=new Set();
  neurons.forEach(n=>n._conn.forEach(cid=>{const m=byId.get(cid);if(!m||m===n)return;const a=Math.min(n.idx,m.idx),b=Math.max(n.idx,m.idx),k=a*1e6+b;
    if(seen.has(k))return;seen.add(k);edges.push([a,b]);adj[a].add(b);adj[b].add(a)}));
  const dens=neurons.length>250?Math.max(.5,Math.sqrt(250/neurons.length)):1;
  neurons.forEach(n=>{n.degree=adj[n.idx].size;const age=n.updatedAt?(NOW-n.updatedAt)/DAY:400;n.activity=Math.max(.15,Math.min(1,1-age/75));
    n.size=(7+n.weight*2.8+Math.sqrt(n.degree)*1.6)*(dens<1?.55+.45*dens:1)});
  return {neurons,byId,edges,adj,density:dens};
}
function exportData(G){return{version:2,neurons:G.neurons.map(n=>({id:n.id,title:n.title,category:n.domains.map(d=>DOMAINS[d].label).join(" / "),domains:n.domains,type:n.type,status:n.status,visibility:n.visibility,weight:n.weight,
  createdAt:n.createdAt?iso(n.createdAt):null,updatedAt:n.updatedAt?iso(n.updatedAt):null,description:n.description,learned:n.learned,created:n.created,insights:n.insights,skills:n.skills,
  source:n.source,conversations:n.conversations.map(c=>({id:c.id,title:c.title,date:c.date,summary:c.summary})),connections:[...G.adj[n.idx]].map(i=>G.neurons[i].id)}))}}
const iso=t=>new Date(t).toISOString().slice(0,10);
const fmtDate=(t,approx)=>t==null?"Date not recorded":(approx?"By ":"")+new Date(t).getDate()+" "+MONTHS[new Date(t).getMonth()]+" "+new Date(t).getFullYear();
const fmtMonth=t=>t==null?"Not recorded":MONTHS[new Date(t).getMonth()]+" "+new Date(t).getFullYear();
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const gauss=r=>{let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2832*v)};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
const short=(s,n)=>{if(s.length<=n)return s;const c=s.slice(0,n);return c.slice(0,c.lastIndexOf(" "))+"…"};
function hex(h){const n=parseInt(h.slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}

/* =========================================================================
   BRAIN GEOMETRY — a sagittal brain from overlapping ellipsoids, facing left.
   u: front(-) → back(+), v: up, w: lateral. World = brain units × RB.
   ========================================================================= */
const RB=12, XS=1.06;
const ELL=[ // centre u,v,w · radii
  [[.05,.12,0],[.98,.66,.72]],[[-.5,.02,0],[.52,.6,.66]],[[-.1,-.3,0],[.56,.3,.66]],
  [[.62,0,0],[.42,.5,.6]],[[.52,-.5,0],[.34,.22,.52]],[[.22,-.72,0],[.12,.32,.12]]
];
function fb(u,v,w){let best=9,k=-1;for(let i=0;i<ELL.length;i++){const[c,r]=ELL[i];const x=(u-c[0])/r[0],y=(v-c[1])/r[1],z=(w-c[2])/r[2];const d=Math.sqrt(x*x+y*y+z*z);if(d<best){best=d;k=i}}return[best,k]}
function regionWeights(u,v){const ws={};let s=0;RKEYS.forEach(k=>{const c=REGIONS[k].c;const d2=(u-c[0])**2+((v-c[1])*1.15)**2;const w=Math.exp(-d2/.075);ws[k]=w;s+=w});RKEYS.forEach(k=>ws[k]/=s||1);return ws}
const toWorld=(u,v,w)=>[u*RB*XS,v*RB,w*RB];

function buildShell(count){
  const r=rng(5),P=[],C=[],S=[],B=[],RG=[],PH=[];const cols=RKEYS.map(k=>hex(REGIONS[k].color));
  let tries=0;
  while(P.length/3<count&&tries<count*40){tries++;
    const u=r()*2.3-1.15,v=r()*1.9-1.06,w=r()*1.6-.8;const[f,k]=fb(u,v,w);if(f>1)continue;
    const shell=f>.87;if(!shell&&r()>.05)continue;
    if(k===4){if(Math.sin(v*64+u*5)>.3&&r()<.9)continue}
    else if(k!==5){const g=Math.sin(u*11+2.6*Math.sin(v*7+w*4))+Math.sin(v*12+2.2*Math.sin(u*8-w*5));if(Math.abs(g)<.34&&r()<.88)continue}
    if(Math.abs(w)<.035&&v>-.2&&k<4)continue;
    const ws=regionWeights(u,v);let c=[0,0,0],bi=0,bw=0;RKEYS.forEach((key,i)=>{const x=ws[key];c[0]+=cols[i][0]*x;c[1]+=cols[i][1]*x;c[2]+=cols[i][2]*x;if(x>bw){bw=x;bi=i}});
    if(r()<.08)c=c.map(x=>x*.4+.6);
    P.push(...toWorld(u,v,w));C.push(...c);S.push(shell?.55+r()*1.1:.35+r()*.6);B.push(r());RG.push(bi);PH.push(r()*6.28);
  }
  return{pos:new Float32Array(P),col:new Float32Array(C),size:new Float32Array(S),born:new Float32Array(B),reg:new Float32Array(RG),ph:new Float32Array(PH),n:P.length/3};
}
function buildMesh(sh,maxSeg){
  const cell=1.15,grid=new Map(),n=Math.min(sh.n,9000),key=(x,y,z)=>x+","+y+","+z;
  for(let i=0;i<n;i++){const k=key(Math.floor(sh.pos[i*3]/cell),Math.floor(sh.pos[i*3+1]/cell),Math.floor(sh.pos[i*3+2]/cell));(grid.get(k)||grid.set(k,[]).get(k)).push(i)}
  const P=[],C=[],B=[],RG=[];let segs=0;
  for(let i=0;i<n&&segs<maxSeg;i++){
    const x=sh.pos[i*3],y=sh.pos[i*3+1],z=sh.pos[i*3+2],cx=Math.floor(x/cell),cy=Math.floor(y/cell),cz=Math.floor(z/cell);
    const near=[];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){const L=grid.get(key(cx+a,cy+b,cz+c));if(L)L.forEach(j=>{if(j>i){const d=(sh.pos[j*3]-x)**2+(sh.pos[j*3+1]-y)**2+(sh.pos[j*3+2]-z)**2;if(d<1.3&&d>.02)near.push([d,j])}})}
    near.sort((a,b)=>a[0]-b[0]);near.slice(0,2).forEach(([d,j])=>{P.push(x,y,z,sh.pos[j*3],sh.pos[j*3+1],sh.pos[j*3+2]);
      C.push(sh.col[i*3],sh.col[i*3+1],sh.col[i*3+2],sh.col[j*3],sh.col[j*3+1],sh.col[j*3+2]);const bb=Math.max(sh.born[i],sh.born[j]);B.push(bb,bb);RG.push(sh.reg[i],sh.reg[i]);segs++});
  }
  return{pos:new Float32Array(P),col:new Float32Array(C),born:new Float32Array(B),reg:new Float32Array(RG),n:P.length/3};
}

/* place real neurons inside their lobe, at a depth set by their layer */
function layout(G){
  const r=rng(7),N=G.neurons.length,P=new Float32Array(N*3),home=[];
  G.neurons.forEach((n,i)=>{
    const c=REGIONS[n.region].c,fT=LAYERS[LIDX[n.type]].f;let p=null;
    for(let t=0;t<80&&!p;t++){const u=c[0]+gauss(r)*.17,v=c[1]+gauss(r)*.13,w=(r()*2-1)*.72;const[f]=fb(u,v,w);if(Math.abs(f-fT)<.09)p=[u,v,w]}
    if(!p)p=[c[0],c[1],(r()-.5)*.4];
    const q=toWorld(...p);P.set(q,i*3);home.push(toWorld(c[0],c[1],p[2]));
  });
  if(N<=900){
    const F=new Float32Array(N*3);
    for(let it=0;it<160;it++){const a=1-it/160;F.fill(0);
      for(let i=0;i<N;i++)for(let k=i+1;k<N;k++){const dx=P[i*3]-P[k*3],dy=P[i*3+1]-P[k*3+1],dz=P[i*3+2]-P[k*3+2];const d2=Math.max(dx*dx+dy*dy+dz*dz,.05);if(d2>9)continue;
        const f=1.3/d2*a;F[i*3]+=dx*f;F[i*3+1]+=dy*f;F[i*3+2]+=dz*f;F[k*3]-=dx*f;F[k*3+1]-=dy*f;F[k*3+2]-=dz*f}
      for(const[i,k]of G.edges){const dx=P[k*3]-P[i*3],dy=P[k*3+1]-P[i*3+1],dz=P[k*3+2]-P[i*3+2];const d=Math.hypot(dx,dy,dz)||1,f=(d-3)/d*.012*a;
        F[i*3]+=dx*f;F[i*3+1]+=dy*f;F[i*3+2]+=dz*f;F[k*3]-=dx*f;F[k*3+1]-=dy*f;F[k*3+2]-=dz*f}
      for(let i=0;i<N;i++){let x=P[i*3]+Math.max(-.6,Math.min(.6,F[i*3])),y=P[i*3+1]+Math.max(-.6,Math.min(.6,F[i*3+1])),z=P[i*3+2]+Math.max(-.6,Math.min(.6,F[i*3+2]));
        const h=home[i];x+=(h[0]-x)*.02;y+=(h[1]-y)*.02;
        const[f]=fb(x/RB/XS,y/RB,z/RB);if(f>.9){const s=1-(f-.9)*.6;x*=s;y=y*s;z*=s}
        P[i*3]=x;P[i*3+1]=y;P[i*3+2]=z}
    }
  }
  G.neurons.forEach((n,i)=>n.pos=[P[i*3],P[i*3+1],P[i*3+2]]);
}

/* =========================================================================
   WEBGL
   ========================================================================= */
const canvas=document.getElementById("gl");
const gl=canvas.getContext("webgl",{antialias:true,alpha:true,premultipliedAlpha:false});
const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function prog(vs,fs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const o={p,a:{},u:{}};const na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);for(let i=0;i<na;i++){const n=gl.getActiveAttrib(p,i).name;o.a[n]=gl.getAttribLocation(p,n)}
  const nu=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<nu;i++){const n=gl.getActiveUniform(p,i).name;o.u[n]=gl.getUniformLocation(p,n)}return o}
function buf(d,u){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d,u||gl.STATIC_DRAW);return b}
function bind(P,name,b,size){const l=P.a[name];if(l==null||l<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,size,gl.FLOAT,false,0,0)}
function unbindAll(){for(let i=0;i<8;i++)gl.disableVertexAttribArray(i)}

const COMMON=`uniform mat4 uPV;uniform float uTime,uPR,uScale,uMotion,uGrow,uDim,uRegion,uCamR,uFocusAmt;uniform vec3 uFocus;`;
const SHELL_VS=`attribute vec3 aPos;attribute vec3 aColor;attribute float aSize;attribute float aBorn;attribute float aReg;attribute float aPhase;${COMMON}
varying vec3 vC;varying float vA;
void main(){vec3 p=aPos+uMotion*.06*vec3(sin(uTime*.5+aPhase),cos(uTime*.4+aPhase*1.7),0.);
vec4 c=uPV*vec4(p,1.);gl_Position=c;
float born=step(aBorn,uGrow);
float reg=uRegion<0.?1.:(abs(aReg-uRegion)<.5?1.:.16);
float depth=clamp(1.-(c.w-uCamR+6.)/22.,.25,1.);
float foc=1.-uFocusAmt*smoothstep(2.,12.,length(aPos-uFocus))*.75;
float tw=.75+.25*sin(uTime*1.3*uMotion+aPhase*5.);
gl_PointSize=max(1.,aSize*uScale/c.w*uPR);
vC=aColor;vA=born*reg*depth*foc*uDim*tw*1.15;}`;
const SHELL_FS=`precision mediump float;varying vec3 vC;varying float vA;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(vC*1.1,(1.-r*r)*vA);}`;
const MESH_VS=`attribute vec3 aPos;attribute vec3 aColor;attribute float aBorn;attribute float aReg;${COMMON}varying vec3 vC;varying float vA;
void main(){vec4 c=uPV*vec4(aPos,1.);gl_Position=c;float born=step(aBorn,uGrow);float reg=uRegion<0.?1.:(abs(aReg-uRegion)<.5?1.:.12);
float depth=clamp(1.-(c.w-uCamR+6.)/22.,.2,1.);float foc=1.-uFocusAmt*smoothstep(2.,12.,length(aPos-uFocus))*.8;vC=aColor;vA=born*reg*depth*foc*uDim*.32;}`;
const LINE_FS=`precision mediump float;varying vec3 vC;varying float vA;void main(){gl_FragColor=vec4(vC,vA);}`;
const NEURON_VS=`attribute vec3 aPos;attribute vec3 aColor;attribute float aSize;attribute float aAlpha;attribute float aPhase;attribute float aAct;attribute float aBorn;${COMMON}uniform float uForm;
varying vec3 vC;varying float vA;varying float vB;
void main(){vec4 c=uPV*vec4(aPos,1.);float pulse=1.+uMotion*.16*aAct*sin(uTime*(.7+aAct*1.5)+aPhase);float born=smoothstep(aBorn,aBorn+.9,uForm);
float blur=uFocusAmt*smoothstep(2.5,13.,length(aPos-uFocus));vB=blur;
gl_PointSize=min(aSize*pulse*born*(1.+blur*.9)*uScale/c.w*uPR,220.*uPR);gl_Position=c;vC=aColor;vA=aAlpha*born*(1.-blur*.5)*(.85+.15*pulse);}`;
const NEURON_FS=`precision mediump float;varying vec3 vC;varying float vA;varying float vB;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float core=1.-smoothstep(0.,.2+vB*.2,r);float mid=exp(-r*r*9.)*.9;float halo=exp(-r*r*3.2)*.45;
vec3 c=mix(vC,vec3(1.),core*.85);gl_FragColor=vec4(c*(1.+core*.4),(core+mid+halo)*vA);}`;
const LINK_VS=`attribute vec3 aPos;attribute vec3 aColor;attribute float aAlpha;attribute float aBorn;${COMMON}uniform float uForm;varying vec3 vC;varying float vA;
void main(){gl_Position=uPV*vec4(aPos,1.);float born=smoothstep(aBorn,aBorn+1.2,uForm);vC=aColor;vA=aAlpha*born*(1.-uMotion*.25*(.5+.5*sin(uTime*.6+aPos.x*.7+aPos.y*.5)));}`;

const PS=prog(SHELL_VS,SHELL_FS),PM=prog(MESH_VS,LINE_FS),PN=prog(NEURON_VS,NEURON_FS),PL=prog(LINK_VS,LINE_FS);
const SHELL=buildShell(16000),MESH=buildMesh(SHELL,11000);
const SB={pos:buf(SHELL.pos),col:buf(SHELL.col),size:buf(SHELL.size),born:buf(SHELL.born),reg:buf(SHELL.reg),ph:buf(SHELL.ph)};
const MB={pos:buf(MESH.pos),col:buf(MESH.col),born:buf(MESH.born),reg:buf(MESH.reg)};

let G=null,GB=null,cur=null;
function buildGPU(){
  const N=G.neurons.length,E=G.edges.length,r=rng(11);
  const pos=new Float32Array(N*3),col=new Float32Array(N*3),size=new Float32Array(N),alpha=new Float32Array(N),ph=new Float32Array(N),act=new Float32Array(N),born=new Float32Array(N);
  G.neurons.forEach((n,i)=>{pos.set(n.pos,i*3);col.set(hex(REGIONS[n.region].color),i*3);size[i]=n.size;ph[i]=r()*6.28;act[i]=n.activity;born[i]=.8+LIDX[n.type]*.22+r()*.5});
  const lp=new Float32Array(E*6),lc=new Float32Array(E*6),la=new Float32Array(E*2),lb=new Float32Array(E*2);
  G.edges.forEach(([a,b],e)=>{lp.set(G.neurons[a].pos,e*6);lp.set(G.neurons[b].pos,e*6+3);lc.set(col.subarray(a*3,a*3+3),e*6);lc.set(col.subarray(b*3,b*3+3),e*6+3);const bb=Math.max(born[a],born[b])+.4;lb[e*2]=lb[e*2+1]=bb});
  if(GB)Object.values(GB).forEach(v=>v instanceof WebGLBuffer&&gl.deleteBuffer(v));
  GB={pos:buf(pos),col:buf(col),size:buf(size,gl.DYNAMIC_DRAW),alpha:buf(alpha,gl.DYNAMIC_DRAW),ph:buf(ph),act:buf(act),born:buf(born),
    lpos:buf(lp),lcol:buf(lc),lalpha:buf(la,gl.DYNAMIC_DRAW),lborn:buf(lb),N,E,sizeArr:size,alphaArr:alpha,laArr:la,baseSize:Float32Array.from(size)};
  cur={alpha:new Float32Array(N),sizeMul:new Float32Array(N).fill(1),lalpha:new Float32Array(E)};
}
const SIG_N=48;
const sig={pos:new Float32Array(SIG_N*3),col:new Float32Array(SIG_N*3).fill(1),size:new Float32Array(SIG_N).fill(4.5),alpha:new Float32Array(SIG_N),zero:new Float32Array(SIG_N),list:[]};
const SGB={pos:buf(sig.pos,gl.DYNAMIC_DRAW),col:buf(sig.col),size:buf(sig.size),alpha:buf(sig.alpha,gl.DYNAMIC_DRAW),zero:buf(sig.zero)};

/* matrices */
function perspective(fovy,aspect,near,far,sx,sy){const f=1/Math.tan(fovy/2),nf=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,sx,sy,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
function norm3(v){const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]}
function lookAt(e,t){const z=norm3([e[0]-t[0],e[1]-t[1],e[2]-t[2]]);const x=norm3([z[2],0,-z[0]]);const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1]}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}

/* camera */
const phone=()=>innerWidth<=820;
const portrait=()=>innerWidth/innerHeight<.8;
const home=()=>portrait()?{t:[0,-1,0],r:50,th:.22,ph:1.42,sx:0,sy:26}:{t:[0,-.5,0],r:37,th:.2,ph:1.42,sx:innerWidth>980?Math.min(110,innerWidth*.07):0,sy:12};
const cam={t:[0,0,0],r:40,th:.2,ph:1.42,sx:0,sy:0};
let tween=null,sway=0;
function flyTo(to,dur=1.4){if(REDUCED)dur=0;const from={t:[...cam.t],r:cam.r,th:cam.th,ph:cam.ph,sx:cam.sx,sy:cam.sy};
  if(to.th!=null){let d=to.th-cam.th;d=((d+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;to.th=cam.th+d}
  tween={from,to,t0:performance.now(),dur:dur*1000};if(!dur){applyTween(1);tween=null}}
function applyTween(k){const f=tween.from,t=tween.to;if(t.t)cam.t=f.t.map((v,i)=>v+(t.t[i]-v)*k);["r","th","ph","sx","sy"].forEach(q=>{if(t[q]!=null)cam[q]=f[q]+(t[q]-f[q])*k})}
const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
function faceAngles(p){const l=Math.hypot(p[0],p[2]);return{th:Math.atan2(p[0]*.35,Math.abs(p[2])>1?p[2]:(p[2]>=0?6:-6))*(1)+ (p[2]<0?Math.PI:0)*0,ph:1.38}}
function goHome(d=1.4){flyTo({...home(),t:home().t},d)}

/* state */
const S={hover:-1,sel:-1,focus:null,region:"all",asOf:null,view:"private",trail:[],saved:null,insight:-1};
let visible=new Uint8Array(0),formStart=performance.now(),growStart=performance.now(),lastInteract=0,W=0,H=0,PR=1,PV=null,screen=new Float32Array(0),growTarget=1;

function cutoff(){if(!S.asOf)return Infinity;const{y,m}=S.asOf;return m==null?new Date(y+1,0,1).getTime()-1:new Date(y,m+1,1).getTime()-1}
function applyFilters(){
  const N=G.neurons.length;visible=new Uint8Array(N);const cut=cutoff();
  G.neurons.forEach((n,i)=>{let ok=S.view==="private"||n.visibility!=="private";if(ok&&S.region!=="all")ok=n.region===S.region;if(ok&&cut<Infinity)ok=n.createdAt==null||n.createdAt<=cut;visible[i]=ok?1:0});
  if(S.sel>=0&&!visible[S.sel])closePanel();
  renderMetrics();
}

/* =========================================================================
   FRAME
   ========================================================================= */
let last=performance.now(),focusAmt=0,dimAmt=1,uScale=1;
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;const time=now/1000;
  if(tween){const k=Math.min(1,(now-tween.t0)/tween.dur);applyTween(ease(k));if(k>=1)tween=null}
  const idle=!REDUCED&&S.sel<0&&!tween&&now-lastInteract>4000&&!pointers.size;
  sway+=((idle?1:0)-sway)*Math.min(1,dt*.6);
  const w=canvas.clientWidth,h=canvas.clientHeight,pr=Math.min(devicePixelRatio||1,2);
  if(w!==W||h!==H||pr!==PR){W=w;H=h;PR=pr;canvas.width=w*pr;canvas.height=h*pr}
  gl.viewport(0,0,canvas.width,canvas.height);
  const th=cam.th+sway*.32*Math.sin(time*.09),sp=Math.sin(cam.ph);
  const eye=[cam.t[0]+cam.r*sp*Math.sin(th),cam.t[1]+cam.r*Math.cos(cam.ph),cam.t[2]+cam.r*sp*Math.cos(th)];
  PV=mul(perspective(.72,W/H,.1,400,-2*cam.sx/W,2*cam.sy/H),lookAt(eye,cam.t));
  uScale=H*.5/Math.tan(.36)*.11;
  const motion=REDUCED?0:1,form=REDUCED?99:(now-formStart)/1000;
  const grow=REDUCED?growTarget:Math.min(growTarget,(now-growStart)/2600);
  const fo=focusPoint();
  const{P}=G&&G.neurons.length?focusSets():{P:null};
  const dimT=S.sel>=0?.45:P?.55:1;dimAmt+=(dimT-dimAmt)*Math.min(1,dt*3);

  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);
  const setU=(Pr)=>{gl.uniformMatrix4fv(Pr.u.uPV,false,PV);[["uTime",time],["uPR",PR],["uScale",uScale],["uMotion",motion],["uGrow",grow],["uDim",dimAmt],["uRegion",S.region==="all"?-1:RKEYS.indexOf(S.region)],["uCamR",cam.r],["uFocusAmt",fo.amt],["uForm",form]].forEach(([n,v])=>{if(Pr.u[n])gl.uniform1f(Pr.u[n],v)});if(Pr.u.uFocus)gl.uniform3fv(Pr.u.uFocus,fo.p)};
  // cortex mesh + points
  unbindAll();gl.useProgram(PM.p);bind(PM,"aPos",MB.pos,3);bind(PM,"aColor",MB.col,3);bind(PM,"aBorn",MB.born,1);bind(PM,"aReg",MB.reg,1);setU(PM);gl.drawArrays(gl.LINES,0,MESH.n);
  unbindAll();gl.useProgram(PS.p);bind(PS,"aPos",SB.pos,3);bind(PS,"aColor",SB.col,3);bind(PS,"aSize",SB.size,1);bind(PS,"aBorn",SB.born,1);bind(PS,"aReg",SB.reg,1);bind(PS,"aPhase",SB.ph,1);setU(PS);gl.drawArrays(gl.POINTS,0,SHELL.n);
  if(G&&G.neurons.length){
    updateEmphasis(dt);
    unbindAll();gl.useProgram(PL.p);bind(PL,"aPos",GB.lpos,3);bind(PL,"aColor",GB.lcol,3);bind(PL,"aAlpha",GB.lalpha,1);bind(PL,"aBorn",GB.lborn,1);setU(PL);gl.drawArrays(gl.LINES,0,GB.E*2);
    unbindAll();gl.useProgram(PN.p);bind(PN,"aPos",GB.pos,3);bind(PN,"aColor",GB.col,3);bind(PN,"aSize",GB.size,1);bind(PN,"aAlpha",GB.alpha,1);bind(PN,"aPhase",GB.ph,1);bind(PN,"aAct",GB.act,1);bind(PN,"aBorn",GB.born,1);setU(PN);gl.drawArrays(gl.POINTS,0,GB.N);
    if(!REDUCED)updateSignals(dt,form);
    if(sig.list.length){bind(PN,"aPos",SGB.pos,3);bind(PN,"aColor",SGB.col,3);bind(PN,"aSize",SGB.size,1);bind(PN,"aAlpha",SGB.alpha,1);bind(PN,"aPhase",SGB.zero,1);bind(PN,"aAct",SGB.zero,1);bind(PN,"aBorn",SGB.zero,1);
      gl.uniform1f(PN.u.uForm,99);gl.uniform1f(PN.u.uFocusAmt,0);gl.drawArrays(gl.POINTS,0,SIG_N)}
    project();updateLabels();
  }
  updateMode();
  requestAnimationFrame(frame);
}
function focusPoint(){let p=[0,0,0],t=0;
  if(G&&S.sel>=0){p=G.neurons[S.sel].pos;t=1}
  else if(G&&S.focus&&S.focus.size){const c=[0,0,0];S.focus.forEach(i=>{const q=G.neurons[i].pos;c[0]+=q[0];c[1]+=q[1];c[2]+=q[2]});p=c.map(v=>v/S.focus.size);t=.45}
  focusAmt+=(t-focusAmt)*.06;return{p,amt:focusAmt}}
function focusSets(){let P=null,Nb=new Set();
  if(S.sel>=0){P=new Set([S.sel]);if(S.hover>=0)P.add(S.hover)}else if(S.hover>=0)P=new Set([S.hover]);else if(S.focus)P=S.focus;
  if(P)P.forEach(i=>G.adj[i].forEach(j=>{if(!P.has(j))Nb.add(j)}));return{P,Nb}}
function updateEmphasis(dt){
  const{P,Nb}=focusSets(),N=GB.N,k=1-Math.pow(.0015,dt),D=G.density;
  for(let i=0;i<N;i++){let a;if(!visible[i])a=0;else if(!P)a=(.62+.38*G.neurons[i].activity)*D;else if(P.has(i))a=1;else if(Nb.has(i))a=.85;else a=(S.sel>=0?.16:.14)*D;
    cur.alpha[i]+=(a-cur.alpha[i])*k;GB.alphaArr[i]=cur.alpha[i];
    const sm=i===S.sel?1.6:i===S.hover?1.35:P&&P.has(i)?1.2:Nb.has(i)&&S.sel>=0?1.1:1;cur.sizeMul[i]+=(sm-cur.sizeMul[i])*k;GB.sizeArr[i]=GB.baseSize[i]*cur.sizeMul[i]}
  G.edges.forEach(([a,b],e)=>{let t;if(!visible[a]||!visible[b])t=0;else if(!P)t=(.22+.2*(G.neurons[a].activity+G.neurons[b].activity)*.5)*D;
    else if(P.has(a)||P.has(b))t=.8;else if(Nb.has(a)&&Nb.has(b))t=.16;else t=.03;cur.lalpha[e]+=(t-cur.lalpha[e])*k;GB.laArr[e*2]=GB.laArr[e*2+1]=cur.lalpha[e]});
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.alpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,GB.alphaArr);
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.size);gl.bufferSubData(gl.ARRAY_BUFFER,0,GB.sizeArr);
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.lalpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,GB.laArr);
}
let sigClock=0;
function updateSignals(dt,form){
  if(form<2.8)return;const{P}=focusSets();sigClock+=dt;const rate=P?.08:.35;
  while(sigClock>rate&&sig.list.length<SIG_N){sigClock-=rate;let e=-1,dir=1;
    if(P){const cand=[];G.edges.forEach(([a,b],i)=>{if((P.has(a)||P.has(b))&&visible[a]&&visible[b])cand.push(i)});if(cand.length){e=cand[(Math.random()*cand.length)|0];dir=P.has(G.edges[e][0])?1:-1}}
    else{for(let t=0;t<6;t++){const c=(Math.random()*G.edges.length)|0;const[a,b]=G.edges[c]||[];if(a!=null&&visible[a]&&visible[b]){e=c;break}}dir=Math.random()<.5?1:-1}
    if(e<0)break;sig.list.push({e,dir,t:0,sp:.35+Math.random()*.35})}
  if(sig.list.length>=SIG_N)sigClock=0;sig.alpha.fill(0);
  sig.list=sig.list.filter(s=>(s.t+=dt*s.sp)<1);
  sig.list.forEach((s,i)=>{const[a,b]=G.edges[s.e];const A=G.neurons[s.dir>0?a:b].pos,B=G.neurons[s.dir>0?b:a].pos,t=ease(s.t);
    sig.pos[i*3]=A[0]+(B[0]-A[0])*t;sig.pos[i*3+1]=A[1]+(B[1]-A[1])*t;sig.pos[i*3+2]=A[2]+(B[2]-A[2])*t;sig.alpha[i]=Math.sin(Math.PI*s.t)*(P?1:.8)*Math.min(1,cur.lalpha[s.e]*5+.15)});
  gl.bindBuffer(gl.ARRAY_BUFFER,SGB.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,sig.pos);gl.bindBuffer(gl.ARRAY_BUFFER,SGB.alpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,sig.alpha);
}
function projectPoint(p){const x=PV[0]*p[0]+PV[4]*p[1]+PV[8]*p[2]+PV[12],y=PV[1]*p[0]+PV[5]*p[1]+PV[9]*p[2]+PV[13],w=PV[3]*p[0]+PV[7]*p[1]+PV[11]*p[2]+PV[15];return[(x/w*.5+.5)*W,(1-(y/w*.5+.5))*H,w]}
function project(){const N=G.neurons.length;if(screen.length!==N*4)screen=new Float32Array(N*4);
  for(let i=0;i<N;i++){const q=projectPoint(G.neurons[i].pos);screen[i*4]=q[0];screen[i*4+1]=q[1];screen[i*4+2]=q[2];screen[i*4+3]=GB.sizeArr[i]*uScale/Math.max(q[2],.1)}}

/* =========================================================================
   LABELS
   ========================================================================= */
const labelsEl=document.getElementById("labels"),LPOOL=40,nlEls=[];let rlEls={};
for(let i=0;i<LPOOL;i++){const b=document.createElement("button");b.className="nl";b.style.opacity=0;b.tabIndex=-1;b.dataset.i=-1;
  b.addEventListener("click",e=>{e.stopPropagation();const id=+b.dataset.i;if(id>=0)select(id)});
  b.addEventListener("pointerenter",()=>{const id=+b.dataset.i;if(id>=0)S.hover=id});b.addEventListener("pointerleave",()=>{S.hover=-1});labelsEl.appendChild(b);nlEls.push(b)}
function buildRegionLabels(){Object.values(rlEls).forEach(e=>e.remove());rlEls={};
  RKEYS.forEach(k=>{const b=document.createElement("button");b.className="rl";b.style.setProperty("--c",REGIONS[k].color);
    b.innerHTML=`<span class="badge"></span><span class="txt"><b>${REGIONS[k].label}</b><span></span></span>`;b.setAttribute("aria-label",`Explore ${REGIONS[k].label}`);
    b.addEventListener("click",e=>{e.stopPropagation();setRegion(k)});labelsEl.appendChild(b);rlEls[k]=b})}
let safeTop=150,safeBot=700,mode=-1;
function measureSafe(){const t=document.querySelector(".top").getBoundingClientRect();const tl=document.getElementById("timeline").getBoundingClientRect();safeTop=t.bottom+28;safeBot=(phone()?innerHeight-150:tl.top)-30}
function level(){const hr=home().r;return S.sel>=0?3:cam.r>hr*.85?0:cam.r>hr*.5?1:2}
function updateMode(){const m=[0,0,1,2][level()];if(m!==mode){mode=m;document.querySelectorAll("#modes span").forEach(s=>s.classList.toggle("on",+s.dataset.m===m))}}
function updateLabels(){
  const hr=home().r,lv=level();
  const rA=S.sel>=0||S.focus?0:Math.max(0,Math.min(1,(cam.r-hr*.55)/(hr*.25)));
  const eyeZ=Math.cos(cam.th)>=0?1:-1;
  RKEYS.forEach(k=>{const el=rlEls[k];if(!el)return;const c=REGIONS[k].c;
    const cnt=G.neurons.filter(n=>visible[n.idx]&&n.region===k).length;
    const a=(S.region==="all"||S.region===k)&&cnt?rA:0;
    const q=projectPoint(toWorld(c[0],c[1],.55*eyeZ));const x=Math.max(20,Math.min(W-170,q[0]-15)),y=Math.max(safeTop,Math.min(safeBot,q[1]-15));
    el.style.transform=`translate(${x}px,${y}px)`;el.style.opacity=a;el.style.pointerEvents=a>.4?"auto":"none";el.tabIndex=a>.4?0:-1;
    const s=el.querySelector(".txt span"),txt=cnt+(cnt===1?" node":" nodes");if(s.textContent!==txt)s.textContent=txt});
  const{P,Nb}=focusSets(),N=G.neurons.length,thr=lv===0?Infinity:lv===1?15:0;
  const cand=[];
  for(let i=0;i<N;i++){if(!visible[i])continue;const w=screen[i*4+2];if(w<=0)continue;const x=screen[i*4],y=screen[i*4+1];if(x<-20||y<safeTop-60||x>W+20||y>H+20)continue;
    let pri;if(P&&P.has(i))pri=1e4;else if(Nb.has(i))pri=5e3+GB.baseSize[i];else if(P)continue;else if(GB.baseSize[i]>=thr)pri=GB.baseSize[i];else continue;cand.push([pri,i])}
  cand.sort((a,b)=>b[0]-a[0]);
  const boxes=[];let used=0;
  const panelLeft=S.sel>=0&&!phone()?W-440:W;
  for(const[pri,i]of cand){if(used>=LPOOL)break;const n=G.neurons[i],isP=P&&P.has(i);
    const r=Math.max(4,screen[i*4+3]*.14),wd=n.title.length*(isP?7.8:6.7)+(isP?28:22),hh=isP?30:24,x=screen[i*4]+r+8,y=screen[i*4+1]-hh/2;
    if(x+wd>panelLeft-8&&!isP)continue;
    if(boxes.some(b=>x<b[0]+b[2]&&x+wd>b[0]&&y<b[1]+b[3]&&y+hh>b[1]))continue;boxes.push([x,y,wd,hh]);
    const el=nlEls[used++];if(el.dataset.i!=String(i)){el.dataset.i=i;el.textContent=n.title;el.setAttribute("aria-label",`Open ${n.title}`);el.style.setProperty("--c",REGIONS[n.region].color)}
    el.classList.toggle("p",!!isP);el.style.transform=`translate(${x}px,${y}px)`;el.style.opacity=1;el.style.pointerEvents="auto"}
  for(let k=used;k<LPOOL;k++){const el=nlEls[k];if(el.dataset.i!=="-1"){el.style.opacity=0;el.style.pointerEvents="none";el.dataset.i=-1}}
}

/* =========================================================================
   INTERACTION
   ========================================================================= */
const pointers=new Map();let drag=null,pinch=null;const tip=document.getElementById("tip");
function pick(x,y,touch){if(!G||!G.neurons.length)return-1;let best=-1,bd=1e9;
  for(let i=0;i<G.neurons.length;i++){if(!visible[i]||cur.alpha[i]<.05||screen[i*4+2]<=0)continue;const d=Math.hypot(screen[i*4]-x,screen[i*4+1]-y),rad=Math.max(touch?22:12,screen[i*4+3]*.2);
    if(d<rad){const sc=d/rad+(cur.alpha[i]<.3?1:0);if(sc<bd){bd=sc;best=i}}}return best}
canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1)drag={x:e.clientX,y:e.clientY,moved:false,type:e.pointerType};
  if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),r:cam.r};if(drag)drag.moved=true}
  lastInteract=performance.now();hideHint()});
canvas.addEventListener("pointermove",e=>{
  if(pointers.has(e.pointerId)){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()];cam.r=clampR(pinch.r*pinch.d/Math.max(Math.hypot(a.x-b.x,a.y-b.y),1));tween=null}
    else if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)>5){drag.moved=true;canvas.classList.add("dragging");setHover(-1)}
      if(drag.moved){cam.th-=dx*.005;cam.ph=Math.max(.35,Math.min(Math.PI-.35,cam.ph-dy*.005));drag.x=e.clientX;drag.y=e.clientY;tween=null}}
    lastInteract=performance.now();return}
  if(e.pointerType==="mouse")setHover(pick(e.clientX,e.clientY,false),e.clientX,e.clientY)});
function endPointer(e){const wasDrag=drag&&drag.moved;pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;
  if(!pointers.size){canvas.classList.remove("dragging");if(drag&&!wasDrag&&e.type==="pointerup"){const i=pick(e.clientX,e.clientY,drag.type!=="mouse");if(i>=0)select(i);else if(S.sel>=0)closePanel();else if(S.focus){clearFocus();renderDrawer()}}drag=null}}
canvas.addEventListener("pointerup",endPointer);canvas.addEventListener("pointercancel",endPointer);
canvas.addEventListener("pointerleave",()=>{if(!pointers.size)setHover(-1)});
canvas.addEventListener("wheel",e=>{e.preventDefault();cam.r=clampR(cam.r*Math.exp(e.deltaY*.0012));if(tween&&tween.to.r!=null)tween=null;lastInteract=performance.now();hideHint()},{passive:false});
const clampR=r=>Math.max(6,Math.min(90,r));
function setHover(i,x,y){
  if(i!==S.hover){S.hover=i;canvas.classList.toggle("pointing",i>=0);
    if(i>=0){const n=G.neurons[i];tip.innerHTML=`<div class="eyebrow mono"><span class="dot" style="--c:${REGIONS[n.region].color}"></span>${REGIONS[n.region].label} · ${TYPE_LABEL[n.type]}</div><h3>${esc(n.title)}</h3><p>${esc(short(n.description,120))}</p><div class="foot mono">${STATUS_LABEL[n.status]||n.status} · ${n.degree} ${n.degree===1?"link":"links"} · Click to open</div>`;tip.classList.add("on")}
    else tip.classList.remove("on")}
  if(i>=0&&x!=null){const tx=Math.min(x+18,W-276),ty=Math.min(y+18,H-tip.offsetHeight-12);tip.style.transform=`translate(${tx}px,${ty}px)`}
}

/* detail */
const panel=document.getElementById("panel"),pBody=document.getElementById("pBody");
let lastFocus=null,tab="overview";
function select(i,how){
  if(!G.neurons[i])return;
  if(S.sel<0){S.saved={t:[...cam.t],r:cam.r,th:cam.th,ph:cam.ph,sx:cam.sx,sy:cam.sy};lastFocus=document.activeElement}
  if(how==="trail")S.trail=S.trail.slice(0,S.trail.indexOf(i)+1);else if(how==="rel")S.trail.push(i);else S.trail=[i];
  if(S.trail.length>6)S.trail=S.trail.slice(-6);
  S.sel=i;setHover(-1);closeDrawer();tab="overview";
  const n=G.neurons[i],ph=phone();
  flyTo({t:n.pos,r:ph?19:16,th:(n.pos[2]<-2?Math.PI-.2:.2),ph:1.4,sx:ph?0:-Math.min(440,W)/2+40,sy:ph?-H*.34:0},1.5);
  renderPanel();panel.classList.add("open");panel.setAttribute("aria-hidden","false");document.body.classList.add("detail");
  setTimeout(()=>document.getElementById("pClose").focus({preventScroll:true}),60);hideHint();
}
function closePanel(){if(S.sel<0)return;S.sel=-1;S.trail=[];panel.classList.remove("open");panel.setAttribute("aria-hidden","true");document.body.classList.remove("detail");
  const s=S.saved||home();flyTo({t:s.t,r:s.r,th:s.th,ph:s.ph,sx:s.sx,sy:s.sy},1.3);S.saved=null;
  if(lastFocus&&lastFocus.focus&&document.contains(lastFocus))lastFocus.focus({preventScroll:true})}
document.getElementById("pClose").addEventListener("click",closePanel);
document.getElementById("back").addEventListener("click",closePanel);
function renderPanel(){
  const n=G.neurons[S.sel];if(!n)return;
  const rel=[...G.adj[n.idx]].filter(j=>visible[j]).map(j=>G.neurons[j]).sort((a,b)=>b.size-a.size);
  const list=(items,cls="")=>`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
  const convs=[...n.conversations].sort((a,b)=>(parseDate(b.date)||0)-(parseDate(a.date)||0));
  const trail=S.trail.length>1?`<nav class="trail" aria-label="Your path">${S.trail.map((t,k)=>k===S.trail.length-1?`<span class="cur">${esc(G.neurons[t].title)}</span>`:`<button data-trail="${t}">${esc(G.neurons[t].title)}</button><span aria-hidden="true">→</span>`).join("")}</nav>`:"";
  const col=REGIONS[n.region].color;
  const cat=[...n.domains.map(d=>DOMAINS[d].label),TYPE_LABEL[n.type]].join(" · ");
  const tabs=[["overview","Overview",0],["learnings","Learnings",n.learned.length],["creations","Creations",n.created.length],["conversations","Conversations",convs.length]];
  const none=msg=>`<p class="sparse">${msg}</p>`;
  let body="";
  if(tab==="overview"){
    const ins=n.insights.length?n.insights:[];
    body=`${ins.length?`<section class="sec ins"><h4 class="mono"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l1.5 4 4 1.5-4 1.5L8 12.5 6.5 8.5l-4-1.5 4-1.5L8 1.5z" stroke="currentColor" stroke-width="1.3"/></svg>Key insights</h4>${list(ins.slice(0,5))}</section>`:""}
    ${!ins.length&&!n.learned.length&&!n.created.length?none("Insights for this neuron haven’t been recorded yet. They fill in as more conversations are imported."):""}
    <dl class="times"><div><dt class="mono">Started</dt><dd>${fmtMonth(n.createdAt)}</dd></div><div><dt class="mono">Last explored</dt><dd>${fmtMonth(n.updatedAt)}</dd></div><div><dt class="mono">Links</dt><dd>${n.degree}</dd></div></dl>
    ${rel.length?`<section class="sec"><h4 class="mono">Related knowledge</h4><div class="orbs">${rel.map(m=>`<button data-rel="${m.idx}" style="--c:${REGIONS[m.region].color}"><span class="o"></span>${esc(m.title)}</button>`).join("")}</div></section>`:""}`;
  }else if(tab==="learnings")body=n.learned.length?`<section class="sec">${list(n.learned)}</section>`:none("No learnings recorded for this neuron yet.");
  else if(tab==="creations")body=(n.created.length?`<section class="sec">${list(n.created)}</section>`:none("Nothing recorded as created from this neuron yet."))+(n.skills.length?`<section class="sec"><h4 class="mono">Skills involved</h4><div class="skills">${n.skills.map(s=>`<span>${esc(s)}</span>`).join("")}</div></section>`:"");
  else body=convs.length?`<div class="convs">${convs.map(c=>`<div class="conv"><span class="ct">${esc(c.title)}</span><span class="cd mono">${c.date?fmtDate(parseDate(c.date),c.approx):"Date not recorded"}</span>${c.summary?`<span class="cs">${esc(c.summary)}</span>`:""}</div>`).join("")}</div>`:none("No conversations are linked to this neuron yet. They appear once your Claude history is imported.");
  pBody.innerHTML=`${trail}
  <div class="p-head">
    <span class="chip mono" style="--c:${col}"><span class="dot" style="--c:${col}"></span>${TYPE_LABEL[n.type]}</span>
    <h2 class="p-title" id="pTitle">${esc(n.title)}</h2>
    <div class="p-cat">${esc(cat)}</div>
    <div class="p-status"><span class="st mono ${esc(n.status)}"><i></i>${STATUS_LABEL[n.status]||esc(n.status)}</span><span class="p-date">${fmtMonth(n.updatedAt)}</span>
      ${n.visibility==="private"?`<span class="priv"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.3"/></svg>Private</span>`:""}</div>
  </div>
  ${n.description?`<p class="p-desc">${esc(n.description)}</p>`:""}
  <div class="tabs" role="tablist">${tabs.map(([k,l,c])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}${c?`<sup>${c}</sup>`:""}</button>`).join("")}</div>
  <div class="tabpanel" role="tabpanel">${body}</div>`;
  panel.setAttribute("aria-labelledby","pTitle");
}
pBody.addEventListener("click",e=>{const r=e.target.closest("[data-rel]");if(r)return select(+r.dataset.rel,"rel");const t=e.target.closest("[data-trail]");if(t)return select(+t.dataset.trail,"trail");
  const tb=e.target.closest("[data-tab]");if(tb){tab=tb.dataset.tab;renderPanel();const b=pBody.querySelector(`[data-tab="${tab}"]`);b&&b.focus()}});
pBody.addEventListener("pointerover",e=>{const r=e.target.closest("[data-rel]");S.hover=r?+r.dataset.rel:-1});
pBody.addEventListener("pointerleave",()=>{S.hover=-1});

function frameSet(set){const ps=[...set].map(i=>G.neurons[i].pos);if(!ps.length)return;const c=[0,0,0];ps.forEach(p=>{c[0]+=p[0];c[1]+=p[1];c[2]+=p[2]});c.forEach((v,i)=>c[i]=v/ps.length);
  const spread=Math.max(...ps.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2])),1);flyTo({t:c,r:Math.max(16,Math.min(home().r,spread*2.2+10)),sx:0,sy:0},1.3)}
function clearFocus(){S.focus=null;S.insight=-1}
function setRegion(k){S.region=k;applyFilters();renderNav();
  if(k==="all")goHome(1.3);else{const c=REGIONS[k].c;flyTo({t:toWorld(c[0],c[1],0),r:home().r*.62,sx:0,sy:0},1.4)}
  if(q.value.trim()){hits=search(q.value);renderResults()}renderDrawer()}

/* search */
const q=document.getElementById("q"),results=document.getElementById("results");let hits=[],hi=0,searchTimer=null;
function search(str){str=str.trim().toLowerCase();if(!str)return[];const terms=str.split(/\s+/),out=[];
  G.neurons.forEach(n=>{if(!visible[n.idx])return;let score=0,via="";const t=n.title.toLowerCase();
    if(t===str)score+=10;else if(t.startsWith(str))score+=7;else if(t.includes(str))score+=5;
    if(REGIONS[n.region].label.toLowerCase().startsWith(str))score+=2;
    if(!score){const sk=n.skills.find(s=>terms.every(w=>s.toLowerCase().includes(w)));if(sk){score+=3;via="Skill · "+sk}
      const cv=!sk&&n.conversations.find(c=>terms.every(w=>(c.title+" "+c.summary).toLowerCase().includes(w)));if(cv){score+=2;via="Conversation · "+cv.title}
      if(!sk&&!cv){const blob=[n.description,...n.learned,...n.created,...n.insights].join(" ").toLowerCase();if(terms.every(w=>blob.includes(w))){score+=1.5;via="Mentioned in notes"}}}
    if(score)out.push({n,score:score+n.size*.01,via})});return out.sort((a,b)=>b.score-a.score)}
function renderResults(){const str=q.value.trim();if(!str){results.hidden=true;q.setAttribute("aria-expanded","false");return}
  results.hidden=false;q.setAttribute("aria-expanded","true");
  if(!hits.length){results.innerHTML=`<div class="r-empty">Nothing in the brain matches “${esc(str)}” yet. Try a project, a skill or a region like AI.</div>`;return}
  const set=new Set(hits.map(h=>h.n.idx)),rel=new Set();set.forEach(i=>G.adj[i].forEach(j=>{if(!set.has(j)&&visible[j])rel.add(j)}));
  const proj=hits.filter(h=>h.n.type==="project"||h.n.type==="experiment").length;
  const pl=(n,s,p)=>n+" "+(n===1?s:p);
  results.innerHTML=`<div class="r-sum"><span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>${pl(hits.length,"knowledge node","knowledge nodes")}</span><span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2l5.5 3v6L8 14l-5.5-3V5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>${pl(proj,"project or experiment","projects & experiments")}</span><span><svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="12" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M5.8 7.2l4.4-2.4M5.8 8.8l4.4 2.4" stroke="currentColor" stroke-width="1.2"/></svg>${pl(rel.size,"related concept","related concepts")}</span></div>`+
    hits.slice(0,7).map((h,k)=>`<button role="option" id="opt${k}" aria-selected="${k===hi}" data-i="${h.n.idx}"><span class="dot" style="--c:${REGIONS[h.n.region].color}"></span><span style="min-width:0"><span class="r-title">${esc(h.n.title)}</span>${h.via?`<span class="r-via">${esc(h.via)}</span>`:""}</span><span class="r-type mono">${TYPE_LABEL[h.n.type]}</span></button>`).join("")+
    (hits.length>7?`<div class="r-empty mono" style="font-size:9.5px;padding:8px 10px">${hits.length-7} more lit up in the brain</div>`:"");
  q.setAttribute("aria-activedescendant","opt"+hi)}
q.addEventListener("input",()=>{if(!G)return;hits=search(q.value);hi=0;renderResults();if(S.sel>=0&&q.value.trim())closePanel();clearTimeout(searchTimer);
  if(!q.value.trim()){clearFocus();return}S.focus=hits.length?new Set(hits.map(h=>h.n.idx)):null;S.insight=-1;const f=S.focus;searchTimer=setTimeout(()=>{if(f&&S.focus===f)frameSet(f)},380);hideHint()});
q.addEventListener("keydown",e=>{if(e.key==="ArrowDown"){e.preventDefault();hi=Math.min(hi+1,Math.min(hits.length,7)-1);renderResults()}
  else if(e.key==="ArrowUp"){e.preventDefault();hi=Math.max(hi-1,0);renderResults()}else if(e.key==="Enter"&&hits[hi]){e.preventDefault();openHit(hits[hi].n.idx)}
  else if(e.key==="Escape"){q.value="";hits=[];renderResults();clearFocus();q.blur()}});
results.addEventListener("click",e=>{const b=e.target.closest("button[data-i]");if(b)openHit(+b.dataset.i)});
results.addEventListener("pointerover",e=>{const b=e.target.closest("button[data-i]");S.hover=b?+b.dataset.i:-1});
results.addEventListener("pointerleave",()=>{S.hover=-1});
function openHit(i){results.hidden=true;q.setAttribute("aria-expanded","false");S.focus=null;select(i)}
document.addEventListener("click",e=>{if(!e.target.closest(".search"))results.hidden=true});
q.addEventListener("focus",()=>{if(q.value.trim())renderResults()});

/* region nav */
const nav=document.getElementById("nav");
function renderNav(){nav.innerHTML=[["all","All"],...RKEYS.map(k=>[k,REGIONS[k].label])].map(([k,l])=>`<button data-r="${k}" aria-pressed="${S.region===k}" style="--c:${k==="all"?"rgba(255,255,255,.2)":REGIONS[k].color}"><span class="ic"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true">${ICONS[k]}</svg></span>${l}</button>`).join("")}
nav.addEventListener("click",e=>{const b=e.target.closest("[data-r]");if(b){if(S.sel>=0)closePanel();clearFocus();setRegion(b.dataset.r)}});

/* timeline: the brain as it stood at the end of a year or month */
const tlRow=document.getElementById("tlRow"),tlFill=document.getElementById("tlFill");let tlYear=new Date(NOW).getFullYear();
function renderTimeline(){
  const dates=G.neurons.map(n=>n.createdAt).filter(Boolean);if(!dates.length){tlRow.innerHTML="";return}
  const first=new Date(Math.min(...dates)),nowD=new Date(NOW),years=[];for(let y=first.getFullYear();y<=nowD.getFullYear();y++)years.push(y);
  if(!years.includes(tlYear))tlYear=years[years.length-1];
  const on=(y,m)=>S.asOf&&S.asOf.y===y&&S.asOf.m===m;
  tlRow.innerHTML=`<button data-all aria-pressed="${!S.asOf}"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="vertical-align:-1px;margin-right:5px"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>All time</button>`+
    years.map(y=>`<button data-y="${y}" aria-pressed="${on(y,null)}">${y}</button>`).join("")+`<span class="sep" aria-hidden="true"></span>`+
    MONTHS.map((m,i)=>{const start=new Date(tlYear,i,1),end=new Date(tlYear,i+1,1)-1;const dis=end<first.getTime()||start>NOW;return`<button data-m="${i}" aria-pressed="${on(tlYear,i)}" ${dis?"disabled":""} aria-label="${m} ${tlYear}">${m}</button>`}).join("");
  const span=Math.max(1,NOW-first.getTime()),c=cutoff();tlFill.style.width=(!S.asOf?100:Math.max(4,Math.min(100,(c-first.getTime())/span*100)))+"%";
}
tlRow.addEventListener("click",e=>{const b=e.target.closest("button");if(!b||b.disabled)return;
  if(b.hasAttribute("data-all"))S.asOf=null;else if(b.dataset.y){tlYear=+b.dataset.y;S.asOf={y:tlYear,m:null}}else if(b.dataset.m)S.asOf={y:tlYear,m:+b.dataset.m};
  applyFilters();renderTimeline();renderDrawer();if(q.value.trim()){hits=search(q.value);renderResults()}});

/* view toggle */
const btnView=document.getElementById("btnView");
function renderView(){btnView.innerHTML=S.view==="private"?`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.3"/></svg><span class="lbl">Private</span>`:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.8" stroke="currentColor" stroke-width="1.3"/><path d="M2.2 8h11.6M8 2.2c1.8 2 1.8 9.6 0 11.6M8 2.2c-1.8 2-1.8 9.6 0 11.6" stroke="currentColor" stroke-width="1.1"/></svg><span class="lbl">Public</span>`;
  btnView.setAttribute("aria-label",S.view==="private"?"Private view: showing everything. Switch to public view":"Public view: client and personal work hidden. Switch to private view")}
btnView.addEventListener("click",()=>{S.view=S.view==="private"?"public":"private";renderView();applyFilters();renderDrawer();if(q.value.trim()){hits=search(q.value);renderResults()}store("view",S.view)});

/* metrics — real counts */
function renderMetrics(){const vis=G.neurons.filter(n=>visible[n.idx]),ids=new Set(vis.map(n=>n.idx));const f=v=>v.toLocaleString("en-IN");
  document.getElementById("metrics").innerHTML=[[vis.length,"Knowledge nodes"],[vis.filter(n=>n.type==="project"||n.type==="experiment").length,"Projects & experiments"],[vis.filter(n=>n.type==="skill").length,"Skills"],[G.edges.filter(([a,b])=>ids.has(a)&&ids.has(b)).length,"Connections"]].map(([v,l])=>`<div><dd>${f(v)}</dd><dt>${l}</dt></div>`).join("")}

/* insights — read from the graph */
const drawer=document.getElementById("drawer"),btnIns=document.getElementById("btnInsights");let INS=[];
function computeInsights(){const vis=G.neurons.filter(n=>visible[n.idx]);if(vis.length<4)return[];const out=[];const pl=(n,s,p)=>n+" "+(n===1?s:p);
  const pairs={};G.edges.forEach(([a,b])=>{if(!visible[a]||!visible[b])return;const A=G.neurons[a].region,B=G.neurons[b].region;if(A===B)return;const k=[A,B].sort().join("|");(pairs[k]=pairs[k]||[]).push(a,b)});
  const top=Object.entries(pairs).sort((a,b)=>b[1].length-a[1].length)[0];
  if(top){const[a,b]=top[0].split("|");out.push({k:"You keep returning to",t:`${REGIONS[a].label} × ${REGIONS[b].label}`,c:`${pl(top[1].length/2,"connection runs","connections run")} between these two regions, more than any other pair.`,set:[...new Set(top[1])],viz:"pair"})}
  const recent=vis.filter(n=>n.updatedAt&&NOW-n.updatedAt<=30*DAY);const rs=new Set(recent.map(n=>n.idx));
  const em=vis.filter(n=>n.type==="skill").map(n=>({n,c:[...G.adj[n.idx]].filter(j=>rs.has(j)).length})).sort((a,b)=>b.c-a.c)[0];
  if(em&&em.c)out.push({k:"Emerging skill",t:em.n.title,c:`Linked to ${pl(em.c,"neuron","neurons")} active in the last 30 days.`,set:[em.n.idx,...[...G.adj[em.n.idx]].filter(j=>rs.has(j))],viz:"hub"});
  const hub=[...vis].sort((a,b)=>b.degree-a.degree)[0];const areas=new Set([...G.adj[hub.idx]].map(j=>G.neurons[j].region));
  out.push({k:"Most connected",t:hub.title,c:`Connected to ${hub.degree} other neurons across ${pl(areas.size,"region","regions")}.`,set:[hub.idx,...G.adj[hub.idx]],viz:"hub"});
  const rp=vis.filter(n=>["project","experiment"].includes(n.type)&&n.updatedAt).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  if(rp)out.push({k:"Recently exploring",t:rp.title,c:`Last explored ${fmtDate(rp.updatedAt)}. ${pl(recent.length,"neuron","neurons")} active in the last 30 days.`,set:recent.map(n=>n.idx),viz:"cloud"});
  const paused=vis.filter(n=>n.status==="paused"||n.status==="archived");
  if(paused.length)out.push({k:"What I set down",t:paused.map(n=>n.title).join(", "),c:`Explored, then paused. Picking one back up starts where the notes left off.`,set:paused.map(n=>n.idx),viz:"cloud"});
  let best=null;G.edges.forEach(([a,b])=>{if(!visible[a]||!visible[b])return;const A=G.neurons[a],B=G.neurons[b];if(A.region===B.region)return;const sh=[...G.adj[a]].filter(x=>G.adj[b].has(x)).length;const s=A.size+B.size-sh*8;if(!best||s>best.s)best={s,a:A,b:B}});
  if(best)out.push({k:"Unexpected connection",t:`${best.a.title} ↔ ${best.b.title}`,c:`${REGIONS[best.a.region].label} and ${REGIONS[best.b.region].label} meet here directly, with little else in common.`,set:[best.a.idx,best.b.idx],viz:"pair"});
  return out}
function miniViz(x){const ns=x.set.map(i=>G.neurons[i]).filter(Boolean);if(!ns.length)return"";
  const xs=ns.map(n=>n.pos[0]),ys=ns.map(n=>-n.pos[1]);const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const sx=v=>8+(x1-x0?(v-x0)/(x1-x0):.5)*184,sy=v=>6+(y1-y0?(v-y0)/(y1-y0):.5)*44;const set=new Set(x.set);
  const lines=G.edges.filter(([a,b])=>set.has(a)&&set.has(b)).map(([a,b])=>{const A=G.neurons[a],B=G.neurons[b];return`<line x1="${sx(A.pos[0]).toFixed(1)}" y1="${sy(-A.pos[1]).toFixed(1)}" x2="${sx(B.pos[0]).toFixed(1)}" y2="${sy(-B.pos[1]).toFixed(1)}" stroke="${REGIONS[A.region].color}" stroke-opacity=".45" stroke-width=".8"/>`}).join("");
  const dots=ns.map((n,k)=>`<circle cx="${sx(n.pos[0]).toFixed(1)}" cy="${sy(-n.pos[1]).toFixed(1)}" r="${k===0&&x.viz==="hub"?4:2.4}" fill="${REGIONS[n.region].color}"/>${k===0&&x.viz==="hub"?`<circle cx="${sx(n.pos[0]).toFixed(1)}" cy="${sy(-n.pos[1]).toFixed(1)}" r="9" fill="${REGIONS[n.region].color}" fill-opacity=".18"/>`:""}`).join("");
  return`<svg viewBox="0 0 200 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${lines}${dots}</svg>`}
function renderDrawer(){if(!G||!G.neurons.length)return;INS=computeInsights();
  drawer.innerHTML=`<header><h2 class="mono">AI insights</h2></header><p class="sub">Read from the shape of the graph as it stands. Claude’s own analysis of the full history arrives with the importer.</p>`+
    (INS.length?`<div class="ins-grid">${INS.map((x,k)=>`<button class="ins-card" data-k="${k}" aria-pressed="${S.insight===k}"><span class="mono">${x.k}</span><h3>${esc(x.t)}</h3>${miniViz(x)}<p>${esc(x.c)}</p></button>`).join("")}</div>`:`<p class="sub">Not enough neurons in view to see patterns yet.</p>`)}
function closeDrawer(){drawer.hidden=true;btnIns.setAttribute("aria-pressed","false")}
btnIns.addEventListener("click",()=>{if(drawer.hidden){renderDrawer();drawer.hidden=false;btnIns.setAttribute("aria-pressed","true")}else closeDrawer()});
drawer.addEventListener("click",e=>{const c=e.target.closest(".ins-card");if(!c)return;const k=+c.dataset.k;if(S.insight===k){clearFocus();renderDrawer();return}
  if(S.sel>=0)closePanel();S.insight=k;S.focus=new Set(INS[k].set.filter(i=>visible[i]));frameSet(S.focus);renderDrawer()});

document.getElementById("orb").addEventListener("click",()=>{if(S.sel>=0)closePanel();clearFocus();q.value="";hits=[];renderResults();closeDrawer();if(S.region!=="all")setRegion("all");else goHome(1.4)});
document.addEventListener("keydown",e=>{if(e.key==="/"&&document.activeElement!==q&&!e.target.closest("input,textarea")){e.preventDefault();q.focus()}
  else if(e.key==="Escape"){if(!scrim.hidden)closeImport();else if(!drawer.hidden)closeDrawer();else if(S.sel>=0)closePanel();else if(S.focus){clearFocus();renderDrawer()}}});
const hint=document.getElementById("hint");if(matchMedia("(pointer:coarse)").matches)hint.textContent="Drag to orbit · Pinch to zoom · Tap a neuron";
let hintGone=false;function hideHint(){if(hintGone)return;hintGone=true;hint.style.opacity=0}

/* =========================================================================
   IMPORT / EMPTY / STRESS
   ========================================================================= */
const scrim=document.getElementById("importScrim"),impMsg=document.getElementById("impMsg"),emptyEl=document.getElementById("empty"),banner=document.getElementById("banner");
function store(k,v){try{localStorage.setItem("aibrain:"+k,typeof v==="string"?v:JSON.stringify(v));return true}catch(e){return false}}
function readS(k){try{return localStorage.getItem("aibrain:"+k)}catch(e){return null}}
function dropS(k){try{localStorage.removeItem("aibrain:"+k)}catch(e){}}
function openImport(){scrim.hidden=false;impMsg.textContent="";impMsg.className="msg";document.getElementById("copyArea").innerHTML="";setTimeout(()=>document.getElementById("impClose").focus(),30)}
function closeImport(){scrim.hidden=true}
document.getElementById("btnImport").addEventListener("click",openImport);document.getElementById("impClose").addEventListener("click",closeImport);
scrim.addEventListener("click",e=>{if(e.target===scrim)closeImport()});
document.getElementById("emptyImport").addEventListener("click",openImport);
document.getElementById("emptySeed").addEventListener("click",()=>{dropS("data");load(SEED,"seed")});
document.getElementById("restoreSeed").addEventListener("click",()=>{dropS("data");load(SEED,"seed");closeImport()});
document.getElementById("showEmpty").addEventListener("click",()=>{load({neurons:[]},"empty");closeImport()});
document.getElementById("stress").addEventListener("click",()=>{load(synthetic(3000),"stress");closeImport()});
document.getElementById("copyJson").addEventListener("click",()=>{const txt=JSON.stringify(exportData(G),null,2);
  const fb2=()=>{document.getElementById("copyArea").innerHTML=`<textarea class="copy" id="copyTa" readonly aria-label="Brain data as JSON"></textarea>`;const ta=document.getElementById("copyTa");ta.value=txt;ta.focus();ta.select();impMsg.className="msg";impMsg.textContent="Copying isn’t available here. The JSON is selected below, ready to copy."};
  try{navigator.clipboard.writeText(txt).then(()=>{impMsg.className="msg";impMsg.textContent=`Copied ${G.neurons.length} neurons as JSON.`},fb2)}catch(e){fb2()}});
const fileIn=document.getElementById("file"),dropEl=document.getElementById("drop");
fileIn.addEventListener("change",()=>{if(fileIn.files[0])readFile(fileIn.files[0]);fileIn.value=""});
["dragenter","dragover"].forEach(t=>addEventListener(t,e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes("Files")){e.preventDefault();dropEl.classList.add("over")}}));
["dragleave","drop"].forEach(t=>addEventListener(t,()=>dropEl.classList.remove("over")));
addEventListener("drop",e=>{if(!e.dataTransfer||!e.dataTransfer.files.length)return;e.preventDefault();if(scrim.hidden)openImport();readFile(e.dataTransfer.files[0])});
function readFile(f){const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);
    if(Importer.isClaudeExport(data)||(Array.isArray(data)&&data[0]&&"mapping" in data[0])){importExport(data);return}
    const t=normalize(data);if(!t.neurons.length)throw new Error("The file has no neurons in it.");
    load(data,"import");store("data",JSON.stringify(data));impMsg.className="msg";impMsg.textContent=`Imported ${t.neurons.length} neurons and ${t.edges.length} connections.`;setTimeout(closeImport,900);
  }catch(err){impMsg.className="msg err";impMsg.textContent=err instanceof SyntaxError?"That file isn’t valid JSON. Check it opens in a JSON viewer, then try again.":err.message}};
  r.onerror=()=>{impMsg.className="msg err";impMsg.textContent="The file couldn’t be read. Try choosing it again."};r.readAsText(f)}
// A raw claude.ai export is grouped into knowledge right here, merged into the brain on screen
// (seed or a previous import) and kept in this browser. The Claude pass lives in the CLI.
function importExport(data){
  let base=SEED.neurons;const saved=readS("data");
  if(saved){try{const b=JSON.parse(saved);const l=Array.isArray(b)?b:b&&b.neurons;if(Array.isArray(l)&&l.length)base=l}catch(e){}}
  impMsg.className="msg";impMsg.textContent="Grouping your conversations into knowledge…";
  setTimeout(()=>{try{const {brain,stats}=Importer.fromExport(data,{base,conv:CONV});
    load(brain,"import");const kept=store("data",JSON.stringify(brain));
    impMsg.textContent=`Grouped ${stats.conversations.toLocaleString("en-IN")} conversations into ${stats.topics} topics: ${stats.added} new ${stats.added===1?"neuron":"neurons"}, ${stats.updated} merged into existing ones. New neurons are private.`+
      (kept?"":" It’s too large to keep in this browser, so it resets on reload. Use npm run import for a brain.json you can reopen.");
    if(kept)setTimeout(closeImport,2400)}catch(err){impMsg.className="msg err";impMsg.textContent=err.message}},40)}
document.getElementById("schema").textContent=JSON.stringify({neurons:[{id:"neuron-001",title:"AI Design Workflow",category:"AI / Design",type:"project | skill | foundation | experiment | research | idea",status:"built | in-progress | exploring | experimenting | learned | paused | archived",visibility:"public | private",weight:"1–5",createdAt:"2026-03-12",updatedAt:"2026-09-20",description:"…",learned:["…"],created:["…"],insights:["…"],skills:["AI","UX Design"],conversations:[{title:"…",date:"2026-09-20",summary:"…"}],connections:["neuron-002","neuron-017"]}]},null,2);
function synthetic(N){const r=rng(99),neurons=[],types=LAYERS.map(l=>l.key),ds=["design","ai","product","dev"];
  for(let i=0;i<N;i++){const t=types[Math.min(5,(Math.pow(r(),.8)*6)|0)];neurons.push({id:"syn-"+i,title:"Synthetic "+String(i+1).padStart(4,"0"),domains:[ds[(r()*4)|0]],type:t,status:t==="idea"?"idea":"exploring",weight:1+((r()*r()*5)|0),description:"Synthetic neuron for performance testing.",synthetic:true,connections:[],conversations:[{title:"Synthetic conversation",date:iso(NOW-r()*300*DAY),summary:""}]})}
  const byR={};neurons.forEach((n,i)=>{const k=regionOf({type:n.type,domains:n.domains});(byR[k]=byR[k]||[]).push(i)});
  neurons.forEach((n,i)=>{const pool=byR[regionOf({type:n.type,domains:n.domains})];for(let k=0;k<2;k++){const j=r()<.85?pool[(r()*pool.length)|0]:(r()*N)|0;if(j!==i)n.connections.push("syn-"+j)}});return{neurons}}

function load(data,mode){
  try{G=normalize(data)}catch(e){G=normalize(SEED);mode="seed"}
  if(S.sel>=0){S.sel=-1;panel.classList.remove("open");document.body.classList.remove("detail")}
  S.hover=-1;S.focus=null;S.insight=-1;S.trail=[];S.region="all";S.asOf=null;sig.list=[];
  const empty=!G.neurons.length;emptyEl.hidden=!empty;
  document.querySelectorAll(".metrics,.nav,.timeline,.orb-wrap,.caption").forEach(el=>el.style.visibility=empty?"hidden":"");
  banner.hidden=!(mode==="stress"||mode==="import");
  if(mode==="stress")banner.innerHTML=`<span>Synthetic performance test · ${G.neurons.length.toLocaleString("en-IN")} neurons, ${G.edges.length.toLocaleString("en-IN")} connections</span><button class="vbtn" id="bRestore" style="height:28px">Back to my brain</button>`;
  if(mode==="import")banner.innerHTML=`<span>Showing imported data</span><button class="vbtn" id="bRestore" style="height:28px">Back to seed brain</button>`;
  const br=document.getElementById("bRestore");if(br)br.onclick=()=>{dropS("data");load(SEED,"seed")};
  growTarget=empty?.32:1;growStart=performance.now();
  if(empty){Object.values(rlEls).forEach(e=>e.remove());rlEls={};nlEls.forEach(e=>{e.style.opacity=0;e.dataset.i=-1});closeDrawer();goHome(0);return}
  layout(G);buildGPU();buildRegionLabels();applyFilters();renderNav();renderTimeline();renderDrawer();renderView();
  formStart=performance.now();measureSafe();
  const h=home();flyTo({...h},0);if(!REDUCED){cam.r=h.r*1.45;flyTo({r:h.r},3.4)}
}
let rz=0;addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(G&&G.neurons.length){measureSafe();if(S.sel<0&&!S.focus&&S.region==="all")goHome(.6)}},150)});

(function boot(){
  if(!gl){emptyEl.hidden=false;emptyEl.querySelector("h2").textContent="This brain needs WebGL.";emptyEl.querySelector("p").textContent="Open the page in a current browser with hardware acceleration on to see it.";return}
  if(readS("view")==="public")S.view="public";renderView();
  let data=SEED,mode="seed";const saved=readS("data");if(saved){try{data=JSON.parse(saved);mode="import"}catch(e){}}
  if(location.hash==="#empty"){data={neurons:[]};mode="empty"}else if(location.hash==="#stress"){data=synthetic(3000);mode="stress"}
  load(data,mode);requestAnimationFrame(frame);
})();

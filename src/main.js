import { CONV, SEED } from "./data/seed.js";
import { Importer } from "./importer/core.js";
import { Cloud } from "./cloud.js";

/* =========================================================================
   MODEL
   ========================================================================= */
const DOMAINS = {design:{label:"Design"},ai:{label:"AI"},product:{label:"Product"},dev:{label:"Development"},career:{label:"Career"}};
// Minimal colour: icy blue and cyan lead, violet and amber are the restrained highlights.
const REGIONS = {
  design:{label:"Design",color:"#ffb46e"},
  ai:{label:"AI",color:"#5fe1ff"},
  product:{label:"Product",color:"#a99bff"},
  dev:{label:"Development",color:"#7fa9ff"},
  research:{label:"Research",color:"#dfe7f2"},
  ideas:{label:"Ideas",color:"#9ff2df"}
};
const RKEYS = Object.keys(REGIONS);
const TYPES = ["foundation","skill","project","experiment","research","idea"];
// Layered Intelligence, bottom to top. Emerging holds what is being explored right now.
const LAYERS = [["foundation","Foundation"],["skill","Skills"],["research","Research"],["project","Projects"],["experiment","Experiments"],["idea","Ideas"],["emerging","Emerging"]];
const TYPE_LABEL = {foundation:"Foundation",skill:"Skill",project:"Project",experiment:"Experiment",research:"Research",idea:"Idea"};
const STATUS_LABEL = {learned:"Learned",exploring:"Exploring",built:"Built",experimenting:"Experimenting",archived:"Archived","in-progress":"In progress",paused:"Paused",idea:"Idea"};
const STATES = [{k:"flow",n:"01",label:"Quantum Flow",short:"Flow"},{k:"orb",n:"02",label:"Knowledge Orb",short:"Orb"},{k:"layers",n:"03",label:"Layered Intelligence",short:"Layers"},
  {k:"galaxy",n:"04",label:"Knowledge Galaxy",short:"Galaxy"},{k:"engine",n:"05",label:"Intelligence Engine",short:"Engine"}];
const SKEYS = STATES.map(s=>s.k);
const LEVELS = ["Universe","Cluster","Knowledge","Detail"];
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
function hashId(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

function normalize(raw){
  const list=Array.isArray(raw)?raw:(raw&&Array.isArray(raw.neurons)?raw.neurons:null);
  if(!list) throw new Error("No neurons found. The file needs an array of neurons, or an object with a “neurons” array.");
  const neurons=[],byId=new Map();
  list.forEach((r,i)=>{
    if(!r||typeof r!=="object")return;
    const id=String(r.id??`neuron-${i+1}`);if(byId.has(id))return;
    let domains=Array.isArray(r.domains)&&r.domains.length?r.domains.map(mapDomain):String(r.category||"").split(/[\/,·|]/).filter(Boolean).map(mapDomain);
    if(!domains.length)domains=["product"];domains=[...new Set(domains)];
    const type=TYPES.includes(r.type)?r.type:mapType(r.type||r.layer);
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
  const adj=neurons.map(()=>new Set()),edges=[],eIdx=new Map();
  neurons.forEach(n=>n._conn.forEach(cid=>{const m=byId.get(cid);if(!m||m===n)return;const a=Math.min(n.idx,m.idx),b=Math.max(n.idx,m.idx),k=a*1e6+b;
    if(eIdx.has(k))return;eIdx.set(k,edges.length);edges.push([a,b]);adj[a].add(b);adj[b].add(a)}));
  const dens=neurons.length>250?Math.max(.5,Math.sqrt(250/neurons.length)):1;
  neurons.forEach(n=>{n.degree=adj[n.idx].size;const age=n.updatedAt?(NOW-n.updatedAt)/DAY:400;
    n.activity=Math.max(.15,Math.min(1,1-age/75));n.age01=Math.min(1,Math.max(0,age)/365);
    n.emerging=["exploring","experimenting","in-progress"].includes(n.status)&&age<=30;
    n.layer=n.emerging?6:LAYERS.findIndex(l=>l[0]===n.type);
    n.imp=Math.min(1,n.weight/5*.7+Math.min(1,Math.sqrt(n.degree)/3.5)*.3);
    const h=hashId(n.id);n.seed=h;n.s01=(h%10007)/10007;n.ph=(h%6283)/1000;
    n.size=(6+n.weight*2.6+Math.sqrt(n.degree)*1.5)*(dens<1?.55+.45*dens:1);n.pos=[0,0,0]});
  return {neurons,byId,edges,adj,eIdx,density:dens};
}
const edgeOf=(a,b)=>{const k=Math.min(a,b)*1e6+Math.max(a,b);return G.eIdx.has(k)?G.eIdx.get(k):-1};
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
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t,sstep=t=>t*t*(3-2*t);
const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
// Per-item stagger for morphs: each vertex or neuron starts a little later than the last, so shapes flow instead of snapping.
const stag=(k,s)=>sstep(clamp(k*1.35-s*.35,0,1));
const norm3=v=>{const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const randUnit=r=>{const z=r()*2-1,a=r()*6.2832,s=Math.sqrt(1-z*z);return[Math.cos(a)*s,z,Math.sin(a)*s]};
const bez=(a,c,b,t,o)=>{const u=1-t;o[0]=u*u*a[0]+2*u*t*c[0]+t*t*b[0];o[1]=u*u*a[1]+2*u*t*c[1]+t*t*b[1];o[2]=u*u*a[2]+2*u*t*c[2]+t*t*b[2];return o};
const SILVER=[.76,.83,.93],ICE=[.55,.82,1];
const mixc=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];

/* =========================================================================
   STATES — five arrangements of the same knowledge. Structure lines and
   particles are generated per state and morphed on the GPU; knowledge
   neurons are laid out per state and morphed on the CPU so links, labels
   and picking always agree with what is drawn.
   ========================================================================= */
const V=28, R_ORB=10, LAYER_GAP=3.4, RINGS=[3,5.5,8,10.5,13.5,17,21.5];
const ENV=[15.5,9.6,9];
const layerY=i=>(i-3)*LAYER_GAP;
const sector=k=>RKEYS.indexOf(k)*Math.PI/3+.35;
const FLOW_A={design:[-8.5,3.6,1.2],ai:[1.5,5.8,-1],product:[-12.5,-.6,-1.2],dev:[10.5,1.8,1.2],research:[-3.5,-4.8,1.2],ideas:[7.5,-4.8,-1.6]};

function regionStats(G){
  const w={},cnt={},lc=new Array(7).fill(0),pair={};RKEYS.forEach(k=>{w[k]=0;cnt[k]=0});
  G.neurons.forEach(n=>{w[n.region]+=n.weight*(.5+n.activity);cnt[n.region]++;lc[n.layer]++});
  G.edges.forEach(([a,b])=>{const A=G.neurons[a].region,B=G.neurons[b].region;if(A!==B){const k=[A,B].sort().join("|");pair[k]=(pair[k]||0)+1}});
  const order=[...RKEYS].sort((a,b)=>w[b]-w[a]);
  return{w,cnt,lc,pair,order,top:order[0],focus:order[0]};
}
function anchors(state,st){const A={};
  if(state==="flow")RKEYS.forEach(k=>A[k]=FLOW_A[k]);
  else if(state==="orb")RKEYS.forEach((k,i)=>{const y=1-(i+.5)/6*2,s=Math.sqrt(1-y*y),a=i*2.39996+.6;A[k]=norm3([Math.cos(a)*s,y*.85,Math.sin(a)*s+.35]).map(v=>v*R_ORB*.62)});
  else if(state==="layers")RKEYS.forEach(k=>{const a=sector(k);A[k]=[Math.cos(a)*7,0,Math.sin(a)*7]});
  else if(state==="galaxy"){const rest=st.order.filter(k=>k!==st.top);A[st.top]=[0,0,0];rest.forEach((k,i)=>{const a=i/rest.length*6.2832+.5;A[k]=[Math.cos(a)*34,Math.sin(a*2)*3,Math.sin(a)*21]})}
  else{const f=st.focus,rest=RKEYS.filter(k=>k!==f);A[f]=[0,0,0];rest.forEach((k,i)=>{A[k]=[(i-2)*13,-9+(i%2)*3,-58-(i%2)*8]})}
  return A}

// Arnold–Beltrami–Childress flow: divergence-free, so traced lines curl, merge and part like currents.
function abc(q,s){const x=q[0]*s,y=q[1]*s,z=q[2]*s;return[Math.sin(z)+.8*Math.cos(y),.9*Math.sin(x)+Math.cos(z),.8*Math.sin(y)+.9*Math.cos(x)]}
function trace(out,o,p,step,scale,env,c){
  for(let v=0;v<V;v++){const b=o+v*3;out[b]=p[0];out[b+1]=p[1];out[b+2]=p[2];
    const q=[p[0]-c[0],p[1]-c[1],p[2]-c[2]],f=abc(q,scale),hx=q[0]<0?-1:1;
    // two slow circulations imply hemispheres without drawing anatomy
    const sw=[-q[1],q[0]-hx*env[0]*.45,0],sl=Math.hypot(sw[0],sw[1])||1;
    const d=[f[0]+sw[0]/sl*.85,f[1]+sw[1]/sl*.85,f[2]*.75];
    const e=Math.hypot(q[0]/env[0],q[1]/env[1],q[2]/env[2]);
    if(e>.86){const k=(e-.86)*10;d[0]-=q[0]/env[0]*k;d[1]-=q[1]/env[1]*k;d[2]-=q[2]/env[2]*k}
    const l=Math.hypot(d[0],d[1],d[2])||1;p=[p[0]+d[0]/l*step,p[1]+d[1]/l*step,p[2]+d[2]/l*step]}}
function genLines(state,SC,A){const{L,lreg,st}=SC,out=new Float32Array(L*V*3),si=SKEYS.indexOf(state);
  const pairs=Object.entries(st.pair),pairTot=pairs.reduce((s,[,c])=>s+c,0);
  const put=(o,v,x,y,z)=>{out[o+v*3]=x;out[o+v*3+1]=y;out[o+v*3+2]=z};
  for(let i=0;i<L;i++){const r=rng(9973*i+131*si+7),rk=lreg[i]>=0?RKEYS[lreg[i]]:null,o=i*V*3;
    if(state==="flow"){let p;
      if(rk){const a=A[rk];p=[a[0]+gauss(r)*3,a[1]+gauss(r)*2.2,a[2]+gauss(r)*2.6]}
      else do{p=[(r()*2-1)*ENV[0],(r()*2-1)*ENV[1],(r()*2-1)*ENV[2]]}while(Math.hypot(p[0]/ENV[0],p[1]/ENV[1],p[2]/ENV[2])>.95);
      trace(out,o,p,.6,.2,ENV,[0,0,0])}
    else if(state==="orb"){
      const u=rk?norm3(A[rk].map(x=>x+gauss(r)*3.4)):randUnit(r),w=norm3(cross(u,randUnit(r)));
      const rr=R_ORB*(rk?.42+.58*r():.22+.82*Math.pow(r(),.55)),span=.5+r()*2,spiral=r()<.35?.45:0;
      for(let v=0;v<V;v++){const t=v/(V-1),th=-span/2+span*t,rad=rr*(1-spiral*t),c=Math.cos(th),s=Math.sin(th);put(o,v,(u[0]*c+w[0]*s)*rad,(u[1]*c+w[1]*s)*rad,(u[2]*c+w[2]*s)*rad)}}
    else if(state==="layers"){
      const wts=st.lc.map(c=>c+1.5),tot=wts.reduce((a,b)=>a+b,0);let x=r()*tot,li=0;while(li<6&&(x-=wts[li])>0)li++;
      const a0=rk?sector(rk):r()*6.2832;
      if(r()<.18&&li<6){const ang=a0+gauss(r)*.35,r1=2.5+r()*8,r2=clamp(r1+gauss(r)*1.8,1.5,12),y1=layerY(li),y2=layerY(li+1);
        for(let v=0;v<V;v++){const t=v/(V-1),e=sstep(t),rad=lerp(r1,r2,e),an=ang+Math.sin(t*Math.PI)*.12;put(o,v,Math.cos(an)*rad,lerp(y1,y2,e),Math.sin(an)*rad)}}
      else{const span=rk?.5+r()*1.5:1.2+r()*5,rad=2+r()*10.5,sd=r()*9;
        for(let v=0;v<V;v++){const t=v/(V-1),th=a0-span/2+span*t,rr=rad*(1+.06*Math.sin(3*th+sd));put(o,v,Math.cos(th)*rr,layerY(li)+.28*Math.sin(2*th+sd)+.18*Math.sin(rr*.9+sd),Math.sin(th)*rr)}}}
    else if(state==="galaxy"){
      const pickPair=()=>{let x=r()*(pairTot+3);for(const[k,c]of pairs){x-=c;if(x<=0)return k.split("|")}const a=RKEYS[(r()*6)|0];return[a,RKEYS[(RKEYS.indexOf(a)+1+((r()*5)|0))%6]]};
      if(rk&&r()<.72){const a=A[rk],cr=3+Math.sqrt(st.cnt[rk]+2)*1.3,arm=r()*6.2832,tw=2.4+r()*1.4,y0=gauss(r)*.3;
        for(let v=0;v<V;v++){const t=v/(V-1),rad=(.12+t)*cr,an=arm+t*tw;put(o,v,a[0]+Math.cos(an)*rad,a[1]+y0*(1-t),a[2]+Math.sin(an)*rad)}}
      else{let[ka,kb]=pickPair();if(rk&&r()<.5){ka=rk;if(kb===ka)kb=RKEYS[(RKEYS.indexOf(ka)+1)%6]}
        const j=()=>gauss(r)*1.6,a=A[ka].map(x=>x+j()),b=A[kb].map(x=>x+j()),sd=r()*9,lift=(r()*2-1)*9;
        const c=[(a[0]+b[0])/2+gauss(r)*5,(a[1]+b[1])/2+lift,(a[2]+b[2])/2+gauss(r)*5],p=[0,0,0];
        for(let v=0;v<V;v++){const t=v/(V-1),n=Math.sin(t*Math.PI)*.6;bez(a,c,b,t,p);put(o,v,p[0]+Math.sin(t*9+sd)*n,p[1]+Math.cos(t*7+sd)*n,p[2]+Math.sin(t*8+sd*2)*n)}}}
    else{ // engine: instrumentation around the focus cluster, the rest as far tangles
      if(rk&&rk!==st.focus){const a=A[rk];trace(out,o,[a[0]+gauss(r)*2.5,a[1]+gauss(r)*1.8,a[2]+gauss(r)*2.5],.4,.35,[5,3.5,5],a)}
      else{const kind=r();
        if(kind<.42){const R=RINGS[(r()*RINGS.length)|0],seg=1+((r()*3)|0),span=6.2832/seg,a0=r()*6.2832,tilt=r()<.22?(r()*2-1)*.9:0,ct=Math.cos(tilt),stl=Math.sin(tilt);
          for(let v=0;v<V;v++){const th=a0+span*v/(V-1),x=Math.cos(th)*R,z=Math.sin(th)*R;put(o,v,x,-.2*ct-z*stl,-.2*stl+z*ct)}}
        else if(kind<.66){const c=Math.round((r()*2-1)*12)*2,ax=r()<.5;for(let v=0;v<V;v++){const s=lerp(-26,26,v/(V-1));ax?put(o,v,s,-7.5,c):put(o,v,c,-7.5,s)}}
        else if(kind<.78){const an=Math.round(r()*24)/24*6.2832;for(let v=0;v<V;v++){const rad=lerp(5.5,22,v/(V-1));put(o,v,Math.cos(an)*rad,-.2,Math.sin(an)*rad)}}
        else trace(out,o,[gauss(r)*4,gauss(r)*2,gauss(r)*4],.45,.3,[12,5,12],[0,0,0])}}
  }
  return out}
function genPoints(state,SC,lines){const{NP,pline,pv,pdust}=SC,out=new Float32Array(NP*3),si=SKEYS.indexOf(state);
  for(let j=0;j<NP;j++){const r=rng(7919*j+977*si+3),o=j*3;
    if(pdust[j]){const u=randUnit(r),g=state==="galaxy",rad=(g?70:38)+r()*(g?60:34);out[o]=u[0]*rad*(g?1.3:1);out[o+1]=u[1]*rad*(g?.45:.8);out[o+2]=u[2]*rad;continue}
    if(state==="orb"&&r()<.22){out[o]=gauss(r)*2.2;out[o+1]=gauss(r)*2.2;out[o+2]=gauss(r)*2.2;continue}
    const f=pv[j]*(V-1),v0=Math.min(V-2,Math.floor(f)),t=f-v0,b=pline[j]*V*3+v0*3,s=state==="engine"?.08:.26;
    out[o]=lerp(lines[b],lines[b+3],t)+gauss(r)*s;out[o+1]=lerp(lines[b+1],lines[b+4],t)+gauss(r)*s;out[o+2]=lerp(lines[b+2],lines[b+5],t)+gauss(r)*s}
  return out}
// Structure density follows the data: busier regions get more lines. None of this is counted as knowledge.
function buildScaffold(G){
  const st=regionStats(G);st.focus=S.region!=="all"?S.region:st.top;
  const tier=phone()?0:innerWidth<1280?1:2,L=[320,540,780][tier],NP=[3400,6800,10800][tier],r0=rng(21);
  const tot=RKEYS.reduce((s,k)=>s+st.w[k]+1.5,0);
  const lreg=new Int8Array(L),lseed=new Float32Array(L),lcol=[];
  for(let i=0;i<L;i++){lseed[i]=r0();if(r0()<.2)lreg[i]=-1;else{let x=r0()*tot,k=0;for(;k<5;k++){x-=st.w[RKEYS[k]]+1.5;if(x<=0)break}lreg[i]=k}
    lcol.push(lreg[i]>=0?mixc(SILVER,hex(REGIONS[RKEYS[lreg[i]]].color),.3):mixc(SILVER,ICE,.3))}
  const pline=new Int32Array(NP),pv=new Float32Array(NP),pdust=new Uint8Array(NP),pseed=new Float32Array(NP),psize=new Float32Array(NP),pcol=new Float32Array(NP*3),preg=new Float32Array(NP),pborn=new Float32Array(NP);
  for(let j=0;j<NP;j++){pseed[j]=r0();pdust[j]=r0()<.16?1:0;pline[j]=(r0()*L)|0;pv[j]=r0();
    psize[j]=pdust[j]?.35+r0()*.5:.45+Math.pow(r0(),2)*1.3;
    const c=pdust[j]?[.62,.68,.78]:mixc(lcol[pline[j]],[1,1,1],.35);pcol.set(c,j*3);preg[j]=pdust[j]?-1:lreg[pline[j]]}
  const SC={L,NP,st,lreg,lseed,lcol,pline,pv,pdust,pseed,psize,pcol,preg,pborn,lines:{},pts:{},A:{}};
  SKEYS.forEach(s=>computeState(SC,s));
  const f=SC.pts.flow;for(let j=0;j<NP;j++)pborn[j]=pdust[j]?.75+r0()*.25:clamp(Math.hypot(f[j*3],f[j*3+1],f[j*3+2])/17,0,1)*.7+r0()*.3;
  return SC}
function computeState(SC,s){const A=anchors(s,SC.st);SC.A[s]=A;SC.lines[s]=genLines(s,SC,A);SC.pts[s]=genPoints(s,SC,SC.lines[s])}

function neuronLayout(state,G,st){
  const N=G.neurons.length,P=new Float32Array(N*3),A=anchors(state,st);
  const byR={};G.neurons.forEach(n=>(byR[n.region]=byR[n.region]||[]).push(n));
  Object.values(byR).forEach(l=>l.sort((a,b)=>b.imp-a.imp).forEach((n,k)=>{n.rank=k;n.rankN=l.length}));
  G.neurons.forEach((n,i)=>{const r=rng(n.seed+SKEYS.indexOf(state)*7),a=A[n.region];let p;
    if(state==="flow"){const s=1.3+Math.sqrt(n.rankN)*.32;p=[a[0]+gauss(r)*s*1.2,a[1]+gauss(r)*s*.8,a[2]+gauss(r)*s*.9+(n.layer-3)*.45-n.age01*3.5]}
    else if(state==="orb"){const d=norm3(a),dir=norm3([d[0]+gauss(r)*.34,d[1]+gauss(r)*.34,d[2]+gauss(r)*.34]);
      const rad=R_ORB*(.24+.6*(1-n.imp)+n.age01*.15)*(n.region==="ideas"?1.3:1);p=dir.map(v=>v*rad)}
    else if(state==="layers"){const ang=sector(n.region)+gauss(r)*.28,rad=2.6+(1-n.imp)*7.5+r()*1.4;p=[Math.cos(ang)*rad,layerY(n.layer)+gauss(r)*.2,Math.sin(ang)*rad]}
    else if(state==="galaxy"){const cr=3+Math.sqrt(n.rankN)*1.1,t=Math.sqrt((n.rank+.5)/n.rankN),ang=(n.rank%2)*Math.PI+t*3.2+gauss(r)*.25,rad=t*cr;
      p=[a[0]+Math.cos(ang)*rad,a[1]+gauss(r)*.35*(1-t*.5),a[2]+Math.sin(ang)*rad]}
    else if(n.region===st.focus){const np=Math.min(n.rankN,Math.max(3,Math.ceil(n.rankN*.35))),prim=n.rank<np,cnt=prim?np:Math.max(1,n.rankN-np),k=prim?n.rank:n.rank-np;
      const ang=k/cnt*6.2832+(prim?0:.35),ring=prim?5.5:10.5;p=[Math.cos(ang)*ring,(n.layer-3)*.55,Math.sin(ang)*ring]}
    else p=[a[0]+gauss(r)*3,a[1]+gauss(r)*2,a[2]+gauss(r)*3];
    P[i*3]=p[0];P[i*3+1]=p[1];P[i*3+2]=p[2]});
  if(N<=400&&(state==="flow"||state==="orb"||state==="galaxy"))relax(G,P,state==="galaxy"?2.2:1.6);
  return P}
function relax(G,P,minD){const N=G.neurons.length,H=Float32Array.from(P),F=new Float32Array(N*3),m2=minD*minD*4;
  for(let it=0;it<80;it++){const a=1-it/80;F.fill(0);
    for(let i=0;i<N;i++)for(let k=i+1;k<N;k++){const dx=P[i*3]-P[k*3],dy=P[i*3+1]-P[k*3+1],dz=P[i*3+2]-P[k*3+2],d2=Math.max(dx*dx+dy*dy+dz*dz,.04);if(d2>m2)continue;
      const f=minD*minD/d2*.4*a;F[i*3]+=dx*f;F[i*3+1]+=dy*f;F[i*3+2]+=dz*f;F[k*3]-=dx*f;F[k*3+1]-=dy*f;F[k*3+2]-=dz*f}
    for(const[i,k]of G.edges){const dx=P[k*3]-P[i*3],dy=P[k*3+1]-P[i*3+1],dz=P[k*3+2]-P[i*3+2],d=Math.hypot(dx,dy,dz)||1,f=(d-3.2)/d*.008*a;
      F[i*3]+=dx*f;F[i*3+1]+=dy*f;F[i*3+2]+=dz*f;F[k*3]-=dx*f;F[k*3+1]-=dy*f;F[k*3+2]-=dz*f}
    for(let i=0;i<N*3;i++){P[i]+=clamp(F[i],-.5,.5);P[i]+=(H[i]-P[i])*.03}}}

/* =========================================================================
   WEBGL
   ========================================================================= */
const canvas=document.getElementById("gl");
const gl=canvas.getContext("webgl",{antialias:true,alpha:true,premultipliedAlpha:false});
const REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
function shd(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
function prog(vs,fs){const p=gl.createProgram();gl.attachShader(p,shd(gl.VERTEX_SHADER,vs));gl.attachShader(p,shd(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const o={p,a:{},u:{}};const na=gl.getProgramParameter(p,gl.ACTIVE_ATTRIBUTES);for(let i=0;i<na;i++){const n=gl.getActiveAttrib(p,i).name;o.a[n]=gl.getAttribLocation(p,n)}
  const nu=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);for(let i=0;i<nu;i++){const n=gl.getActiveUniform(p,i).name;o.u[n]=gl.getUniformLocation(p,n)}return o}
function buf(d,u){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,d,u||gl.STATIC_DRAW);return b}
function bind(P,name,b,size){const l=P.a[name];if(l==null||l<0)return;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,size,gl.FLOAT,false,0,0)}
function unbindAll(){for(let i=0;i<10;i++)gl.disableVertexAttribArray(i)}

// Depth of field without post-processing: points swell and fade with distance from the focal plane.
const U=`uniform mat4 uPV;uniform float uTime,uPR,uScale,uMotion,uDim,uRegion,uFocusD,uDof,uIntro,uMix,uEngine,uAlpha;
float stag(float k,float s){return smoothstep(0.,1.,clamp(k*1.35-s*.35,0.,1.));}
float coc(float w){return abs(w-uFocusD)/uFocusD*uDof;}
float fog(float w){return clamp(1.35-w/(uFocusD*2.6),.12,1.)*smoothstep(1.5,7.,w);}`;
const SLINE_VS=`attribute vec3 aA;attribute vec3 aB;attribute float aT;attribute float aSeed;attribute vec3 aColor;attribute float aReg;${U}
varying vec3 vC;varying float vA;
void main(){vec3 p=mix(aA,aB,stag(uMix,aSeed));
p+=uMotion*.09*vec3(sin(uTime*.31+aSeed*40.+aT*2.),sin(uTime*.27+aSeed*23.),cos(uTime*.29+aSeed*31.+aT*2.5));
vec4 c=uPV*vec4(p,1.);gl_Position=c;
float draw=smoothstep(aT-.06,aT,(uIntro-.26-aSeed*.2)/.44);
float taper=pow(sin(3.14159*aT),.7);
float flow=pow(.5+.5*sin(aT*9.-uTime*(.45+aSeed*.6)*uMotion+aSeed*60.),12.);
float reg=uRegion<-.5?1.:(abs(aReg-uRegion)<.5?1.:.16);
float k=coc(c.w);float scan=uEngine*smoothstep(1.2,0.,abs(length(p.xz)-mod(uTime*4.,26.)));
vC=mix(aColor,vec3(.6,.9,1.),scan*.6);vA=(uAlpha+flow*.26+scan*.3)*taper*reg*uDim*draw*fog(c.w)/(1.+k*k*3.);}`;
const LINE_FS=`precision mediump float;varying vec3 vC;varying float vA;void main(){gl_FragColor=vec4(vC,vA);}`;
const SPOINT_VS=`attribute vec3 aA;attribute vec3 aB;attribute float aSize;attribute float aSeed;attribute float aReg;attribute float aBorn;attribute vec3 aColor;${U}
varying vec3 vC;varying float vA;
void main(){vec3 p=mix(aA,aB,stag(uMix,aSeed));
p+=uMotion*.12*vec3(sin(uTime*.23+aSeed*50.),cos(uTime*.19+aSeed*37.),sin(uTime*.21+aSeed*29.));
float g=clamp((uIntro-.05-aBorn*.42)/.3,0.,1.);float ge=1.-pow(1.-g,3.);p*=ge;
vec4 c=uPV*vec4(p,1.);gl_Position=c;float k=coc(c.w);
gl_PointSize=clamp(aSize*uScale/c.w*uPR*(1.+k*2.2),1.,48.*uPR);
float tw=.65+.35*sin(uTime*1.1*uMotion+aSeed*80.);
float reg=uRegion<-.5?1.:(abs(aReg-uRegion)<.5||aReg<-.5?1.:.2);
vC=aColor;vA=step(.001,g)*(1.+(1.-ge)*2.)*reg*uDim*tw*uAlpha*fog(c.w)/(1.+k*k*3.);}`;
const SPOINT_FS=`precision mediump float;varying vec3 vC;varying float vA;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(vC,pow(1.-r*r,1.6)*vA);}`;
const NEURON_VS=`attribute vec3 aPos;attribute vec3 aColor;attribute float aSize;attribute float aAlpha;attribute float aPhase;attribute float aAct;attribute float aKind;${U}
varying vec3 vC;varying float vA;varying float vB;
void main(){vec4 c=uPV*vec4(aPos,1.);gl_Position=c;
float pulse=1.+uMotion*(.08+.12*aAct)*sin(uTime*(.6+aAct*1.6)+aPhase);
float flick=aKind>.5?.72+.28*sin(uTime*6.+aPhase*9.)*sin(uTime*1.7+aPhase):1.;
float k=coc(c.w);vB=clamp(k,0.,1.5);
gl_PointSize=min(aSize*pulse*(1.+k*1.4)*uScale/c.w*uPR,260.*uPR);
vC=aColor;vA=aAlpha*flick*(.85+.15*pulse)/(1.+k*k*1.8);}`;
const NEURON_FS=`precision mediump float;varying vec3 vC;varying float vA;varying float vB;
void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
float core=1.-smoothstep(0.,.12+vB*.25,r);float mid=exp(-r*r*16.)*.8;float halo=exp(-r*r*4.)*.3;float ring=smoothstep(.04,0.,abs(r-.46))*.16*(1.-min(vB,1.));
vec3 c=mix(vC,vec3(1.),core*.9);gl_FragColor=vec4(c,(core+mid+halo+ring)*vA);}`;
const LINK_VS=`attribute vec3 aPos;attribute vec3 aColor;attribute float aAlpha;${U}varying vec3 vC;varying float vA;
void main(){vec4 c=uPV*vec4(aPos,1.);gl_Position=c;float k=coc(c.w);vC=aColor;vA=aAlpha*fog(c.w)/(1.+k*k*2.);}`;

const PSL=prog(SLINE_VS,LINE_FS),PSP=prog(SPOINT_VS,SPOINT_FS),PN=prog(NEURON_VS,NEURON_FS),PL=prog(LINK_VS,LINE_FS);

let G=null,GB=null,cur=null,SC=null,SGL=null,SGP=null,NLAY={},NA=new Float32Array(0),NB=new Float32Array(0),SCA=null,SCB=null;
const MO={k:1,t0:0,dur:2.4};

function expandLines(src,L){const out=new Float32Array(L*(V-1)*6);let o=0;
  for(let i=0;i<L;i++){const b=i*V*3;for(let v=0;v<V-1;v++){const a=b+v*3;out[o++]=src[a];out[o++]=src[a+1];out[o++]=src[a+2];out[o++]=src[a+3];out[o++]=src[a+4];out[o++]=src[a+5]}}return out}
function blendArr(A,B,seeds,per,k){const out=new Float32Array(A.length);
  for(let i=0;i<seeds.length;i++){const m=stag(k,seeds[i]),b=i*per*3;for(let j=b;j<b+per*3;j++)out[j]=A[j]+(B[j]-A[j])*m}return out}
function buildScaffoldGPU(){
  if(SGL)[...Object.values(SGL),...Object.values(SGP)].forEach(b=>b instanceof WebGLBuffer&&gl.deleteBuffer(b));
  const{L,NP}=SC,nv=L*(V-1)*2,t=new Float32Array(nv),seed=new Float32Array(nv),col=new Float32Array(nv*3),reg=new Float32Array(nv);let o=0;
  for(let i=0;i<L;i++)for(let v=0;v<V-1;v++)for(const w of[v,v+1]){t[o]=w/(V-1);seed[o]=SC.lseed[i];col.set(SC.lcol[i],o*3);reg[o]=SC.lreg[i];o++}
  SGL={a:buf(new Float32Array(nv*3),gl.DYNAMIC_DRAW),b:buf(new Float32Array(nv*3),gl.DYNAMIC_DRAW),t:buf(t),seed:buf(seed),col:buf(col),reg:buf(reg),n:nv};
  SGP={a:buf(new Float32Array(NP*3),gl.DYNAMIC_DRAW),b:buf(new Float32Array(NP*3),gl.DYNAMIC_DRAW),size:buf(SC.psize),seed:buf(SC.pseed),col:buf(SC.pcol),reg:buf(SC.preg),born:buf(SC.pborn),n:NP}}
function uploadMorph(){const up=(b,d)=>{gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferSubData(gl.ARRAY_BUFFER,0,d)};
  up(SGL.a,expandLines(SCA.lines,SC.L));up(SGL.b,expandLines(SCB.lines,SC.L));up(SGP.a,SCA.pts);up(SGP.b,SCB.pts)}
// Start a morph towards a state from wherever everything is right now, even mid-morph.
function startMorph(k,dur){const kk=MO.k,nseeds=G.neurons.map(n=>n.s01);
  if(kk<1){SCA={lines:blendArr(SCA.lines,SCB.lines,SC.lseed,V,kk),pts:blendArr(SCA.pts,SCB.pts,SC.pseed,1,kk)};NA=blendArr(NA,NB,nseeds,1,kk)}
  else{SCA=SCB;NA=NB}
  SCB={lines:SC.lines[k],pts:SC.pts[k]};NB=NLAY[k]||new Float32Array(0);
  uploadMorph();MO.k=REDUCED?1:0;MO.t0=performance.now();MO.dur=dur;computeCentroids()}

function buildGPU(){
  const N=G.neurons.length,E=G.edges.length;
  if(GB)Object.values(GB).forEach(v=>v instanceof WebGLBuffer&&gl.deleteBuffer(v));
  const col=new Float32Array(N*3),size=new Float32Array(N),ph=new Float32Array(N),act=new Float32Array(N),kind=new Float32Array(N);
  G.neurons.forEach((n,i)=>{col.set(hex(REGIONS[n.region].color),i*3);size[i]=n.size;ph[i]=n.ph;act[i]=n.activity;kind[i]=n.emerging||n.type==="idea"?1:0;
    n.born=(1-n.imp)*.6+n.s01*.4});
  const SEGS=E>2000?2:E>600?4:7,lv=E*SEGS*2,lc=new Float32Array(lv*3);
  G.edges.forEach(([a,b],e)=>{const ca=mixc(hex(REGIONS[G.neurons[a].region].color),SILVER,.5),cb=mixc(hex(REGIONS[G.neurons[b].region].color),SILVER,.5);
    for(let s=0;s<SEGS;s++)for(const u of[s/SEGS,(s+1)/SEGS])lc.set(mixc(ca,cb,u),((e*SEGS+s)*2+(u===s/SEGS?0:1))*3)});
  // signals favour strong, recent relationships
  let acc=0;const cum=new Float32Array(E);G.edges.forEach(([a,b],e)=>{const A=G.neurons[a],B=G.neurons[b];acc+=(A.imp+B.imp)/2*(.5+Math.max(A.activity,B.activity));cum[e]=acc});
  GB={N,E,SEGS,cum,pos:buf(new Float32Array(N*3),gl.DYNAMIC_DRAW),col:buf(col),size:buf(size,gl.DYNAMIC_DRAW),alpha:buf(new Float32Array(N),gl.DYNAMIC_DRAW),ph:buf(ph),act:buf(act),kind:buf(kind),
    lpos:buf(new Float32Array(lv*3),gl.DYNAMIC_DRAW),lcol:buf(lc),lalpha:buf(new Float32Array(lv),gl.DYNAMIC_DRAW),
    posArr:new Float32Array(N*3),sizeArr:new Float32Array(N),alphaArr:new Float32Array(N),lposArr:new Float32Array(lv*3),laArr:new Float32Array(lv),baseSize:size,lv};
  cur={alpha:new Float32Array(N),sizeMul:new Float32Array(N).fill(1),vis:new Float32Array(N).fill(1),lalpha:new Float32Array(E)};
}
const SIG_N=180,sig={pos:new Float32Array(SIG_N*3),col:new Float32Array(SIG_N*3),size:new Float32Array(SIG_N),alpha:new Float32Array(SIG_N),zero:new Float32Array(SIG_N),list:[]};
const SGB={pos:buf(sig.pos,gl.DYNAMIC_DRAW),col:buf(sig.col,gl.DYNAMIC_DRAW),size:buf(sig.size,gl.DYNAMIC_DRAW),alpha:buf(sig.alpha,gl.DYNAMIC_DRAW),zero:buf(sig.zero)};
const MOTE_N=innerWidth<=820?240:620,mote={pos:new Float32Array(MOTE_N*3),col:new Float32Array(MOTE_N*3),size:new Float32Array(MOTE_N),alpha:new Float32Array(MOTE_N),line:new Int32Array(MOTE_N),off:new Float32Array(MOTE_N),sp:new Float32Array(MOTE_N)};
{const r=rng(77);for(let i=0;i<MOTE_N;i++){mote.off[i]=r();mote.sp[i]=.03+r()*.07;mote.size[i]=1.3+r()*1.5;mote.col.set(r()<.7?[.72,.92,1]:[1,1,1],i*3)}}
const MGB={pos:buf(mote.pos,gl.DYNAMIC_DRAW),col:buf(mote.col),size:buf(mote.size),alpha:buf(mote.alpha,gl.DYNAMIC_DRAW),zero:buf(new Float32Array(MOTE_N))};
const seedPt={pos:buf(new Float32Array(3)),col:buf(new Float32Array([.8,.95,1])),size:buf(new Float32Array([1.6])),alpha:buf(new Float32Array(1),gl.DYNAMIC_DRAW),zero:buf(new Float32Array(1))};

/* matrices */
function perspective(fovy,aspect,near,far,sx,sy){const f=1/Math.tan(fovy/2),nf=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,sx,sy,(far+near)*nf,-1,0,0,2*far*near*nf,0]}
function lookAt(e,t){const z=norm3([e[0]-t[0],e[1]-t[1],e[2]-t[2]]);const x=norm3([z[2],0,-z[0]]);const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1]}
function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}

/* camera */
const phone=()=>innerWidth<=820;
const portrait=()=>innerWidth/innerHeight<.8;
const HOMES={flow:{t:[0,-.4,0],r:42,th:0,ph:1.47},orb:{t:[0,0,0],r:35,th:.35,ph:1.32},layers:{t:[0,0,0],r:52,th:.62,ph:1.12},galaxy:{t:[0,0,0],r:96,th:.2,ph:1.02},engine:{t:[0,-1.5,0],r:42,th:.5,ph:1.18}};
// Each state has a half-width that must stay in frame, so narrow screens pull the camera back instead of cropping.
const HALFW={flow:17,orb:12.5,layers:14,galaxy:42,engine:24};
function home(){const h=HOMES[S.state],p=portrait(),asp=(innerWidth||1)/(innerHeight||1),fit=HALFW[S.state]/(Math.tan(.36)*asp)*1.08;
  return{t:[...h.t],r:Math.max(h.r*(innerWidth<1100?1.08:1),fit),th:h.th,ph:h.ph,sx:0,sy:p?innerHeight*.03:8}}
const cam={t:[0,0,0],r:40,th:0,ph:1.45,sx:0,sy:0};
let tween=null,sway=0;const par={x:0,y:0,tx:0,ty:0};
function flyTo(to,dur=1.4){if(REDUCED)dur=0;const from={t:[...cam.t],r:cam.r,th:cam.th,ph:cam.ph,sx:cam.sx,sy:cam.sy};
  if(to.th!=null){let d=to.th-cam.th;d=((d+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;to.th=cam.th+d}
  tween={from,to,t0:performance.now(),dur:dur*1000};if(!dur){applyTween(1);tween=null}}
function applyTween(k){const f=tween.from,t=tween.to;if(t.t)cam.t=f.t.map((v,i)=>v+(t.t[i]-v)*k);["r","th","ph","sx","sy"].forEach(q=>{if(t[q]!=null)cam[q]=f[q]+(t[q]-f[q])*k})}
function goHome(d=1.4){flyTo(home(),d)}
const clampR=r=>Math.max(5,Math.min(home().r*2.2,r));

/* state */
const S={hover:-1,sel:-1,focus:null,region:"all",asOf:null,view:"private",state:"flow",trail:[],saved:null,insight:-1,rel:[],relIdx:0};
let visible=new Uint8Array(0),lastInteract=0,W=0,H=0,PR=1,PV=null,EYE=[0,0,40],screen=new Float32Array(0),prop=null,fexp=0;
let introFrom=0,introStart=performance.now(),introRate=1/5200,introCap=1,introCam=true,uiShown=false;
const introAt=now=>REDUCED?introCap:Math.min(introCap,introFrom+(now-introStart)*introRate);
function skipIntro(){if(uiShown||introCap<1)return;const now=performance.now();introFrom=introAt(now);introStart=now;introRate=1/900}

function cutoff(){return S.asOf==null?Infinity:S.asOf}
function applyFilters(){
  const N=G.neurons.length;visible=new Uint8Array(N);const cut=cutoff();
  G.neurons.forEach((n,i)=>{let ok=S.view==="private"||n.visibility!=="private";if(ok&&S.region!=="all")ok=n.region===S.region;if(ok&&cut<Infinity)ok=n.createdAt==null||n.createdAt<=cut;visible[i]=ok?1:0});
  if(S.sel>=0&&!visible[S.sel])closePanel();
  renderMetrics();renderReadouts();
}
const RC={};function computeCentroids(){RKEYS.forEach(k=>{const c=[0,0,0];let n=0;G.neurons.forEach((m,i)=>{if(m.region!==k)return;c[0]+=NB[i*3];c[1]+=NB[i*3+1];c[2]+=NB[i*3+2];n++});RC[k]=n?c.map(v=>v/n):(SC&&SC.A[S.state]?SC.A[S.state][k]:[0,0,0])})}
const tpos=i=>[NB[i*3],NB[i*3+1],NB[i*3+2]];
const stAmt=k=>S.state===k?ease(MO.k):0;

/* =========================================================================
   FRAME
   ========================================================================= */
let last=performance.now(),dimAmt=1,dofAmt=.3,uScale=1,panelAmt=0,roAlpha=0;
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;const time=now/1000,intro=introAt(now);
  if(MO.k<1)MO.k=Math.min(1,(now-MO.t0)/(MO.dur*1000));
  if(tween){const k=Math.min(1,(now-tween.t0)/tween.dur);applyTween(ease(k));if(k>=1)tween=null}
  if(introCam){const h=home(),e=ease(clamp((intro-.06)/.94,0,1));cam.t=h.t.map(v=>v*e);cam.r=lerp(h.r*.42,h.r,e);cam.th=h.th-(1-e)*.9;cam.ph=lerp(1.52,h.ph,e);cam.sx=h.sx;cam.sy=h.sy*e;
    if(intro>=introCap){introCam=false}}
  if(!uiShown&&intro>=Math.min(introCap,.97)){uiShown=true;document.body.classList.remove("intro");measureSafe()}
  updateIntroCaption(intro);
  const idle=!REDUCED&&S.sel<0&&!tween&&!introCam&&now-lastInteract>5000&&!pointers.size;
  sway+=((idle?1:0)-sway)*Math.min(1,dt*.5);
  par.x+=(par.tx-par.x)*Math.min(1,dt*2.2);par.y+=(par.ty-par.y)*Math.min(1,dt*2.2);
  const w=canvas.clientWidth,h=canvas.clientHeight,pr=Math.min(devicePixelRatio||1,2);
  if(w!==W||h!==H||pr!==PR){W=w;H=h;PR=pr;canvas.width=w*pr;canvas.height=h*pr}
  gl.viewport(0,0,canvas.width,canvas.height);
  const th=cam.th+sway*.3*Math.sin(time*.08)+par.x*.06,ph=clamp(cam.ph+par.y*.035,.3,Math.PI-.3),sp=Math.sin(ph);
  EYE=[cam.t[0]+cam.r*sp*Math.sin(th),cam.t[1]+cam.r*Math.cos(ph),cam.t[2]+cam.r*sp*Math.cos(th)];
  PV=mul(perspective(.72,W/H,.1,700,-2*cam.sx/W,2*cam.sy/H),lookAt(EYE,cam.t));
  uScale=H*.5/Math.tan(.36)*.11;
  const motion=REDUCED?0:1,has=G&&G.neurons.length;
  const{P}=has?focusSets():{P:null};
  const dimT=S.sel>=0?.4:P?.5:1;dimAmt+=(dimT-dimAmt)*Math.min(1,dt*2.5);
  const dofT=S.sel>=0?1.5:S.state==="engine"?.6:.28;dofAmt+=(dofT-dofAmt)*Math.min(1,dt*1.6);
  fexp+=((S.region!=="all"?1:0)-fexp)*Math.min(1,dt*1.8);
  UNI={uTime:time,uPR:PR,uScale,uMotion:motion,uDim:dimAmt,uRegion:S.region==="all"?-1:RKEYS.indexOf(S.region),uFocusD:cam.r,uDof:dofAmt,uIntro:intro,uMix:MO.k,uEngine:stAmt("engine")};
  const dens=SC?Math.sqrt(780/SC.L):1;

  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);
  if(SC){
    unbindAll();gl.useProgram(PSL.p);bind(PSL,"aA",SGL.a,3);bind(PSL,"aB",SGL.b,3);bind(PSL,"aT",SGL.t,1);bind(PSL,"aSeed",SGL.seed,1);bind(PSL,"aColor",SGL.col,3);bind(PSL,"aReg",SGL.reg,1);
    setU(PSL,{uAlpha:.11*dens*(PR>1?1.3:1)});gl.drawArrays(gl.LINES,0,SGL.n);
    unbindAll();gl.useProgram(PSP.p);bind(PSP,"aA",SGP.a,3);bind(PSP,"aB",SGP.b,3);bind(PSP,"aSize",SGP.size,1);bind(PSP,"aSeed",SGP.seed,1);bind(PSP,"aColor",SGP.col,3);bind(PSP,"aReg",SGP.reg,1);bind(PSP,"aBorn",SGP.born,1);
    setU(PSP,{uAlpha:.5*dens});gl.drawArrays(gl.POINTS,0,SGP.n);
  }
  if(has){
    updateNeurons(time,dt);updateEmphasis(dt,now,intro);updateLinks(intro);
    unbindAll();gl.useProgram(PL.p);bind(PL,"aPos",GB.lpos,3);bind(PL,"aColor",GB.lcol,3);bind(PL,"aAlpha",GB.lalpha,1);setU(PL);gl.drawArrays(gl.LINES,0,GB.lv);
    unbindAll();gl.useProgram(PN.p);bind(PN,"aPos",GB.pos,3);bind(PN,"aColor",GB.col,3);bind(PN,"aSize",GB.size,1);bind(PN,"aAlpha",GB.alpha,1);bind(PN,"aPhase",GB.ph,1);bind(PN,"aAct",GB.act,1);bind(PN,"aKind",GB.kind,1);setU(PN);gl.drawArrays(gl.POINTS,0,GB.N);
  }
  if(SC&&!REDUCED){updateMotes(time,intro);drawPoints(MGB,MOTE_N)}
  if(has&&!REDUCED){updateSignals(dt,now,intro);if(sig.list.length)drawPoints(SGB,SIG_N)}
  if(intro<.5){const a=clamp(intro/.03,0,1)*clamp((.5-intro)/.2,0,1)*2;gl.bindBuffer(gl.ARRAY_BUFFER,seedPt.alpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array([a]));drawPoints(seedPt,1)}
  if(has){project();updateLabels()}
  panelAmt+=((S.sel>=0?1:0)-panelAmt)*Math.min(1,dt*3);
  roAlpha+=((uiShown&&S.sel<0&&!P&&level()<2&&MO.k>=1&&S.state!=="engine"?1:0)-roAlpha)*Math.min(1,dt*3);
  roWrap.style.opacity=roAlpha.toFixed(3);roWrap.style.pointerEvents=roAlpha>.5?"":"none";
  drawFx(now);updateLevel();
  requestAnimationFrame(frame);
}
let UNI={};
function setU(Pr,extra){gl.uniformMatrix4fv(Pr.u.uPV,false,PV);for(const k in UNI)if(Pr.u[k])gl.uniform1f(Pr.u[k],UNI[k]);if(extra)for(const k in extra)if(Pr.u[k])gl.uniform1f(Pr.u[k],extra[k])}
function drawPoints(B,n){unbindAll();gl.useProgram(PN.p);setU(PN);bind(PN,"aPos",B.pos,3);bind(PN,"aColor",B.col,3);bind(PN,"aSize",B.size,1);bind(PN,"aAlpha",B.alpha,1);bind(PN,"aPhase",B.zero,1);bind(PN,"aAct",B.zero,1);bind(PN,"aKind",B.zero,1);
  gl.uniform1f(PN.u.uDof,dofAmt*.4);gl.drawArrays(gl.POINTS,0,n)}
function focusSets(){let P=null,Nb=new Set();
  if(S.sel>=0){P=new Set([S.sel]);if(S.hover>=0)P.add(S.hover)}else if(S.hover>=0)P=new Set([S.hover]);else if(S.focus)P=S.focus;
  if(P)P.forEach(i=>G.adj[i].forEach(j=>{if(!P.has(j))Nb.add(j)}));return{P,Nb}}
function updateNeurons(time,dt){
  const N=G.neurons.length,kk=MO.k,pa=GB.posArr,cen=RC[S.region];
  for(let i=0;i<N;i++){const n=G.neurons[i],m=kk>=1?1:stag(kk,n.s01),o=i*3;
    let x=lerp(NA[o]??NB[o],NB[o],m),y=lerp(NA[o+1]??NB[o+1],NB[o+1],m),z=lerp(NA[o+2]??NB[o+2],NB[o+2],m);
    if(fexp>.001&&cen&&n.region===S.region){const f=1+.35*fexp;x=cen[0]+(x-cen[0])*f;y=cen[1]+(y-cen[1])*f;z=cen[2]+(z-cen[2])*f}
    if(!REDUCED){const w=.14+(n.emerging?.3:0);x+=Math.sin(time*.4+n.ph)*w;y+=Math.cos(time*.33+n.ph*1.7)*w*.8;z+=Math.sin(time*.29+n.ph*2.3)*w}
    pa[o]=x;pa[o+1]=y;pa[o+2]=z;n.pos[0]=x;n.pos[1]=y;n.pos[2]=z}
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,pa);
}
function updateEmphasis(dt,now,intro){
  const{P,Nb}=focusSets(),N=GB.N,k=1-Math.pow(.0015,dt),D=G.density,pt=prop?(now-prop.t0)/1000:99;
  if(prop&&pt>8)prop=null;
  for(let i=0;i<N;i++){const n=G.neurons[i];
    cur.vis[i]+=((visible[i]?1:0)-cur.vis[i])*Math.min(1,dt*2.4);
    let a;if(!P)a=(.45+.55*n.activity)*D;else if(P.has(i))a=1;else if(Nb.has(i))a=.8;else a=(S.sel>=0?.1:.09)*D;
    let fl=0;if(prop&&prop.h.has(i)){const x=pt-prop.h.get(i)*.26-.08;fl=Math.exp(-x*x*26);if(prop.gate&&x<0&&P&&P.has(i))a*=.25}
    cur.alpha[i]+=(a-cur.alpha[i])*k;
    const ig=clamp((intro-.52-n.born*.3)/.18,0,1),v=cur.vis[i];
    GB.alphaArr[i]=(cur.alpha[i]*v+fl*.9*v)*ig;
    const sm=i===S.sel?1.55:i===S.hover?1.3:P&&P.has(i)?1.18:Nb.has(i)&&S.sel>=0?1.08:1;cur.sizeMul[i]+=(sm-cur.sizeMul[i])*k;
    GB.sizeArr[i]=GB.baseSize[i]*cur.sizeMul[i]*(.2+.8*v)*(1+fl*.45)*(.5+.5*ig)}
  G.edges.forEach(([a,b],e)=>{let t;const va=Math.min(cur.vis[a],cur.vis[b]);
    if(!P)t=(.24+.26*(G.neurons[a].activity+G.neurons[b].activity)*.5)*D;else if(P.has(a)||P.has(b))t=.85;else if(Nb.has(a)&&Nb.has(b))t=.12;else t=.025;
    cur.lalpha[e]+=(t-cur.lalpha[e])*k;GB.eVis=GB.eVis||new Float32Array(G.edges.length);GB.eVis[e]=va});
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.alpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,GB.alphaArr);
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.size);gl.bufferSubData(gl.ARRAY_BUFFER,0,GB.sizeArr);
}
// Links are quadratic arcs bowed away from the centre, so relationships read as fine curves, not wiring.
function ctrlOf(a,b,o){const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,mz=(a[2]+b[2])/2,l=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]),m=Math.hypot(mx,my,mz)||1,s=l*.16/m;
  o[0]=mx+mx*s;o[1]=my+my*s+(m<.5?l*.16:0);o[2]=mz+mz*s;return o}
const _a=[0,0,0],_b=[0,0,0],_c=[0,0,0],_p=[0,0,0];
function updateLinks(intro){const{SEGS,posArr:pa,lposArr:lp,laArr:la}=GB;let o=0,q=0;
  G.edges.forEach(([a,b],e)=>{_a[0]=pa[a*3];_a[1]=pa[a*3+1];_a[2]=pa[a*3+2];_b[0]=pa[b*3];_b[1]=pa[b*3+1];_b[2]=pa[b*3+2];ctrlOf(_a,_b,_c);
    const grow=clamp((intro-.62-Math.max(G.neurons[a].born,G.neurons[b].born)*.25)/.18,0,1),al=cur.lalpha[e]*GB.eVis[e];
    for(let s=0;s<SEGS;s++)for(const u of[s/SEGS,(s+1)/SEGS]){bez(_a,_c,_b,u,_p);lp[o++]=_p[0];lp[o++]=_p[1];lp[o++]=_p[2];la[q++]=u<=grow?al*(.55+.45*Math.sin(Math.PI*u)):0}});
  gl.bindBuffer(gl.ARRAY_BUFFER,GB.lpos);gl.bufferSubData(gl.ARRAY_BUFFER,0,lp);gl.bindBuffer(gl.ARRAY_BUFFER,GB.lalpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,la);
}
// Particles travelling along the structure lines, read from the same morph the GPU draws.
function updateMotes(time,intro){const A=SCA.lines,B=SCB.lines,kk=MO.k,ia=clamp((intro-.45)/.3,0,1),reg=S.region==="all"?-1:RKEYS.indexOf(S.region);
  for(let i=0;i<MOTE_N;i++){let li=mote.line[i];if(!li||li>=SC.L){li=mote.line[i]=((i*7919)%SC.L)}
    const u=(mote.off[i]+time*mote.sp[i])%1,f=u*(V-1),v0=Math.min(V-2,f|0),t=f-v0,m=kk>=1?1:stag(kk,SC.lseed[li]),b=li*V*3+v0*3;
    for(let c=0;c<3;c++){const p0=lerp(A[b+c],B[b+c],m),p1=lerp(A[b+3+c],B[b+3+c],m);mote.pos[i*3+c]=lerp(p0,p1,t)}
    const rf=reg<0||SC.lreg[li]===reg?1:.15;mote.alpha[i]=Math.sin(Math.PI*u)*.55*ia*rf*dimAmt}
  gl.bindBuffer(gl.ARRAY_BUFFER,MGB.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,mote.pos);gl.bindBuffer(gl.ARRAY_BUFFER,MGB.alpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,mote.alpha);
}
/* Signal language: normal → slow particle; important → bright pulse; recent → faster; strong → several particles. */
let sigClock=0;
function spawnSignal(e,dir,o={}){if(sig.list.length>=SIG_N||e<0)return;sig.list.push({e,dir,t:0,sp:o.sp||.4,br:o.br||.7,size:o.size||4,delay:o.delay||0,col:o.col||[.85,.95,1]})}
function pickEdge(){const c=GB.cum,x=Math.random()*c[c.length-1];let lo=0,hi=c.length-1;while(lo<hi){const m=(lo+hi)>>1;if(c[m]<x)lo=m+1;else hi=m}return lo}
function updateSignals(dt,now,intro){
  if(intro<.8||!G.edges.length){sig.alpha.fill(0);return}
  const{P}=focusSets();sigClock+=dt;const rate=P?.07:Math.max(.08,.5-G.edges.length*.002);
  while(sigClock>rate&&sig.list.length<SIG_N-8){sigClock-=rate;let e=-1,dir=1;
    if(P){const cand=[];P.forEach(i=>G.adj[i].forEach(j=>{if(visible[i]&&visible[j])cand.push(edgeOf(i,j))}));if(cand.length){e=cand[(Math.random()*cand.length)|0];dir=P.has(G.edges[e][0])?1:-1}}
    else for(let t=0;t<6;t++){const c=pickEdge(),[a,b]=G.edges[c];if(visible[a]&&visible[b]){e=c;break}}
    if(e<0)break;
    const A=G.neurons[G.edges[e][0]],B=G.neurons[G.edges[e][1]],imp=(A.imp+B.imp)/2,rec=Math.max(A.activity,B.activity),sp=.28+rec*.45;
    if(!P&&Math.random()<.5)dir=-1;
    const strong=A.weight>=4&&B.weight>=4,bright=imp>.72;
    for(let k=0;k<(strong?3:1);k++)spawnSignal(e,dir,{sp,br:bright?1.25:.7,size:bright?6:4,delay:k*.09,col:bright?[.9,.98,1]:[.7,.88,1]})}
  if(sig.list.length>=SIG_N-8)sigClock=0;sig.alpha.fill(0);
  sig.list=sig.list.filter(s=>{if(s.delay>0){s.delay-=dt;return true}return(s.t+=dt*s.sp)<1});
  const pa=GB.posArr;
  sig.list.forEach((s,i)=>{if(s.delay>0)return;const[a,b]=G.edges[s.e],t=ease(s.t),u=s.dir>0?t:1-t;
    _a[0]=pa[a*3];_a[1]=pa[a*3+1];_a[2]=pa[a*3+2];_b[0]=pa[b*3];_b[1]=pa[b*3+1];_b[2]=pa[b*3+2];ctrlOf(_a,_b,_c);bez(_a,_c,_b,u,_p);
    sig.pos.set(_p,i*3);sig.col.set(s.col,i*3);sig.size[i]=s.size;sig.alpha[i]=Math.sin(Math.PI*s.t)*s.br*Math.min(1,cur.lalpha[s.e]*4+.25)*GB.eVis[s.e]});
  gl.bindBuffer(gl.ARRAY_BUFFER,SGB.pos);gl.bufferSubData(gl.ARRAY_BUFFER,0,sig.pos);gl.bindBuffer(gl.ARRAY_BUFFER,SGB.alpha);gl.bufferSubData(gl.ARRAY_BUFFER,0,sig.alpha);
  gl.bindBuffer(gl.ARRAY_BUFFER,SGB.col);gl.bufferSubData(gl.ARRAY_BUFFER,0,sig.col);gl.bindBuffer(gl.ARRAY_BUFFER,SGB.size);gl.bufferSubData(gl.ARRAY_BUFFER,0,sig.size);
}
// Light propagation: a wave from one neuron through its neighbours, with signals running the same path.
function bfs(src,maxD){const h=new Map([[src,0]]),par=new Map(),q=[src];
  while(q.length){const i=q.shift(),d=h.get(i);if(d>=maxD)continue;G.adj[i].forEach(j=>{if(!visible[j]||h.has(j))return;h.set(j,d+1);par.set(j,i);q.push(j)})}return{h,par}}
function propagate(src,{depth=2,gate=false}={}){if(src<0||!G.neurons[src])return;const{h,par}=bfs(src,depth);prop={t0:performance.now(),h,gate};
  par.forEach((p,j)=>{const e=edgeOf(p,j);spawnSignal(e,G.edges[e][0]===p?1:-1,{sp:1.05,br:1.3,size:5.5,delay:h.get(p)*.26,col:[.8,.96,1]})})}
function projectPoint(p){const x=PV[0]*p[0]+PV[4]*p[1]+PV[8]*p[2]+PV[12],y=PV[1]*p[0]+PV[5]*p[1]+PV[9]*p[2]+PV[13],w=PV[3]*p[0]+PV[7]*p[1]+PV[11]*p[2]+PV[15];return[(x/w*.5+.5)*W,(1-(y/w*.5+.5))*H,w]}
function project(){const N=G.neurons.length;if(screen.length!==N*4)screen=new Float32Array(N*4);
  for(let i=0;i<N;i++){const q=projectPoint(G.neurons[i].pos);screen[i*4]=q[0];screen[i*4+1]=q[1];screen[i*4+2]=q[2];screen[i*4+3]=GB.sizeArr[i]*uScale/Math.max(q[2],.1)}}

/* =========================================================================
   INTRO — one idea → many ideas → complete intelligence
   ========================================================================= */
const introEl=document.getElementById("intro");let introK=-1;
function updateIntroCaption(intro){const k=uiShown||introCap<1?-1:intro<.03?-1:intro<.32?0:intro<.62?1:intro<.93?2:-1;
  if(k!==introK){introK=k;introEl.querySelectorAll("span").forEach(s=>s.classList.toggle("on",+s.dataset.k===k))}}

/* =========================================================================
   LABELS
   ========================================================================= */
const labelsEl=document.getElementById("labels"),LPOOL=40,nlEls=[];let rlEls={};
for(let i=0;i<LPOOL;i++){const b=document.createElement("button");b.className="nl";b.style.opacity=0;b.tabIndex=-1;b.dataset.i=-1;
  b.addEventListener("click",e=>{e.stopPropagation();const id=+b.dataset.i;if(id>=0)select(id)});
  b.addEventListener("pointerenter",()=>{const id=+b.dataset.i;if(id>=0)S.hover=id});b.addEventListener("pointerleave",()=>{S.hover=-1});labelsEl.appendChild(b);nlEls.push(b)}
function buildRegionLabels(){Object.values(rlEls).forEach(e=>e.remove());rlEls={};
  RKEYS.forEach(k=>{const b=document.createElement("button");b.className="rl";b.style.setProperty("--c",REGIONS[k].color);
    b.innerHTML=`<i></i><b class="mono">${REGIONS[k].label}</b><span class="mono"></span>`;b.setAttribute("aria-label",`Explore ${REGIONS[k].label}`);
    b.addEventListener("click",e=>{e.stopPropagation();setRegion(k)});labelsEl.appendChild(b);rlEls[k]=b})}
let safeTop=150,safeBot=700;
function measureSafe(){const t=document.querySelector(".top").getBoundingClientRect();safeTop=t.bottom+24;safeBot=innerHeight-(phone()?170:110)}
function level(){const hr=home().r;return S.sel>=0?3:cam.r>hr*.8?0:cam.r>hr*.48?1:2}
let lvlShown=-1;const lvlEl=document.getElementById("lvl");
function updateLevel(){const l=level();if(l!==lvlShown){lvlShown=l;document.body.dataset.level=l;lvlEl.innerHTML=`<span>0${l+1}</span>${LEVELS[l]}`}}
function updateLabels(){
  const lv=level(),hr=home().r;
  const rA=S.sel>=0||S.focus?0:clamp((cam.r-hr*.5)/(hr*.28),0,1)*(uiShown?1:0);
  const rb=[];RKEYS.forEach(k=>{const el=rlEls[k];if(!el)return;
    let c=[0,0,0],cnt=0;G.neurons.forEach((n,i)=>{if(!visible[i]||n.region!==k)return;c[0]+=n.pos[0];c[1]+=n.pos[1];c[2]+=n.pos[2];cnt++});
    const a=(S.region==="all"||S.region===k)&&cnt?rA:0;el.style.opacity=a;el.style.pointerEvents=a>.4?"auto":"none";el.tabIndex=a>.4?0:-1;if(!cnt)return;
    const q=projectPoint(c.map(v=>v/cnt));const x=clamp(q[0]-6,16,W-160);let y=clamp(q[1]-44,safeTop,safeBot);const wd=REGIONS[k].label.length*9+40;
    for(let t=0;t<6&&rb.some(b=>x<b[0]+b[2]&&x+wd>b[0]&&Math.abs(y-b[1])<20);t++)y+=22;rb.push([x,y,wd]);el.style.transform=`translate(${x}px,${y}px)`;
    const s=el.querySelector("span"),txt=String(cnt).padStart(2,"0");if(s.textContent!==txt)s.textContent=txt});
  const{P,Nb}=focusSets(),N=G.neurons.length,thr=lv===0?Infinity:lv===1?15:0,cand=[];
  for(let i=0;i<N;i++){if(!visible[i]||cur.vis[i]<.5)continue;const w=screen[i*4+2];if(w<=0)continue;const x=screen[i*4],y=screen[i*4+1];if(x<-20||y<safeTop-60||x>W+20||y>H+20)continue;
    let pri;if(P&&P.has(i))pri=1e4+GB.baseSize[i];else if(Nb.has(i)&&P.size<=6)pri=5e3+GB.baseSize[i];else if(P)continue;else if(GB.baseSize[i]>=thr)pri=GB.baseSize[i];else continue;cand.push([pri,i])}
  cand.sort((a,b)=>b[0]-a[0]);
  const boxes=[];let used=0;const panelLeft=S.sel>=0&&!phone()?W-440:W;
  let prim=0;const PMAX=S.sel>=0?40:14;
  for(const[,i]of cand){if(used>=LPOOL||!uiShown)break;if(P&&P.has(i)&&i!==S.sel&&++prim>PMAX)continue;const n=G.neurons[i],isP=P&&P.has(i);
    const r=Math.max(4,screen[i*4+3]*.12),wd=n.title.length*(isP?7.6:6.4)+(isP?30:24),hh=isP?28:22,x=screen[i*4]+r+10,y=screen[i*4+1]-hh/2;
    if(x+wd>panelLeft-8&&!isP)continue;
    if(boxes.some(b=>x<b[0]+b[2]&&x+wd>b[0]&&y<b[1]+b[3]&&y+hh>b[1]))continue;boxes.push([x,y,wd,hh]);
    const el=nlEls[used++];if(el.dataset.i!=String(i)){el.dataset.i=i;el.textContent=n.title;el.setAttribute("aria-label",`Open ${n.title}`);el.style.setProperty("--c",REGIONS[n.region].color)}
    el.classList.toggle("p",!!isP);el.style.transform=`translate(${x}px,${y}px)`;el.style.opacity=1;el.style.pointerEvents="auto"}
  for(let k=used;k<LPOOL;k++){const el=nlEls[k];if(el.dataset.i!=="-1"){el.style.opacity=0;el.style.pointerEvents="none";el.dataset.i=-1}}
  // contextual controls follow the selected neuron
  if(S.sel>=0&&!phone()&&screen[S.sel*4+2]>0){ctxEl.style.transform=`translate(${Math.round(screen[S.sel*4]-ctxEl.offsetWidth/2)}px,${Math.round(screen[S.sel*4+1]+Math.max(18,screen[S.sel*4+3]*.16)+16)}px)`}
}

/* =========================================================================
   FX OVERLAY — leader lines, reticles, the panel's thread to its neuron,
   the particles a closing panel collapses into, and engine readouts
   ========================================================================= */
const fx=document.getElementById("fx"),fc=fx.getContext("2d");let fxParts=[];
function drawFx(now){
  if(fx.width!==Math.round(W*PR)||fx.height!==Math.round(H*PR)){fx.width=Math.round(W*PR);fx.height=Math.round(H*PR)}
  fc.setTransform(PR,0,0,PR,0,0);fc.clearRect(0,0,W,H);fc.lineWidth=1;
  if(G&&G.neurons.length&&screen.length){
    // spatial metadata: readouts tied to the neurons they describe
    if(roAlpha>.01&&!phone())roEls().forEach((el,k)=>{const x=RO[k];if(!x)return;let t=null;
      if(x.i!=null){if(visible[x.i]&&screen[x.i*4+2]>0)t=[screen[x.i*4],screen[x.i*4+1]]}else if(x.pair){const a=RC[x.pair[0]],b=RC[x.pair[1]];if(a&&b){const q=projectPoint([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]);if(q[2]>0)t=q}}
      if(!t)return;const r=el.getBoundingClientRect(),x0=r.left-8,y0=r.top+r.height/2,x1=x0-26;
      const gr=fc.createLinearGradient(x1,y0,t[0],t[1]);gr.addColorStop(0,`rgba(185,215,255,${.26*roAlpha})`);gr.addColorStop(.7,`rgba(185,215,255,${.05*roAlpha})`);gr.addColorStop(1,`rgba(185,215,255,${.16*roAlpha})`);
      fc.strokeStyle=`rgba(185,215,255,${.26*roAlpha})`;fc.beginPath();fc.moveTo(x0,y0);fc.lineTo(x1,y0);fc.stroke();fc.strokeStyle=gr;fc.beginPath();fc.moveTo(x1,y0);fc.lineTo(t[0],t[1]);fc.stroke();
      fc.strokeStyle=`rgba(200,230,255,${.55*roAlpha})`;fc.beginPath();fc.arc(t[0],t[1],3.5,0,6.283);fc.stroke()});
    const ret=(i,a)=>{const x=screen[i*4],y=screen[i*4+1],rr=Math.max(8,screen[i*4+3]*.14)+6;fc.strokeStyle=`rgba(200,232,255,${a})`;fc.beginPath();fc.arc(x,y,rr,0,6.283);fc.stroke();
      fc.beginPath();for(let k=0;k<4;k++){const an=k*Math.PI/2+.785;fc.moveTo(x+Math.cos(an)*(rr+3),y+Math.sin(an)*(rr+3));fc.lineTo(x+Math.cos(an)*(rr+8),y+Math.sin(an)*(rr+8))}fc.stroke()};
    if(S.hover>=0&&S.hover!==S.sel&&screen[S.hover*4+2]>0)ret(S.hover,.5);
    if(S.sel>=0&&screen[S.sel*4+2]>0){ret(S.sel,.7*panelAmt);
      if(!phone()&&panel.classList.contains("open")){const pr=panel.getBoundingClientRect(),x=screen[S.sel*4],y=screen[S.sel*4+1],ex=pr.left,ey=clamp(y,pr.top+60,pr.bottom-60),mx=(x+ex)/2;
        fc.strokeStyle=`rgba(170,215,255,${.32*panelAmt})`;fc.beginPath();fc.moveTo(x+14,y);fc.bezierCurveTo(mx,y,mx,ey,ex,ey);fc.stroke();
        const u=(now/1600)%1,bx=(1-u)**3*(x+14)+3*(1-u)**2*u*mx+3*(1-u)*u*u*mx+u**3*ex,by=(1-u)**3*y+3*(1-u)**2*u*y+3*(1-u)*u*u*ey+u**3*ey;
        fc.fillStyle=`rgba(210,240,255,${.8*panelAmt*Math.sin(Math.PI*u)})`;fc.beginPath();fc.arc(bx,by,1.6,0,6.283);fc.fill()}}
    // engine instrumentation labels on the rings
    const ea=stAmt("engine");if(ea>.02){fc.font="9px 'Geist Mono',ui-monospace,monospace";fc.fillStyle=`rgba(150,200,255,${.5*ea})`;
      RINGS.forEach((R,k)=>{if(k%2)return;const q=projectPoint([R,-.2,0]);if(q[2]>0)fc.fillText(`R ${R.toFixed(1).padStart(4,"0")}`,q[0]+6,q[1]-5)});
      const q=projectPoint([0,-7.5,0]);if(q[2]>0)fc.fillText("PLANE −07.5",q[0]+8,q[1]+14)}
    // layer names on the planes
    const la=stAmt("layers")*(S.sel>=0?.3:1);if(la>.02){fc.font="10px 'Geist Mono',ui-monospace,monospace";const cnt=new Array(7).fill(0);G.neurons.forEach((n,i)=>{if(visible[i])cnt[n.layer]++});
      LAYERS.forEach(([,l],i)=>{const q=projectPoint([-13.5,layerY(i),0]);if(q[2]<=0)return;fc.fillStyle=`rgba(160,205,255,${.62*la})`;fc.fillText(`0${i+1}  ${l.toUpperCase()}`,q[0]-150,q[1]+3);
        fc.fillStyle=`rgba(120,140,170,${.6*la})`;fc.fillText(String(cnt[i]).padStart(2,"0"),q[0]-24,q[1]+3);fc.strokeStyle=`rgba(160,205,255,${.18*la})`;fc.beginPath();fc.moveTo(q[0]-8,q[1]);fc.lineTo(q[0]+26,q[1]);fc.stroke()})}
  }
  if(fxParts.length){fxParts=fxParts.filter(p=>{const u=(now-p.t0)/1000-p.delay;if(u<0)return true;const k=u/p.dur;if(k>=1)return false;
      const tx=screen[p.i*4]??p.x,ty=screen[p.i*4+1]??p.y,e=ease(k),cx=p.x+(tx-p.x)*.5+p.cx,cy=p.y+(ty-p.y)*.5+p.cy;
      const x=(1-e)**2*p.x+2*(1-e)*e*cx+e*e*tx,y=(1-e)**2*p.y+2*(1-e)*e*cy+e*e*ty;
      fc.fillStyle=`rgba(205,238,255,${Math.sin(Math.PI*k)*.85})`;fc.beginPath();fc.arc(x,y,p.s,0,6.283);fc.fill();return true})}
}
function collapseInto(rect,i){const n=phone()?60:120,now=performance.now();
  for(let k=0;k<n;k++){const edge=Math.random()<.55;let x=rect.left+Math.random()*rect.width,y=rect.top+Math.random()*rect.height;
    if(edge){if(Math.random()<.5)x=Math.random()<.5?rect.left:rect.right;else y=Math.random()<.5?rect.top:rect.bottom}
    fxParts.push({x,y,i,t0:now,delay:Math.random()*.22,dur:.75+Math.random()*.55,s:.7+Math.random()*1.1,cx:(Math.random()-.5)*160,cy:(Math.random()-.5)*160})}}

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
  lastInteract=performance.now();hideHint();skipIntro()});
addEventListener("pointermove",e=>{if(e.pointerType==="mouse"){par.tx=e.clientX/innerWidth-.5;par.ty=e.clientY/innerHeight-.5;magnet(e)}});
canvas.addEventListener("pointermove",e=>{
  if(pointers.has(e.pointerId)){pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){const[a,b]=[...pointers.values()];cam.r=clampR(pinch.r*pinch.d/Math.max(Math.hypot(a.x-b.x,a.y-b.y),1));tween=null;introCam=false}
    else if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)>5){drag.moved=true;canvas.classList.add("dragging");setHover(-1)}
      if(drag.moved){cam.th-=dx*.005;cam.ph=clamp(cam.ph-dy*.005,.35,Math.PI-.35);drag.x=e.clientX;drag.y=e.clientY;tween=null;introCam=false}}
    lastInteract=performance.now();return}
  if(e.pointerType==="mouse"&&uiShown)setHover(pick(e.clientX,e.clientY,false),e.clientX,e.clientY)});
function endPointer(e){const wasDrag=drag&&drag.moved;pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;
  if(!pointers.size){canvas.classList.remove("dragging");if(drag&&!wasDrag&&e.type==="pointerup"&&uiShown){const i=pick(e.clientX,e.clientY,drag.type!=="mouse");if(i>=0)select(i);else if(S.sel>=0)closePanel();else if(S.focus){clearFocus();renderDrawer()}}drag=null}}
canvas.addEventListener("pointerup",endPointer);canvas.addEventListener("pointercancel",endPointer);
canvas.addEventListener("pointerleave",()=>{if(!pointers.size)setHover(-1)});
canvas.addEventListener("wheel",e=>{e.preventDefault();skipIntro();introCam=false;cam.r=clampR(cam.r*Math.exp(e.deltaY*.0012));if(tween&&tween.to.r!=null)tween=null;lastInteract=performance.now();hideHint()},{passive:false});
function setHover(i,x,y){
  if(i!==S.hover){S.hover=i;canvas.classList.toggle("pointing",i>=0);
    if(i>=0){const n=G.neurons[i];tip.innerHTML=`<div class="eyebrow mono"><span class="dot" style="--c:${REGIONS[n.region].color}"></span>${REGIONS[n.region].label} · ${TYPE_LABEL[n.type]}</div><h3>${esc(n.title)}</h3><p>${esc(short(n.description,120))}</p><div class="foot mono">${STATUS_LABEL[n.status]||n.status} · ${n.degree} ${n.degree===1?"link":"links"}</div>`;tip.classList.add("on")}
    else tip.classList.remove("on")}
  if(i>=0&&x!=null){const tx=Math.min(x+22,W-276),ty=Math.min(y+22,H-tip.offsetHeight-12);tip.style.transform=`translate(${tx}px,${ty}px)`}
}
// Magnetic controls: buttons lean towards the cursor when it comes close.
const MAGS=()=>document.querySelectorAll(".mag");
function magnet(e){if(matchMedia("(pointer:coarse)").matches||REDUCED)return;MAGS().forEach(el=>{const r=el.getBoundingClientRect();if(!r.width)return;
  const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),R=Math.max(r.width,r.height)*.85;
  el.style.translate=Math.hypot(dx,dy)<R?`${(dx*.18).toFixed(1)}px ${(dy*.18).toFixed(1)}px`:""})}

/* detail: entering a memory */
const panel=document.getElementById("panel"),pBody=document.getElementById("pBody"),ctxEl=document.getElementById("ctx");
let lastFocus=null,tab="overview",openTimer=0;
function select(i,how){
  if(!G.neurons[i])return;const first=S.sel<0;
  if(first){S.saved={t:[...cam.t],r:cam.r,th:cam.th,ph:cam.ph,sx:cam.sx,sy:cam.sy};lastFocus=document.activeElement}
  if(how==="trail")S.trail=S.trail.slice(0,S.trail.indexOf(i)+1);else if(how==="rel")S.trail.push(i);else S.trail=[i];
  if(S.trail.length>6)S.trail=S.trail.slice(-6);
  S.sel=i;setHover(-1);closeDrawer();tab="overview";introCam=false;
  S.rel=[...G.adj[i]].filter(j=>visible[j]).sort((a,b)=>G.neurons[b].size-G.neurons[a].size);S.relIdx=-1;
  const ph=phone();
  flyTo({t:tpos(i),r:ph?19:15,ph:1.36,sx:ph?0:-Math.min(440,W)/2+40,sy:ph?-H*.3:0},first?1.8:1.6);
  propagate(i,{depth:2});renderCtx();
  if(first){document.body.classList.add("detail");ctxEl.hidden=false;clearTimeout(openTimer);openTimer=setTimeout(()=>openPanel(i),REDUCED?0:340)}
  else renderPanel(true);
  hideHint();
}
function panelOrigin(i){const r=panel.getBoundingClientRect();panel.style.setProperty("--ox",`${Math.round((screen[i*4]||r.left)-r.left)}px`);panel.style.setProperty("--oy",`${Math.round((screen[i*4+1]||r.top)-r.top)}px`)}
function openPanel(i){if(S.sel!==i)return;renderPanel(true);panelOrigin(i);panel.classList.add("open");panel.setAttribute("aria-hidden","false");
  setTimeout(()=>document.getElementById("pClose").focus({preventScroll:true}),80)}
// Closing: the panel folds back into its neuron as particles, and the network reconnects.
function closePanel(){if(S.sel<0)return;const i=S.sel;clearTimeout(openTimer);
  if(panel.classList.contains("open")){const r=panel.getBoundingClientRect();panelOrigin(i);if(!REDUCED)collapseInto(r,i)}
  S.sel=-1;S.trail=[];panel.classList.remove("open");panel.setAttribute("aria-hidden","true");document.body.classList.remove("detail");ctxEl.hidden=true;
  setTimeout(()=>propagate(i,{depth:1}),REDUCED?0:700);
  const s=S.saved||home();flyTo({t:s.t,r:s.r,th:s.th,ph:s.ph,sx:s.sx,sy:s.sy},1.4);S.saved=null;
  if(lastFocus&&lastFocus.focus&&document.contains(lastFocus))lastFocus.focus({preventScroll:true})}
// Neuron to neuron: a signal runs the connection, the camera follows it, then the panel turns to the next memory.
function travel(to,how="rel"){const from=S.sel;if(from<0||from===to)return select(to,how);const e=edgeOf(from,to);
  if(e>=0)spawnSignal(e,G.edges[e][0]===from?1:-1,{sp:1.25,br:1.8,size:8,col:[.9,.98,1]});
  flyTo({t:tpos(to)},1.1);pBody.classList.add("leaving");setTimeout(()=>{pBody.classList.remove("leaving");select(to,how)},REDUCED?0:420)}
document.getElementById("pClose").addEventListener("click",closePanel);
document.getElementById("back").addEventListener("click",closePanel);
function renderCtx(){const n=S.rel.length;ctxEl.querySelector("span").textContent=n?`${S.relIdx<0?"—":S.relIdx+1} / ${n} related`:"No links";
  ctxEl.querySelectorAll("button").forEach(b=>b.disabled=!n)}
ctxEl.addEventListener("click",e=>{const b=e.target.closest("button[data-d]");if(!b||!S.rel.length)return;const n=S.rel.length;const idx=((S.relIdx<0?(+b.dataset.d>0?-1:0):S.relIdx)+ +b.dataset.d+n)%n;
  const rel=S.rel,to=rel[idx];travel(to,"rel");setTimeout(()=>{S.rel=rel;S.relIdx=idx;renderCtx()},REDUCED?0:450)});
function renderPanel(anim){
  const n=G.neurons[S.sel];if(!n)return;
  const rel=[...G.adj[n.idx]].filter(j=>visible[j]).map(j=>G.neurons[j]).sort((a,b)=>b.size-a.size);
  const list=items=>`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
  const convs=[...n.conversations].sort((a,b)=>(parseDate(b.date)||0)-(parseDate(a.date)||0));
  const trail=S.trail.length>1?`<nav class="trail rv" style="--i:0" aria-label="Your path">${S.trail.map((t,k)=>k===S.trail.length-1?`<span class="cur">${esc(G.neurons[t].title)}</span>`:`<button data-trail="${t}">${esc(G.neurons[t].title)}</button><span aria-hidden="true">→</span>`).join("")}</nav>`:"";
  const col=REGIONS[n.region].color,cat=[...n.domains.map(d=>DOMAINS[d].label),TYPE_LABEL[n.type]].join(" · ");
  const tabs=[["overview","Overview",0],["learnings","Learned",n.learned.length],["creations","Created",n.created.length],["conversations","Conversations",convs.length]];
  const none=msg=>`<p class="sparse">${msg}</p>`;let body="";
  if(tab==="overview"){const ins=n.insights;
    body=`${ins.length?`<section class="sec ins rv" style="--i:5"><h4 class="mono">Key insights</h4>${list(ins.slice(0,5))}</section>`:""}
    ${!ins.length&&!n.learned.length&&!n.created.length?`<div class="rv" style="--i:5">${none("Insights for this neuron haven’t been recorded yet. They fill in as more conversations are imported.")}</div>`:""}
    <dl class="times rv" style="--i:6"><div><dt class="mono">Started</dt><dd>${fmtMonth(n.createdAt)}</dd></div><div><dt class="mono">Last explored</dt><dd>${fmtMonth(n.updatedAt)}</dd></div><div><dt class="mono">Links</dt><dd>${String(n.degree).padStart(2,"0")}</dd></div></dl>
    ${rel.length?`<section class="sec rv" style="--i:7"><h4 class="mono">Related knowledge</h4><div class="orbs">${rel.map(m=>`<button data-rel="${m.idx}" style="--c:${REGIONS[m.region].color}"><span class="o"></span>${esc(m.title)}</button>`).join("")}</div></section>`:""}`}
  else if(tab==="learnings")body=`<div class="rv" style="--i:5">${n.learned.length?`<section class="sec">${list(n.learned)}</section>`:none("No learnings recorded for this neuron yet.")}</div>`;
  else if(tab==="creations")body=`<div class="rv" style="--i:5">${n.created.length?`<section class="sec">${list(n.created)}</section>`:none("Nothing recorded as created from this neuron yet.")}${n.skills.length?`<section class="sec"><h4 class="mono">Skills involved</h4><div class="skills">${n.skills.map(s=>`<span>${esc(s)}</span>`).join("")}</div></section>`:""}</div>`;
  else body=convs.length?`<div class="convs rv" style="--i:5">${convs.map(c=>`<div class="conv"><span class="cd mono">${c.date?fmtDate(parseDate(c.date),c.approx):"Date not recorded"}</span><span class="ct">${esc(c.title)}</span>${c.summary?`<span class="cs">${esc(c.summary)}</span>`:""}</div>`).join("")}</div>`:none("No conversations are linked to this neuron yet. They appear once your Claude history is imported.");
  pBody.innerHTML=`${trail}
  <div class="p-head">
    <span class="chip mono rv" style="--c:${col};--i:1"><span class="dot" style="--c:${col}"></span>${TYPE_LABEL[n.type]}<em>${LAYERS[n.layer][1]} layer</em></span>
    <h2 class="p-title rv" style="--i:2" id="pTitle">${esc(n.title)}</h2>
    <div class="p-cat rv" style="--i:2">${esc(cat)}</div>
    <div class="p-status rv" style="--i:3"><span class="st mono ${esc(n.status)}"><i></i>${STATUS_LABEL[n.status]||esc(n.status)}</span><span class="p-date mono">${fmtMonth(n.updatedAt)}</span>
      ${n.visibility==="private"?`<span class="priv mono"><svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.3"/></svg>Private</span>`:""}</div>
  </div>
  ${n.description?`<p class="p-desc rv" style="--i:3">${esc(n.description)}</p>`:""}
  <div class="tabs rv" style="--i:4" role="tablist">${tabs.map(([k,l,c])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${l}${c?`<sup>${c}</sup>`:""}</button>`).join("")}</div>
  <div class="tabpanel" role="tabpanel">${body}</div>`;
  pBody.classList.remove("anim");if(anim){void pBody.offsetWidth;pBody.classList.add("anim")}
  panel.setAttribute("aria-labelledby","pTitle");
}
pBody.addEventListener("click",e=>{const r=e.target.closest("[data-rel]");if(r)return travel(+r.dataset.rel,"rel");const t=e.target.closest("[data-trail]");if(t)return travel(+t.dataset.trail,"trail");
  const tb=e.target.closest("[data-tab]");if(tb){tab=tb.dataset.tab;renderPanel(false);const b=pBody.querySelector(`[data-tab="${tab}"]`);b&&b.focus()}});
pBody.addEventListener("pointerover",e=>{const r=e.target.closest("[data-rel]");S.hover=r?+r.dataset.rel:-1});
pBody.addEventListener("pointerleave",()=>{S.hover=-1});

function frameSet(set){const ps=[...set].map(tpos);if(!ps.length)return;const c=[0,0,0];ps.forEach(p=>{c[0]+=p[0];c[1]+=p[1];c[2]+=p[2]});c.forEach((v,i)=>c[i]=v/ps.length);
  const spread=Math.max(...ps.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2])),1);flyTo({t:c,r:Math.max(14,Math.min(home().r,spread*2.4+10)),sx:0,sy:0},1.4)}
function clearFocus(){S.focus=null;S.insight=-1}
function setRegion(k){S.region=k;applyFilters();renderNav();
  if(S.state==="engine"){refreshEngine();startMorph("engine",1.8)}
  if(k==="all")goHome(1.4);else{const set=G.neurons.filter(n=>n.region===k&&visible[n.idx]).map(n=>n.idx);if(set.length)frameSet(set)}
  if(q.value.trim()){hits=search(q.value);renderResults()}renderDrawer()}
function refreshEngine(){SC.st.focus=S.region!=="all"?S.region:SC.st.top;computeState(SC,"engine");if(G.neurons.length)NLAY.engine=neuronLayout("engine",G,SC.st)}
function setState(k){if(k===S.state||!SKEYS.includes(k))return;if(S.sel>=0)closePanel();clearFocus();
  S.state=k;store("state",k);if(k==="engine")refreshEngine();startMorph(k,REDUCED?0:2.4);goHome(2.3);renderStates();document.body.dataset.state=k;lastInteract=performance.now()}

/* search: finding a memory */
const q=document.getElementById("q"),results=document.getElementById("results");let hits=[],hi=0,searchTimer=null;
function search(str){str=str.trim().toLowerCase();if(!str)return[];const terms=str.split(/\s+/),out=[];
  G.neurons.forEach(n=>{if(!visible[n.idx])return;let score=0,via="";const t=n.title.toLowerCase();
    if(t===str)score+=10;else if(t.startsWith(str))score+=7;else if(t.includes(str))score+=5;
    if(REGIONS[n.region].label.toLowerCase().startsWith(str))score+=2;
    if(!score){const sk=n.skills.find(s=>terms.every(w=>s.toLowerCase().includes(w)));if(sk){score+=3;via="Skill · "+sk}
      const cv=!sk&&n.conversations.find(c=>terms.every(w=>(c.title+" "+c.summary).toLowerCase().includes(w)));if(cv){score+=2;via="Conversation · "+cv.title}
      if(!sk&&!cv){const blob=[n.description,...n.learned,...n.created,...n.insights].join(" ").toLowerCase();if(terms.every(w=>blob.includes(w))){score+=1.5;via="Mentioned in notes"}}}
    if(score)out.push({n,score:score+n.size*.01,via})});return out.sort((a,b)=>b.score-a.score)}
function renderResults(){const str=q.value.trim();document.body.classList.toggle("searching",!!str);if(!str){results.hidden=true;q.setAttribute("aria-expanded","false");return}
  results.hidden=false;q.setAttribute("aria-expanded","true");
  if(!hits.length){results.innerHTML=`<div class="r-empty">Nothing in the brain matches “${esc(str)}” yet. Try a project, a skill or a region like AI.</div>`;return}
  const set=new Set(hits.map(h=>h.n.idx)),rel=new Set();set.forEach(i=>G.adj[i].forEach(j=>{if(!set.has(j)&&visible[j])rel.add(j)}));
  const proj=hits.filter(h=>h.n.type==="project"||h.n.type==="experiment").length,pl=(n,s,p)=>n+" "+(n===1?s:p);
  results.innerHTML=`<div class="r-sum mono"><span>${pl(hits.length,"memory","memories")}</span><span>${pl(proj,"project","projects")}</span><span>${pl(rel.size,"related","related")}</span></div>`+
    hits.slice(0,7).map((h,k)=>`<button role="option" id="opt${k}" aria-selected="${k===hi}" data-i="${h.n.idx}"><span class="dot" style="--c:${REGIONS[h.n.region].color}"></span><span style="min-width:0"><span class="r-title">${esc(h.n.title)}</span>${h.via?`<span class="r-via">${esc(h.via)}</span>`:""}</span><span class="r-type mono">${TYPE_LABEL[h.n.type]}</span></button>`).join("")+
    (hits.length>7?`<div class="r-empty mono" style="font-size:9.5px;padding:8px 10px">${hits.length-7} more lit up in the brain</div>`:"");
  q.setAttribute("aria-activedescendant","opt"+hi)}
// The brain dims, a signal runs out from the strongest match, and each match lights as the wave reaches it.
function searchWave(set){const top=hits[0]&&hits[0].n.idx;if(top==null)return;const{h,par}=bfs(top,6),hh=new Map();set.forEach(i=>hh.set(i,h.has(i)?h.get(i):3));
  prop={t0:performance.now(),h:hh,gate:true};
  par.forEach((p,j)=>{if(!set.has(j)&&!set.has(p))return;const e=edgeOf(p,j);spawnSignal(e,G.edges[e][0]===p?1:-1,{sp:1,br:1.3,size:5.5,delay:h.get(p)*.26,col:[.8,.96,1]})})}
q.addEventListener("input",()=>{if(!G)return;hits=search(q.value);hi=0;renderResults();if(S.sel>=0&&q.value.trim())closePanel();clearTimeout(searchTimer);
  if(!q.value.trim()){clearFocus();return}S.focus=hits.length?new Set(hits.map(h=>h.n.idx)):null;S.insight=-1;const f=S.focus;searchTimer=setTimeout(()=>{if(f&&S.focus===f){frameSet(f);searchWave(f)}},380);hideHint()});
q.addEventListener("keydown",e=>{if(e.key==="ArrowDown"){e.preventDefault();hi=Math.min(hi+1,Math.min(hits.length,7)-1);renderResults()}
  else if(e.key==="ArrowUp"){e.preventDefault();hi=Math.max(hi-1,0);renderResults()}else if(e.key==="Enter"&&hits[hi]){e.preventDefault();openHit(hits[hi].n.idx)}
  else if(e.key==="Escape"){q.value="";hits=[];renderResults();clearFocus();q.blur()}});
results.addEventListener("click",e=>{const b=e.target.closest("button[data-i]");if(b)openHit(+b.dataset.i)});
results.addEventListener("pointerover",e=>{const b=e.target.closest("button[data-i]");S.hover=b?+b.dataset.i:-1});
results.addEventListener("pointerleave",()=>{S.hover=-1});
function openHit(i){results.hidden=true;q.setAttribute("aria-expanded","false");S.focus=null;select(i)}
document.addEventListener("click",e=>{if(!e.target.closest(".search"))results.hidden=true});
q.addEventListener("focus",()=>{if(q.value.trim())renderResults()});

/* filters */
const nav=document.getElementById("nav");
function renderNav(){const c={};G.neurons.forEach((n,i)=>{if(S.view==="private"||n.visibility!=="private")c[n.region]=(c[n.region]||0)+1});
  nav.innerHTML=[["all","All"],...RKEYS.map(k=>[k,REGIONS[k].label])].map(([k,l])=>`<button class="mag" data-r="${k}" aria-pressed="${S.region===k}" style="--c:${k==="all"?"#dfe7f2":REGIONS[k].color}"><i></i>${l}<span>${k==="all"?"":String(c[k]||0).padStart(2,"0")}</span></button>`).join("")}
nav.addEventListener("click",e=>{const b=e.target.closest("[data-r]");if(b){if(S.sel>=0)closePanel();clearFocus();setRegion(b.dataset.r)}});

/* states */
const statesEl=document.getElementById("states");
function renderStates(){statesEl.innerHTML=STATES.map(s=>`<button class="mag" role="radio" data-s="${s.k}" aria-checked="${S.state===s.k}" title="${s.label} · ${s.n.slice(1)}"><span class="n mono">${s.n}</span><span class="l">${s.label}</span><span class="sl">${s.short}</span></button>`).join("");document.body.dataset.state=S.state}
statesEl.addEventListener("click",e=>{const b=e.target.closest("[data-s]");if(b)setState(b.dataset.s)});

/* time: the brain as it stood on any day */
const tl=document.getElementById("tl"),tlOut=document.getElementById("tlOut"),tlTicks=document.getElementById("tlTicks"),timelineEl=document.getElementById("timeline");let tlFirst=null;
function renderTimeline(){const ds=G.neurons.map(n=>n.createdAt).filter(Boolean);tlFirst=ds.length?Math.min(...ds):null;timelineEl.classList.toggle("off",!tlFirst);
  if(!tlFirst){tlTicks.innerHTML="";return}const span=Math.max(DAY,NOW-tlFirst),seen=new Set();
  tlTicks.innerHTML=ds.map(t=>Math.round((t-tlFirst)/span*100)).filter(p=>!seen.has(p)&&seen.add(p)).map(p=>`<i style="left:${p}%"></i>`).join("")+
    `<span class="mono" style="left:0">${fmtMonth(tlFirst)}</span><span class="mono" style="right:0">Now</span>`;
  tl.value=S.asOf==null?1000:Math.round((S.asOf-tlFirst)/span*1000);updateTlOut()}
function updateTlOut(){tlOut.textContent=S.asOf==null?"All time":`As of ${fmtDate(S.asOf)}`;tl.style.setProperty("--p",tl.value/10+"%")}
tl.addEventListener("input",()=>{if(!tlFirst)return;const v=+tl.value;S.asOf=v>=1000?null:tlFirst+(NOW-tlFirst)*v/1000;applyFilters();updateTlOut();renderNav();renderDrawer();if(q.value.trim()){hits=search(q.value);renderResults()}});

/* view toggle */
const btnView=document.getElementById("btnView");
function renderView(){btnView.innerHTML=S.view==="private"?`<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.3"/></svg><span class="lbl">Private</span>`:`<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.8" stroke="currentColor" stroke-width="1.3"/><path d="M2.2 8h11.6M8 2.2c1.8 2 1.8 9.6 0 11.6M8 2.2c-1.8 2-1.8 9.6 0 11.6" stroke="currentColor" stroke-width="1.1"/></svg><span class="lbl">Public</span>`;
  btnView.setAttribute("aria-label",S.view==="private"?"Private view: showing everything. Switch to public view":"Public view: client and personal work hidden. Switch to private view")}
btnView.addEventListener("click",()=>{S.view=S.view==="private"?"public":"private";renderView();applyFilters();renderNav();renderDrawer();if(q.value.trim()){hits=search(q.value);renderResults()}store("view",S.view)});

/* zoom */
document.getElementById("zin").addEventListener("click",()=>{introCam=false;flyTo({r:clampR(cam.r*.66)},.9)});
document.getElementById("zout").addEventListener("click",()=>{introCam=false;if(S.sel>=0)return closePanel();flyTo({r:clampR(cam.r*1.5)},.9)});

/* metadata — real counts, never the reference board's numbers */
function renderMetrics(){const vis=G.neurons.filter(n=>visible[n.idx]),ids=new Set(vis.map(n=>n.idx));const f=v=>v.toLocaleString("en-IN");
  document.getElementById("metrics").innerHTML=[[vis.length,"Knowledge nodes"],[vis.filter(n=>n.type==="project"||n.type==="experiment").length,"Projects & experiments"],[vis.filter(n=>n.type==="skill").length,"Skills"],[G.edges.filter(([a,b])=>ids.has(a)&&ids.has(b)).length,"Connections"]].map(([v,l])=>`<div><dd>${f(v)}</dd><dt class="mono">${l}</dt></div>`).join("")}
const roWrap=document.getElementById("readouts");let RO=[];const roEls=()=>[...roWrap.querySelectorAll(".ro")];
function renderReadouts(){const vis=G.neurons.filter(n=>visible[n.idx]);if(!vis.length){roWrap.innerHTML="";RO=[];return}
  const recent=vis.filter(n=>n.updatedAt).sort((a,b)=>b.updatedAt-a.updatedAt)[0],hub=[...vis].sort((a,b)=>b.degree-a.degree)[0];
  const pr={};G.edges.forEach(([a,b])=>{if(!visible[a]||!visible[b])return;const A=G.neurons[a],B=G.neurons[b];if(A.region===B.region)return;if(NOW-Math.max(A.updatedAt||0,B.updatedAt||0)>30*DAY)return;const k=[A.region,B.region].sort().join("|");pr[k]=(pr[k]||0)+1});
  const em=Object.entries(pr).sort((a,b)=>b[1]-a[1])[0];
  RO=[recent&&{k:"Recently explored",v:recent.title,i:recent.idx},hub&&{k:"Most connected",v:hub.title,i:hub.idx},em&&{k:"Emerging",v:em[0].split("|").map(r=>REGIONS[r].label).join(" × "),pair:em[0].split("|")}].filter(Boolean);
  roWrap.innerHTML=RO.map((x,k)=>`<button class="ro" data-k="${k}"><span class="mono">${x.k}</span><b>${esc(x.v)}</b></button>`).join("")}
roWrap.addEventListener("click",e=>{const b=e.target.closest(".ro");if(!b)return;const x=RO[+b.dataset.k];if(!x)return;if(x.i!=null)return select(x.i);
  const set=new Set(G.neurons.filter(n=>visible[n.idx]&&x.pair.includes(n.region)).map(n=>n.idx));S.focus=set;frameSet(set);const first=[...set][0];if(first!=null)propagate(first,{depth:3})});

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
  const lines=G.edges.filter(([a,b])=>set.has(a)&&set.has(b)).map(([a,b])=>{const A=G.neurons[a],B=G.neurons[b];return`<line x1="${sx(A.pos[0]).toFixed(1)}" y1="${sy(-A.pos[1]).toFixed(1)}" x2="${sx(B.pos[0]).toFixed(1)}" y2="${sy(-B.pos[1]).toFixed(1)}" stroke="${REGIONS[A.region].color}" stroke-opacity=".4" stroke-width=".6"/>`}).join("");
  const dots=ns.map((n,k)=>`<circle cx="${sx(n.pos[0]).toFixed(1)}" cy="${sy(-n.pos[1]).toFixed(1)}" r="${k===0&&x.viz==="hub"?3.4:2}" fill="${REGIONS[n.region].color}"/>`).join("");
  return`<svg viewBox="0 0 200 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${lines}${dots}</svg>`}
function renderDrawer(){if(!G||!G.neurons.length)return;INS=computeInsights();
  drawer.innerHTML=`<header><h2 class="mono">Insights</h2><span class="mono">${INS.length} patterns</span></header><p class="sub">Read from the shape of the graph as it stands. Choosing one sends light through the neurons behind it.</p>`+
    (INS.length?`<div class="ins-grid">${INS.map((x,k)=>`<button class="ins-card" data-k="${k}" aria-pressed="${S.insight===k}"><span class="mono">${x.k}</span><h3>${esc(x.t)}</h3>${miniViz(x)}<p>${esc(x.c)}</p></button>`).join("")}</div>`:`<p class="sub">Not enough neurons in view to see patterns yet.</p>`)}
function closeDrawer(){drawer.hidden=true;btnIns.setAttribute("aria-pressed","false")}
btnIns.addEventListener("click",()=>{if(drawer.hidden){renderDrawer();drawer.hidden=false;btnIns.setAttribute("aria-pressed","true")}else closeDrawer()});
drawer.addEventListener("click",e=>{const c=e.target.closest(".ins-card");if(!c)return;const k=+c.dataset.k;if(S.insight===k){clearFocus();renderDrawer();return}
  if(S.sel>=0)closePanel();S.insight=k;S.focus=new Set(INS[k].set.filter(i=>visible[i]));frameSet(S.focus);propagate(INS[k].set[0],{depth:3});renderDrawer()});

document.getElementById("orb").addEventListener("click",()=>{if(S.sel>=0)closePanel();clearFocus();q.value="";hits=[];renderResults();closeDrawer();if(S.region!=="all")setRegion("all");else goHome(1.4)});
document.getElementById("btnTime").addEventListener("click",()=>document.body.classList.toggle("tl-open"));
document.addEventListener("keydown",e=>{skipIntro();const typing=e.target.closest&&e.target.closest("input,textarea");
  if(e.key==="/"&&!typing){e.preventDefault();q.focus()}
  else if(!typing&&/^[1-5]$/.test(e.key)&&scrim.hidden)setState(SKEYS[+e.key-1]);
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
document.getElementById("emptySeed").addEventListener("click",()=>{dropS("data");load(SEED);setBanner(null)});
document.getElementById("restoreSeed").addEventListener("click",()=>{if(ownBrain())backToOwn();else{dropS("data");load(SEED);setBanner(null)}closeImport()});
document.getElementById("showEmpty").addEventListener("click",()=>{load({neurons:[]});closeImport()});
document.getElementById("stress").addEventListener("click",()=>{load(synthetic(3000));setBanner("Synthetic performance test · 3,000 neurons","Back to my brain",()=>{if(ownBrain())backToOwn();else{load(localBrain()||SEED);setBanner(null)}});closeImport()});
document.getElementById("copyJson").addEventListener("click",()=>{const txt=JSON.stringify(exportData(G),null,2);
  const fb2=()=>{document.getElementById("copyArea").innerHTML=`<textarea class="copy" id="copyTa" readonly aria-label="Brain data as JSON"></textarea>`;const ta=document.getElementById("copyTa");ta.value=txt;ta.focus();ta.select();impMsg.className="msg";impMsg.textContent="Copying isn’t available here. The JSON is selected below, ready to copy."};
  try{navigator.clipboard.writeText(txt).then(()=>{impMsg.className="msg";impMsg.textContent=`Copied ${G.neurons.length} neurons as JSON.`},fb2)}catch(e){fb2()}});
const fileIn=document.getElementById("file"),dropEl=document.getElementById("drop");
fileIn.addEventListener("change",()=>{if(fileIn.files[0])readFile(fileIn.files[0]);fileIn.value=""});
["dragenter","dragover"].forEach(t=>addEventListener(t,e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes("Files")){e.preventDefault();dropEl.classList.add("over")}}));
["dragleave","drop"].forEach(t=>addEventListener(t,()=>dropEl.classList.remove("over")));
addEventListener("drop",e=>{if(!e.dataTransfer||!e.dataTransfer.files.length)return;e.preventDefault();if(scrim.hidden)openImport();readFile(e.dataTransfer.files[0])});
// Where an import lands: the account's Brain when signed in, otherwise this browser.
const IMPORT_UI={msg:impMsg,close:closeImport};
function readFile(f,ui=IMPORT_UI){const r=new FileReader();r.onload=()=>{try{const data=JSON.parse(r.result);
    if(Importer.exportKind(data)||(Array.isArray(data)&&data[0]&&"mapping" in data[0])){importExport(data,ui);return}
    const t=normalize(data);if(!t.neurons.length)throw new Error("The file has no neurons in it.");
    const list=Array.isArray(data)?data:data.neurons;
    if(ownBrain()){commitBrain({neurons:Importer.merge(APP.base,list,{conv:CONV}).neurons},"import",`Read ${t.neurons.length} neurons and ${t.edges.length} connections.`,ui);return}
    load(data);store("data",JSON.stringify(data));localBanner();ui.msg.className="msg";ui.msg.textContent=`Imported ${t.neurons.length} neurons and ${t.edges.length} connections.`;setTimeout(ui.close,900);
  }catch(err){ui.msg.className="msg err";ui.msg.textContent=err instanceof SyntaxError?"That file isn’t valid JSON. Check it opens in a JSON viewer, then try again.":err.message}};
  r.onerror=()=>{ui.msg.className="msg err";ui.msg.textContent="The file couldn’t be read. Try choosing it again."};r.readAsText(f)}
// A raw Claude or ChatGPT export is grouped into knowledge right here, in the browser. Full
// conversations never leave it; only the knowledge they form is saved.
function importExport(data,ui=IMPORT_UI){
  const provider=Importer.exportKind(data)||"import";
  ui.msg.className="msg";ui.msg.textContent="Grouping your conversations into knowledge…";
  setTimeout(()=>{try{const {brain,stats}=Importer.fromExport(data,{base:importBase(),conv:CONV});
    commitBrain(brain,provider,`Grouped ${stats.conversations.toLocaleString("en-IN")} conversations into ${stats.topics} topics: ${stats.added} new ${stats.added===1?"neuron":"neurons"}, ${stats.updated} merged into existing ones. New neurons are private.`,ui)}
    catch(err){ui.msg.className="msg err";ui.msg.textContent=err.message}},40)}
async function commitBrain(brain,provider,doneText,ui){
  if(ownBrain()){
    const changed=Cloud.changedNeurons(APP.base,brain.neurons.map(n=>Importer.expand(n,CONV)));
    if(!changed.length){ui.msg.className="msg";ui.msg.textContent=`${doneText} Nothing new to save.`;return}
    ui.msg.className="msg";ui.msg.textContent=`Saving ${changed.length} ${changed.length===1?"change":"changes"} to your Brain…`;
    try{const r=await Cloud.sync(provider,changed,(d,t)=>{ui.msg.textContent=`Saving to your Brain · ${d} of ${t}`});
      await refreshBrain();ui.msg.textContent=`${doneText} Saved ${r.created} new and ${r.updated} updated.`;setTimeout(ui.close,2600)}
    catch(e){ui.msg.className="msg err";ui.msg.textContent=e.status===401?"Your session has ended. Sign in again, then import once more.":"We couldn’t save this import. Your existing knowledge is safe. Try again in a moment.";if(e.status===401)setTimeout(()=>enterGuest("expired","regrow"),1800)}
    return}
  load(brain);const kept=store("data",JSON.stringify(brain));localBanner();
  ui.msg.className="msg";ui.msg.textContent=doneText+(kept?"":" It’s too large to keep in this browser, so it resets on reload. Use npm run import for a brain.json you can reopen.");
  if(kept)setTimeout(ui.close,2400)}
document.getElementById("schema").textContent=JSON.stringify({neurons:[{id:"neuron-001",title:"AI Design Workflow",category:"AI / Design",type:"project | skill | foundation | experiment | research | idea",status:"built | in-progress | exploring | experimenting | learned | paused | archived",visibility:"public | private",weight:"1–5",createdAt:"2026-03-12",updatedAt:"2026-09-20",description:"…",learned:["…"],created:["…"],insights:["…"],skills:["AI","UX Design"],conversations:[{title:"…",date:"2026-09-20",summary:"…"}],connections:["neuron-002","neuron-017"]}]},null,2);
function synthetic(N){const r=rng(99),neurons=[],ds=["design","ai","product","dev"];
  for(let i=0;i<N;i++){const t=TYPES[Math.min(5,(Math.pow(r(),.8)*6)|0)];neurons.push({id:"syn-"+i,title:"Synthetic "+String(i+1).padStart(4,"0"),domains:[ds[(r()*4)|0]],type:t,status:t==="idea"?"idea":"exploring",weight:1+((r()*r()*5)|0),description:"Synthetic neuron for performance testing.",synthetic:true,connections:[],conversations:[{title:"Synthetic conversation",date:iso(NOW-r()*300*DAY),summary:""}]})}
  const byR={};neurons.forEach((n,i)=>{const k=regionOf({type:n.type,domains:n.domains});(byR[k]=byR[k]||[]).push(i)});
  neurons.forEach((n,i)=>{const pool=byR[regionOf({type:n.type,domains:n.domains})];for(let k=0;k<2;k++){const j=r()<.85?pool[(r()*pool.length)|0]:(r()*N)|0;if(j!==i)n.connections.push("syn-"+j)}});return{neurons}}

function setBanner(text,btn,fn){if(!text){banner.hidden=true;banner.innerHTML="";return}
  banner.hidden=false;banner.innerHTML=`<span>${esc(text)}</span>${btn?`<button class="vbtn" id="bAct">${esc(btn)}</button>`:""}`;if(btn)document.getElementById("bAct").onclick=fn}
function localBanner(){if(APP.mode==="guest")setBanner("This brain lives in this browser","Save it to an account",()=>openAuth());
  else setBanner("Showing imported data","Back to seed brain",()=>{dropS("data");load(SEED);setBanner(null)})}

// how: "boot" plays the whole intro; "forming" grows the structure while data loads;
// "continue" carries on from forming; anything else regrows the knowledge in place.
function load(data,how="regrow"){
  try{G=normalize(data)}catch(e){G=normalize(SEED)}
  if(S.sel>=0){S.sel=-1;panel.classList.remove("open");document.body.classList.remove("detail");ctxEl.hidden=true}
  S.hover=-1;S.focus=null;S.insight=-1;S.trail=[];S.region="all";S.asOf=null;sig.list=[];prop=null;fxParts=[];
  const empty=!G.neurons.length;emptyEl.hidden=!empty||APP.mode!=="local"||how==="forming";document.body.classList.toggle("is-empty",empty);
  SC=buildScaffold(G);buildScaffoldGPU();NLAY={};if(!empty)SKEYS.forEach(s=>NLAY[s]=neuronLayout(s,G,SC.st));
  buildGPU();NB=NLAY[S.state]||new Float32Array(0);NA=NB;SCB={lines:SC.lines[S.state],pts:SC.pts[S.state]};SCA=SCB;MO.k=1;uploadMorph();computeCentroids();
  mote.line.fill(0);
  if(!empty)buildRegionLabels();else{Object.values(rlEls).forEach(e=>e.remove());rlEls={};nlEls.forEach(e=>{e.style.opacity=0;e.dataset.i=-1})}
  applyFilters();renderNav();renderTimeline();renderDrawer();renderView();renderStates();closeDrawer();measureSafe();
  const now=performance.now();
  if(how==="forming"){introCap=.42;introFrom=0;introStart=now;introRate=1/5200;introCam=!REDUCED;uiShown=false;if(!REDUCED)document.body.classList.add("intro");return}
  introCap=empty?.42:1;
  if(how==="boot"){introFrom=0;introStart=now;introRate=1/5200;introCam=!REDUCED}
  else if(how==="continue"){introFrom=introAt(now);introStart=now;introRate=1/3600}
  else{introFrom=empty?.12:Math.min(introAt(now),.5);introStart=now;introRate=1/3400;introCam=false;goHome(1.2)}
  if(empty){uiShown=true;introCam=false;goHome(how==="boot"?0:1.2);document.body.classList.remove("intro")}
}
let rz=0;addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(G){measureSafe();if(S.sel<0&&!S.focus&&S.region==="all"&&!introCam)goHome(.6)}},150)});

/* =========================================================================
   APP — accounts, loading, landing, welcome, connected AI and the account sheet.
   Only the hosted build turns this on (<meta name="brain-mode" content="app">). The claude.ai
   artifact, and any deployment without Supabase configured, run in this browser as before.
   ========================================================================= */
const MODE=(document.querySelector('meta[name="brain-mode"]')||{}).content==="app"?"app":"local";
const APP={mode:"local",user:null,brain:null,profile:null,base:[],sources:[],history:[],demo:false,retry:null};
const $=id=>document.getElementById(id);
const tick=ms=>new Promise(r=>setTimeout(r,ms));
const ownBrain=()=>APP.mode==="user"&&!APP.demo;
function importBase(){if(ownBrain())return APP.base;const l=localBrain();return l?l.neurons:SEED.neurons}
function localBrain(){const s=readS("data");if(!s)return null;try{const b=JSON.parse(s);const l=Array.isArray(b)?b:b&&b.neurons;return Array.isArray(l)&&l.length?{neurons:l}:null}catch(e){return null}}
const STAGES=["loading","landing","auth","welcome","connect","errorState"];
function stage(id){STAGES.forEach(s=>{$(s).hidden=s!==id});document.body.classList.toggle("staged",!!id);
  if(id&&id!=="loading"){const f=$(id).querySelector("a[href],button:not([hidden]):not(.x),input");setTimeout(()=>f&&f.focus({preventScroll:true}),80)}}
const STEP_N={identity:0,knowledge:1,relationships:2,nodes:3,ready:4};
function step(s){const k=STEP_N[s];$("steps").querySelectorAll("li").forEach((li,i)=>{li.className=i<k?"done":i===k?"on":""})}
const ERRORS={
  load:["Your Brain couldn’t be loaded.","Your existing knowledge is safe. Try again in a moment.","Try again"],
  unavailable:["Your Brain is temporarily unavailable.","Your existing knowledge is safe. Try again in a moment.","Try again"],
  auth:["We couldn’t authenticate your account.","Nothing was changed. Try signing in again.","Sign in again"],
  offline:["We couldn’t reach your Brain.","Check your connection, then try again. Your existing knowledge is safe.","Try again"]};
function showError(kind,retry){const[t,b,btn]=ERRORS[kind]||ERRORS.load;$("errTitle").textContent=t;$("errBody").textContent=b;$("errRetry").textContent=btn;APP.retry=retry||bootApp;stage("errorState")}
$("errRetry").addEventListener("click",()=>{const f=APP.retry;stage("loading");f&&f()});

// The only place the page decides who it's showing to.
async function bootApp(){
  load({neurons:[]},"forming");stage("loading");step("identity");
  let cfg=null;try{cfg=await Cloud.config()}catch(e){}
  if(!cfg||!cfg.accounts){stage(null);return bootLocal("continue")}
  let s;try{s=await Cloud.session()}catch(e){return showError(e.code==="offline"?"offline":"unavailable")}
  const q=new URLSearchParams(location.search),authErr=q.get("auth_error");
  if(authErr)history.replaceState(null,"",location.pathname+location.hash);
  if(!s.user)return enterGuest(authErr?"auth-error":null,"continue");
  APP.user=s.user;openBrain("continue");
}
async function openBrain(how="regrow"){
  APP.mode="user";APP.demo=false;renderAccountBtn();stage("loading");step("knowledge");
  let payload;try{payload=await Cloud.brain()}catch(e){if(e.status===401)return enterGuest("expired",how);return showError(e.code==="offline"?"offline":e.status===503?"unavailable":"load",()=>openBrain(how))}
  adoptPayload(payload);step("relationships");await tick(280);
  step("nodes");setBanner(null);load(Cloud.toVisual(payload),how);await tick(420);
  step("ready");await tick(520);stage(null);renderAccountBtn();
  if(!APP.base.length)showWelcome();
}
function adoptPayload(p){APP.brain=p.brain;APP.profile=p.profile;APP.base=Cloud.toVisual(p).neurons;APP.sources=p.sources||[];APP.history=p.history||[]}
async function refreshBrain(){const p=await Cloud.brain();adoptPayload(p);load(Cloud.toVisual(p));setBanner(null);if(!$("account").hidden)renderAccount()}
function enterGuest(reason,how="regrow"){
  APP.mode="guest";APP.user=null;APP.demo=true;renderAccountBtn();closeAccount();
  const local=localBrain();load(local||SEED,how);
  if(local)localBanner();else setBanner(null);
  if(reason==="expired")openAuth("Your session has ended. Sign in again to open your Brain.",true);
  else if(reason==="auth-error")openAuth("We couldn’t authenticate your account. Try again.",true);
  else stage("landing");
}
function bootLocal(how){
  APP.mode="local";if(readS("view")==="public")S.view="public";
  let data=SEED;const saved=localBrain();if(saved)data=saved;
  if(location.hash==="#empty")data={neurons:[]};else if(location.hash==="#stress")data=synthetic(3000);
  load(data,how);
  if(location.hash==="#stress")setBanner(`Synthetic performance test · ${G.neurons.length.toLocaleString("en-IN")} neurons, ${G.edges.length.toLocaleString("en-IN")} connections`,"Back to my brain",()=>{load(saved||SEED);setBanner(null)});
  else if(saved&&location.hash!=="#empty")localBanner();
}

/* landing + auth */
$("landingBuild").addEventListener("click",()=>openAuth());
$("landingDemo").addEventListener("click",()=>{stage(null);if(!localBrain())setBanner("Demo brain · explore freely","Build my own",()=>openAuth())});
let authFromLanding=false;
function openAuth(message,isError){authFromLanding=!$("landing").hidden;$("authEmail").hidden=true;$("authEmailBtn").hidden=false;
  const m=$("authMsg");m.className=isError?"msg err":"msg";m.textContent=message||"";stage("auth")}
$("auth").addEventListener("click",e=>{if(e.target.closest('[data-act="close"]'))stage(authFromLanding?"landing":null)});
$("authEmailBtn").addEventListener("click",()=>{$("authEmailBtn").hidden=true;$("authEmail").hidden=false;$("authEmailIn").focus()});
$("authEmail").addEventListener("submit",async e=>{e.preventDefault();const m=$("authMsg"),email=$("authEmailIn").value.trim(),b=e.target.querySelector("button");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){m.className="msg err";m.textContent="That doesn’t look like an email address.";return}
  b.disabled=true;m.className="msg";m.textContent="Sending your link…";
  try{await Cloud.emailLink(email);m.textContent=`Check your inbox. We sent a link to ${email}. It opens your Brain.`}
  catch(err){m.className="msg err";m.textContent=err.message}finally{b.disabled=false}});

/* first visit, and the empty brain */
function showWelcome(){const first=!readS("welcomed:"+APP.user.id);store("welcomed:"+APP.user.id,"1");
  $("welcomeTitle").textContent=first?"Welcome to your Brain.":"Your Brain is empty.";
  $("welcomeSub").textContent=first?"Connect the AI tools you use and turn your conversations into a living knowledge network.":"Start connecting your AI tools and the network will begin to form.";
  const lb=localBrain(),ad=$("welcome").querySelector('[data-act="adopt"]');ad.hidden=!lb;if(lb)ad.querySelector("span").textContent=`${lb.neurons.length} neurons you built here before signing in`;
  $("welcome").querySelector('[data-act="demo"]').hidden=!first;stage("welcome")}
$("welcome").addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(!b)return;const a=b.dataset.act;
  if(a==="close")stage(null);else if(a==="connect-claude")openConnect("claude");else if(a==="connect-chatgpt")openConnect("chatgpt");
  else if(a==="import"){stage(null);openImport()}else if(a==="demo")exploreDemo();else if(a==="adopt")adoptLocal()});
function exploreDemo(){stage(null);closeAccount();APP.demo=true;load(SEED);setBanner("Exploring the demo brain","Back to my brain",backToOwn)}
function backToOwn(){APP.demo=false;load({neurons:APP.base});setBanner(null);if(!APP.base.length)showWelcome()}
// The anonymous brain built in this browser becomes the account's first knowledge.
async function adoptLocal(){const lb=localBrain();if(!lb)return;stage(null);openImport();
  await commitBrain({neurons:Importer.merge(APP.base,lb.neurons,{conv:CONV}).neurons},"import","Brought in the brain from this browser.",IMPORT_UI);
  if(APP.base.length)dropS("data")}

/* connected AI: honest about what each provider allows */
const GUIDE={
  claude:{label:"Claude",steps:["claude.ai → Settings → Privacy → Export data","Open the email link and download the zip","Unzip it and choose conversations.json"]},
  chatgpt:{label:"ChatGPT",steps:["chatgpt.com → Settings → Data controls → Export data","Open the email link and download the zip","Unzip it and choose conversations.json"]}};
function openConnect(p){const g=GUIDE[p],src=APP.sources.find(s=>s.provider===p);
  $("connect").innerHTML=`<button class="ibtn x" data-act="close" aria-label="Close"><svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button>
    <p class="mono eyebrow">Connect ${g.label}</p><h2 id="connectTitle">Bring in your ${g.label} history.</h2>
    <p class="sub">${g.label} doesn’t offer an official way for apps to read your conversations, so there’s no password to share and nothing to sign in to. Your data export is the supported route.</p>
    <ol class="how">${g.steps.map(s=>`<li>${esc(s)}</li>`).join("")}</ol>
    ${src&&src.status==="connected"?`<p class="state mono"><i></i>Imported · last import ${esc(Cloud.ago(src.last_synced_at))} · next: import a newer export</p>`:""}
    <div class="row"><label class="cta mag" for="connectFile">Choose conversations.json</label><input type="file" id="connectFile" accept=".json,application/json" class="sr"></div>
    <p class="msg" id="connectMsg" role="status" aria-live="polite"></p>
    <p class="fine">Grouped in your browser. Full conversations never leave this device; only the knowledge they form is saved to your Brain.</p>`;
  $("connectFile").addEventListener("change",e=>{const f=e.target.files[0];if(f)readFile(f,{msg:$("connectMsg"),close:()=>stage(null)})});stage("connect")}
$("connect").addEventListener("click",e=>{if(e.target.closest('[data-act="close"]'))stage(ownBrain()&&!APP.base.length?"welcome":null)});

/* account */
const btnAccount=$("btnAccount"),accountEl=$("account");
function renderAccountBtn(){btnAccount.hidden=APP.mode==="local";
  if(APP.mode==="guest"){btnAccount.className="vbtn mag acct";btnAccount.innerHTML=`<span>Sign in</span>`;btnAccount.setAttribute("aria-label","Sign in")}
  else if(APP.user){const u=APP.user;btnAccount.className="ibtn mag acct";btnAccount.setAttribute("aria-label",`Account: ${u.name}`);
    btnAccount.innerHTML=u.avatar?`<img src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">`:`<span>${esc((u.name||"?").trim().charAt(0).toUpperCase())}</span>`}}
btnAccount.addEventListener("click",()=>{if(APP.mode==="guest")return openAuth();if(accountEl.hidden){renderAccount();accountEl.hidden=false;closeDrawer()}else closeAccount()});
function closeAccount(){accountEl.hidden=true}
function renderAccount(){const u=APP.user;if(!u)return;const n=APP.base.length,e=APP.base.reduce((s,x)=>s+(x.connections||[]).length,0)/2;
  const row=p=>{const src=APP.sources.find(s=>s.provider===p),on=src&&src.status==="connected",label=p==="import"?"Import":GUIDE[p].label;
    return`<div class="src"><div><b>${label}</b><span class="mono">${on?`Imported · ${esc(Cloud.ago(src.last_synced_at))}`:src&&src.status==="error"?"Last import failed":"Not connected"}</span>${on&&p!=="import"?`<span class="mono next">Next sync · when you import a newer export</span>`:""}</div>
      <div class="acts">${p==="import"?`<button data-act="import">Import data</button>`:`<button data-act="connect-${p}">${on?"Import newer":"Connect"}</button>`}${on?`<button data-act="disconnect-${p}">Disconnect</button>`:""}</div></div>`};
  const hist=APP.history.length?APP.history.slice(0,5).map(h=>`<li><span class="mono">${esc(new Date(h.started_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"}))}</span>${esc(h.provider==="import"?"Import":GUIDE[h.provider]?GUIDE[h.provider].label:h.provider)} · ${h.items_processed} in · +${h.nodes_created} nodes<em class="${esc(h.status)}">${esc(h.status)}</em></li>`).join(""):`<li class="none">No imports yet.</li>`;
  accountEl.innerHTML=`<header><span class="av">${u.avatar?`<img src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">`:esc((u.name||"?").charAt(0).toUpperCase())}</span><div><b>${esc(u.name||"You")}</b><span>${esc(u.email||"")}</span></div>
      <button class="ibtn x" data-act="close" aria-label="Close account"><svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></button></header>
    <p class="note mono"><i></i>Your Brain is private to your account</p>
    <section><h4 class="mono">Brain</h4><input id="brainName" maxlength="80" aria-label="Brain name" value="${esc(APP.brain?APP.brain.name:"My AI Brain")}"><p class="meta mono">${n} nodes · ${e} connections</p></section>
    <section><h4 class="mono">Connected AI</h4>${["claude","chatgpt","import"].map(row).join("")}</section>
    <section><h4 class="mono">Sync</h4><ul class="hist">${hist}</ul></section>
    <section><h4 class="mono">Data</h4><div class="danger"><button data-act="del-data">Delete imported data</button><button data-act="del-brain">Delete brain</button></div>
      <p class="fine">MY AI BRAIN only processes data you explicitly provide or authorize. Full conversations never leave your browser.</p></section>
    <button class="signout mono" data-act="signout">Sign out</button>`;
  const nm=$("brainName");nm.addEventListener("change",async()=>{const v=nm.value.trim();if(!v||!APP.brain||v===APP.brain.name)return;try{await Cloud.rename(v);APP.brain.name=v}catch(err){nm.value=APP.brain.name}})}
const armed=new Map();
accountEl.addEventListener("click",async e=>{const b=e.target.closest("[data-act]");if(!b)return;const a=b.dataset.act;
  if(a==="close")return closeAccount();
  if(a.startsWith("connect-")){closeAccount();return openConnect(a.slice(8))}
  if(a==="import"){closeAccount();return openImport()}
  if(a==="signout"){b.disabled=true;try{await Cloud.signOut()}catch(err){}APP.user=null;APP.base=[];return enterGuest(null,"regrow")}
  if(a.startsWith("disconnect-")){try{await Cloud.source(a.slice(11),"disconnect");await refreshBrain()}catch(err){b.textContent="Try again"}return}
  if(a==="del-data"||a==="del-brain"){
    if(!armed.get(a)){armed.set(a,setTimeout(()=>{armed.delete(a);renderAccount()},4000));b.classList.add("armed");b.textContent=a==="del-data"?`Confirm: delete ${APP.base.length} nodes`:"Confirm: delete this brain";return}
    clearTimeout(armed.get(a));armed.delete(a);b.disabled=true;b.textContent="Deleting…";
    try{await(a==="del-data"?Cloud.deleteData():Cloud.deleteBrain());await refreshBrain();closeAccount();showWelcome()}catch(err){b.disabled=false;b.textContent="Couldn’t delete. Try again"}}});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(!accountEl.hidden)closeAccount();else if(!$("auth").hidden)stage(authFromLanding?"landing":null);else if(!$("connect").hidden||!$("welcome").hidden)stage(null)});

(function boot(){
  if(!gl){emptyEl.hidden=false;emptyEl.querySelector("h2").textContent="This brain needs WebGL.";emptyEl.querySelector("p").textContent="Open the page in a current browser with hardware acceleration on to see it.";document.body.classList.remove("intro");return}
  if(!REDUCED)document.body.classList.add("intro");else document.body.classList.remove("intro");
  if(readS("view")==="public")S.view="public";const st=readS("state");if(SKEYS.includes(st))S.state=st;
  const m=location.hash.match(/^#(flow|orb|layers|galaxy|engine)$/);if(m)S.state=m[1];
  if(MODE==="app")bootApp();else bootLocal("boot");
  requestAnimationFrame(frame);
})();

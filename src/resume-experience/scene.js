import './lab.js';
import * as THREE from 'three';
import { CanvasRenderer } from './canvas-renderer';
import { PipelineSimulation } from './pipeline.mjs';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
gsap.registerPlugin(ScrollTrigger);
const root=document.documentElement,mount=document.querySelector('#three-stage'),reduced=matchMedia('(prefers-reduced-motion: reduce)'),status=document.querySelector('#scene-status');
let renderer,composer,fallback=false;
try{init()}catch(error){console.warn('Pipeline renderer unavailable',error);mount.dataset.renderer='fallback';status.textContent='PIPELINE PREVIEW UNAVAILABLE';document.querySelector('#warp').disabled=true}
function init(){
 try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'})}catch{renderer=new CanvasRenderer();fallback=true}
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.35:1.75));renderer.setSize(innerWidth,innerHeight);mount.appendChild(renderer.domElement);mount.dataset.renderer=fallback?'canvas-3d':'webgl';
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,80);camera.position.z=10;
 scene.background=new THREE.Color(root.dataset.theme==='light'?'#eeece5':'#242720');
 const board=new THREE.Group();scene.add(board);
 const gold=new THREE.Color(),teal=new THREE.Color(),ink=new THREE.Color(),bg=new THREE.Color();
 const materials=[],traces=[];
 function material(kind,opacity=1,wireframe=false){const m=new THREE.MeshBasicMaterial({transparent:true,opacity,wireframe});m.userData.kind=kind;materials.push(m);return m}
 function lineMaterial(kind,opacity){const m=new THREE.LineBasicMaterial({transparent:true,opacity});m.userData.kind=kind;materials.push(m);return m}
 function box(x,y,z,w,h,d,kind,opacity=1){const m=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),lineMaterial(kind,opacity));m.position.set(x,y,z);board.add(m);return m}
 function trace(points,opacity=.28){const geom=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const m=new THREE.LineBasicMaterial({transparent:true,opacity});traces.push(m);const line=new THREE.Line(geom,m);board.add(line);return line}
 // The memory bank is shown as contiguous cells; head and tail wrap at 32.
 const cellGeometry=new THREE.EdgesGeometry(new THREE.BoxGeometry(.32,.26,.16)),cells=[];for(let i=0;i<32;i++){const mesh=new THREE.LineSegments(cellGeometry,lineMaterial('gold',.2));mesh.position.set(-1.35+(i%8)*.385,.56-Math.floor(i/8)*.37,.06);board.add(mesh);cells.push(mesh)}
 const memory=box(0,0,-.1,3.25,1.7,.16,'gold',.28);
 const nic=box(-.85,1.85,0,1.1,.52,.26,'teal',.8);
 const nicInset=box(-.85,1.85,.15,.76,.22,.05,'teal',.5);
 const worker=box(.35,-1.7,0,.72,.55,.3,'gold',.9);
 const workerInset=box(.35,-1.7,.18,.35,.28,.1,'gold',.7);
 const publish=box(-.85,-2.8,0,1.1,.42,.25,'teal',.8);
 trace([[-.85,1.55,0],[-.85,1.2,0],[-1.55,1.2,0],[-1.55,.8,0]]);
 trace([[1.55,-.6,0],[1.95,-.6,0],[1.95,-1.7,0],[.75,-1.7,0]]);
 trace([[.35,-2,0],[.35,-2.8,0],[-.3,-2.8,0]]);
 // Small copper traces and processor pins, deliberately tied to the data path.
 for(let i=0;i<6;i++){const x=.08+i*.11;trace([[x,-1.99,0],[x,-2.18,0]],.35);trace([[x,-1.41,0],[x,-1.22,0]],.35)}
 for(let i=0;i<5;i++){const y=1.68+i*.085;trace([[-1.4,y,0],[-1.57,y,0]],.35)}
 const headPointer=box(-1.35,.56,.25,.38,.32,.05,'teal',.95),tailPointer=box(-1.35,.56,.31,.41,.35,.05,'gold',.9);
 const particleGeometry=new THREE.BoxGeometry(.075,.075,.075),particlePool=Array.from({length:100},()=>{const mesh=new THREE.Mesh(particleGeometry,material('teal',1));mesh.visible=false;board.add(mesh);return {mesh,active:false,start:0,duration:0,from:new THREE.Vector3(),to:new THREE.Vector3(),via:new THREE.Vector3()}});
 function packet(from,to,duration,kind='teal',delay=0){const p=particlePool.find(p=>!p.active);if(!p)return;p.active=true;p.start=elapsed+delay;p.duration=duration;p.from.copy(from);p.to.copy(to);p.via.copy(from).lerp(to,.5);p.via.z+=.5;p.mesh.visible=true;p.mesh.material.color.copy(kind==='gold'?gold:teal)}
 const labels=[];function label(text,position,name){const el=document.createElement('div');el.className='pipeline-label';el.textContent=text;if(name)el.id=name;mount.appendChild(el);labels.push({el,position:new THREE.Vector3(...position)})}
 label('01 / NIC · RECEIVE',[-.85,2.33,0]);label('02 / SPSC RING',[0,1.05,0]);label('03 / SINGLE WRITER',[.35,-1.1,0]);label('04 / PUBLISH',[-.85,-3.25,0]);label('H',[-1.35,.56,.5],'head-label');label('T',[-1.35,.56,.5],'tail-label');
 const backdrop=new THREE.Group();const grid=new THREE.GridHelper(50,50);grid.position.set(0,-4.1,-14);grid.material.transparent=true;grid.material.opacity=.08;backdrop.add(grid);
 const starPositions=new Float32Array(300*3);for(let i=0;i<300;i++){starPositions[i*3]=(Math.random()-.5)*40;starPositions[i*3+1]=(Math.random()-.5)*25;starPositions[i*3+2]=-8-Math.random()*25}
 const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(starPositions,3));const starMat=new THREE.PointsMaterial({size:.028,transparent:true,opacity:.35});const stars=new THREE.Points(starGeo,starMat);
 composer={render:()=>renderer.render(scene,camera),setSize:()=>{}};
 const state={intro:0,scroll:0,pointerX:0,pointerY:0,kick:0};let running=false,targetX=0,targetY=0,elapsed=0,last=0,workerPulse=0;
 const simulation=new PipelineSimulation();
 function active(){return root.dataset.motion==='overdrive'&&!reduced.matches&&!document.hidden}
 function simulate(dt){const events=simulation.step(dt);elapsed=simulation.elapsed;
 for(const {index} of events.enqueued)packet(nic.position,cells[index].position,.12);
 for(const {index} of events.dequeued){packet(cells[index].position,worker.position,.24,'gold');packet(worker.position,publish.position,.3,'teal',.24);workerPulse=1}
 workerPulse=Math.max(0,workerPulse-dt*5);status.textContent=`${String(simulation.count).padStart(2,'0')} / 32 SLOTS · ${simulation.phase}`;mount.dataset.queued=String(simulation.count);mount.dataset.phase=simulation.phase;
 }
 const projected=new THREE.Vector3();function update(dt){if(dt)simulate(dt);const motionOn=active(),scroll=motionOn?state.scroll:0,mobile=innerWidth<800,hero=document.querySelector('.hero').getBoundingClientRect();
 const frustumHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z;
 state.pointerX+=(targetX-state.pointerX)*.04;state.pointerY+=(targetY-state.pointerY)*.04;
 board.position.x=(mobile?0:.255)*frustumHeight*camera.aspect;const centerY=mobile?hero.top+390:hero.top+hero.height*.48;
 board.position.y=(.5-Math.max(innerHeight*.25,centerY)/innerHeight)*frustumHeight;
 board.scale.setScalar((mobile?Math.min(innerWidth*.66,280)*frustumHeight/(3.25*innerHeight):.9)*Math.max(.01,state.intro));board.rotation.y=-.2+(motionOn?state.pointerX*.22:0)+scroll*.28;board.rotation.x=.1+(motionOn?state.pointerY*.12:0);board.rotation.z=Math.sin(elapsed*.15)*.015;
 const fade=Math.max(.1,Math.min(1,(hero.bottom-40)/(innerHeight*.55)));
 for(let i=0;i<32;i++){const q=simulation.queue[i];cells[i].material.opacity=(q.occupied?.95:.18)*fade;cells[i].material.color.copy(q.occupied?gold:ink);cells[i].scale.z=q.occupied?1.6:1;}
 headPointer.position.copy(cells[simulation.head].position);headPointer.position.z=.25;tailPointer.position.copy(cells[simulation.tail].position);tailPointer.position.z=.31;
 workerInset.scale.setScalar(1+workerPulse*.35);workerInset.material.opacity=.5+workerPulse*.5;
 for(const p of particlePool){if(!p.active)continue;const t=(elapsed-p.start)/p.duration;if(t<0){p.mesh.visible=false;continue}p.mesh.visible=true;if(t>=1){p.active=false;p.mesh.visible=false;continue}p.mesh.position.copy(p.from).multiplyScalar((1-t)**2).addScaledVector(p.via,2*t*(1-t)).addScaledVector(p.to,t*t);p.mesh.rotation.set(elapsed,elapsed*2,elapsed*.5)}
 stars.rotation.y=scroll*.03;camera.fov=42+state.kick;camera.updateProjectionMatrix();board.updateMatrixWorld(true);camera.updateMatrixWorld();
 for(const l of labels){if(l.el.id==='head-label')l.position.copy(headPointer.position).add(new THREE.Vector3(-.14,.22,.1));if(l.el.id==='tail-label')l.position.copy(tailPointer.position).add(new THREE.Vector3(.14,-.22,.1));projected.copy(l.position).applyMatrix4(board.matrixWorld).project(camera);l.el.style.transform=`translate(-50%,-50%) translate(${(projected.x*.5+.5)*innerWidth}px,${(-projected.y*.5+.5)*innerHeight}px)`;l.el.style.opacity=String(state.intro*fade)}
 }
 function renderOnce(){if(!composer)return;update(0);composer.render()}
 function syncTheme(){const light=root.dataset.theme==='light';gold.set(light?'#626b43':'#b1bc91');teal.set(light?'#7b714e':'#d0d2b8');ink.set(light?'#9a9079':'#666958');bg.set(light?'#eeece5':'#242720');scene.background=bg;scene.fog=new THREE.FogExp2(bg,.022);for(const m of materials)m.color.copy(m.userData.kind==='gold'?gold:teal);traces.forEach(m=>m.color.copy(gold));grid.material.color.copy(gold);starMat.color.copy(gold);renderOnce()}
 function tick(time){if(!active())return syncRunning();const interval=fallback?40:(innerWidth<700?33:20);if(last&&time-last<interval)return;const dt=Math.min((time-(last||time))/1000,.07);last=time;update(dt);composer.render();mount.dataset.frames=String((Number(mount.dataset.frames)||0)+1)}
 function syncRunning(){document.querySelector('#warp').disabled=!active();if(active()){running=true;last=0;renderer.setAnimationLoop(tick)}else{running=false;renderer.setAnimationLoop(null);status.textContent=reduced.matches?'REDUCED MOTION':`${String(simulation.count).padStart(2,'0')} / 32 SLOTS · PAUSED`;renderOnce()}}
 function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<700?1.35:1.75));renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);renderOnce()}
 function intro(){if(!active()){state.intro=1;renderOnce();return}gsap.killTweensOf(state,'intro');gsap.fromTo(state,{intro:.1},{intro:1,duration:1.7,ease:'expo.out'})}
 function burst(){if(!active())return;simulation.injectBurst();gsap.killTweensOf(state,'kick');gsap.to(state,{kick:3,duration:.4,yoyo:true,repeat:1,ease:'sine.inOut'});document.body.classList.remove('warp-flash');void document.body.offsetWidth;document.body.classList.add('warp-flash')}
 document.querySelector('#warp').addEventListener('click',burst);
 document.addEventListener('pointermove',e=>{targetX=e.clientX/innerWidth-.5;targetY=e.clientY/innerHeight-.5},{passive:true});
 new MutationObserver(records=>{for(const r of records){if(r.attributeName==='data-theme')syncTheme();if(r.attributeName==='data-motion'){if(!active()){gsap.killTweensOf(state);state.intro=1;state.kick=0}syncRunning()}}}).observe(root,{attributes:true,attributeFilter:['data-theme','data-motion']});
 const boot=document.querySelector('#boot');new MutationObserver(()=>{if(boot.classList.contains('done'))intro()}).observe(boot,{attributes:true,attributeFilter:['class']});
 ScrollTrigger.create({start:0,end:()=>document.documentElement.scrollHeight-innerHeight,onUpdate:self=>{state.scroll=self.progress;if(!running)renderOnce()}});
 document.querySelectorAll('.terminal-panel,.metric').forEach(panel=>{panel.addEventListener('pointermove',e=>{if(!active()||e.pointerType!=='mouse')return;const r=panel.getBoundingClientRect();gsap.to(panel,{rotateX:-(e.clientY-r.top-r.height/2)/r.height*4,rotateY:(e.clientX-r.left-r.width/2)/r.width*4,transformPerspective:900,duration:.5,overwrite:true})});panel.addEventListener('pointerleave',()=>gsap.to(panel,{rotateX:0,rotateY:0,duration:.5,overwrite:true}))});
 addEventListener('resize',resize);document.addEventListener('visibilitychange',syncRunning);reduced.addEventListener('change',syncRunning);renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);status.textContent='3D PAUSED / RELOAD TO RESTORE';document.querySelector('#warp').disabled=true});addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);running=false});addEventListener('pageshow',syncRunning);
 syncTheme();resize();syncRunning();if(boot.classList.contains('done'))intro();else state.intro=.05;
}

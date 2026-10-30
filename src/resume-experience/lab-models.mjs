// Deliberately small teaching models, not CPU benchmarks.
export class TranslationCache {
 constructor(pageSize=4096,capacity=8){this.pageSize=pageSize;this.capacity=capacity;this.entries=[];this.hits=0;this.misses=0;}
 access(address){const page=Math.floor(address/this.pageSize),index=this.entries.indexOf(page),hit=index!==-1;if(hit){this.hits++;this.entries.splice(index,1)}else{this.misses++;if(this.entries.length===this.capacity)this.entries.shift()}this.entries.push(page);return {address,page,hit,levels:hit?[]:(this.pageSize===2097152?['PML4','PDPT','PD']:['PML4','PDPT','PD','PT']),offset:address%this.pageSize};}
 get reach(){return this.capacity*this.pageSize}
}
export function batchSchedule(size,count=16){const batches=[];for(let start=0;start<count;start+=size){const n=Math.min(size,count-start),release=(start+n-1)*.35;const packets=Array.from({length:n},(_,j)=>({id:start+j,arrival:(start+j)*.35,release,wait:(n-1-j)*.35}));batches.push({release,packets})}return batches;}
export function percentile(samples,p){if(!samples.length)return 0;const sorted=[...samples].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];}
export function latencySamples(stall=false){return Array.from({length:100},(_,i)=>stall&&i%25===0?150+(i%3)*20:18+(i*7)%20);}

export function cacheRoute(source='L1') {
 const levels=['L1','L2','L3','DRAM'];const depth=levels.indexOf(source);if(depth<0)throw new RangeError('Unknown cache source');
 const lookups=levels.slice(0,depth+1);
 return {lookups,misses:lookups.filter(x=>x!==source),route:['cpu',...lookups,...lookups.slice(0,-1).reverse(),'cpu'],source};
}
// Deliberately serialized alternating writes: 3 ownership-transfer ticks + 1 write.
// Padded lines begin exclusively owned, allowing both writers to write each tick.
export function sharingFrame(tick,padded=false) {
 const t=Math.max(0,Math.floor(tick));if(padded){const each=Math.min(16,t);return {a:each,b:each,done:each*2,wait:0,transfers:0,states:['M','M'],writer:-1,phase:each===16?'COMPLETE':'BOTH WRITING'};}
 const done=Math.min(32,Math.floor(t/4)),writer=done%2,phase=t%4;
 if(done===32)return {a:16,b:16,done:32,wait:96,transfers:32,states:['I','M'],writer:-1,phase:'COMPLETE'};
 const states=['I','I'];if(phase===3)states[writer]='M';
 return {a:Math.ceil(done/2),b:Math.floor(done/2),done,wait:Math.min(96,done*3+Math.min(phase,3)),transfers:done,states,writer,phase:['REQUEST OWNERSHIP','TRANSFER LINE','WAIT FOR ACK','WRITE'][phase]};
}
export function simdFrame(instructions,lanes=4,count=16) {
 if(![4,8].includes(lanes))throw new RangeError('Expected four or eight lanes');
 const ticks=Math.max(0,Math.floor(instructions)),scalarDone=Math.min(count,ticks),vectorDone=Math.min(count,ticks*lanes);
 return {scalarDone,vectorDone,scalarInstructions:Math.min(count,ticks),vectorInstructions:Math.min(Math.ceil(count/lanes),ticks),outputs:Array.from({length:count},(_,i)=>i+11)};
}

// Deliberately slowed down. These rates illustrate queue behavior, not benchmarks.
export class PipelineSimulation {
 constructor(capacity=32){this.capacity=capacity;this.queue=Array.from({length:capacity},()=>({occupied:false,entered:0,sequence:0}));this.head=0;this.tail=0;this.count=0;this.elapsed=0;this.arrival=0;this.service=0;this.burstUntil=0;this.sequence=0;this.phase='STEADY FLOW'}
 injectBurst(){this.burstUntil=this.elapsed+3.5}
 step(dt){this.elapsed+=dt;const burst=this.elapsed<this.burstUntil;this.arrival+=dt*(burst?28:3);this.service+=dt*9;let blocked=false;const enqueued=[],dequeued=[];
 while(this.arrival>=1){if(this.count===this.capacity){this.arrival=1;blocked=true;break}this.arrival--;const index=this.head;const item={occupied:true,entered:this.elapsed,sequence:this.sequence++};this.queue[index]=item;this.count++;this.head=(this.head+1)%this.capacity;enqueued.push({index,sequence:item.sequence})}
 while(this.service>=1){this.service--;if(this.count&&this.elapsed-this.queue[this.tail].entered>.16){const index=this.tail;this.queue[index].occupied=false;this.count--;this.tail=(this.tail+1)%this.capacity;dequeued.push({index,sequence:this.queue[index].sequence})}}
 if(!this.count)this.service=Math.min(this.service,1);this.phase=blocked?'BACKPRESSURE / SOURCE PAUSED':burst?'BURST / QUEUE FILLING':this.count>2?'DRAINING BACKLOG':'STEADY FLOW';return{enqueued,dequeued,blocked};
 }
}

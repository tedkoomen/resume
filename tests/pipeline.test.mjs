import test from 'node:test';
import assert from 'node:assert/strict';
import {PipelineSimulation} from '../src/resume-experience/pipeline.mjs';
test('a burst fills the bounded queue, applies backpressure, and drains in FIFO order',()=>{
 const s=new PipelineSimulation(),sent=[],received=[];let blocked=false,max=0;
 s.injectBurst();
 for(let i=0;i<1800;i++){const result=s.step(1/60);sent.push(...result.enqueued.map(x=>x.sequence));received.push(...result.dequeued.map(x=>x.sequence));blocked ||= result.blocked;max=Math.max(max,s.count);assert.ok(s.count>=0&&s.count<=32);assert.equal(s.queue.filter(x=>x.occupied).length,s.count)}
 assert.ok(blocked);assert.ok(max>=31);assert.equal(s.phase,'STEADY FLOW');assert.ok(s.count<=2);assert.deepEqual(received,sent.slice(0,received.length));assert.ok(s.sequence>64);
});
test('steady flow stays bounded and head/tail wrap with variable frame durations',()=>{
 const s=new PipelineSimulation();for(let i=0;i<1000;i++){s.step(i%2?.04:.07);assert.ok(s.count<=2);assert.ok(s.head>=0&&s.head<32);assert.ok(s.tail>=0&&s.tail<32)}assert.ok(s.sequence>100);
});

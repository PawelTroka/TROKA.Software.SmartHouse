import test from 'node:test';
import assert from 'node:assert/strict';
import {WALK_COMFORT,walkDelta,walkLook,walkFrameSeconds,smoothWalkElevation} from '../src/walk-motion.js';

const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
test('walking covers the same distance at 30, 60 and 144 fps without faster diagonals or stall jumps',()=>{
  for(const fps of [30,60,144]){
    let travelled=0;
    for(let i=1;i<=fps;i++){
      const dt=walkFrameSeconds(1000+i*1000/fps,1000+(i-1)*1000/fps);
      travelled+=Math.hypot(...walkDelta(1,1,dt*WALK_COMFORT.speed,.7));
    }
    near(travelled,WALK_COMFORT.speed);
  }
  near(walkFrameSeconds(6000,1000),.056);near(walkFrameSeconds(900,1000),0);
  assert.ok(Math.hypot(...walkDelta(0,1,walkFrameSeconds(6000,1000)*WALK_COMFORT.speed))<.095);
});

test('combined horizontal and vertical free-flight input retains the selected comfortable speed',()=>{
  for(const speed of [WALK_COMFORT.speed,WALK_COMFORT.fastSpeed]){
    for(const [right,forward,vertical]of [[0,0,1],[0,1,1],[1,1,1],[-1,1,-1],[1,0,-1]]){
      const delta=walkDelta(right,forward,speed,.37,vertical);
      near(Math.hypot(...delta),speed);
      assert.equal(Math.sign(delta[1]),Math.sign(vertical));
    }
  }
});

test('dragging uses the comfortable room yaw/pitch signs and fixes the horizon and walking lens',()=>{
  const look=walkLook(0,0,100,100);near(look.yaw,.43);near(look.pitch,-.43);
  assert.ok(walkDelta(0,1,1,look.yaw)[0]>0,'right drag turns toward camera right');
  const worldLook=walkLook(0,0,100,0);
  assert.ok(walkDelta(0,1,1,Math.PI+worldLook.yaw)[0]<0,'same sign after conversion to the site heading');
  near(walkLook(0,0,0,10000).pitch,-WALK_COMFORT.maxPitch);
  near(walkLook(0,0,0,-10000).pitch,WALK_COMFORT.maxPitch);
  assert.equal(WALK_COMFORT.fov,70);
});

test('grade and tread height transitions are monotonic, speed-limited and independent of frame rate',()=>{
  for(const target of [-1.7,.18,2.4]){
    const results=[];
    for(const fps of [30,60,144]){
      let height=0;
      for(let frame=0;frame<fps;frame++){
        const next=smoothWalkElevation(height,target,1/fps);
        assert.ok(Math.abs(next-height)<=WALK_COMFORT.maxElevationSpeed/fps+1e-10);
        assert.ok(Math.abs(target-next)<=Math.abs(target-height)+1e-10);
        height=next;
      }
      results.push(height);
    }
    near(results[0],results[1]);near(results[1],results[2]);
    near(results[0],smoothWalkElevation(0,target,1));
  }
});

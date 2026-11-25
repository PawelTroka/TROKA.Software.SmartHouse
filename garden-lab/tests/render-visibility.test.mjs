import test from 'node:test';
import assert from 'node:assert/strict';
import {latestIntersectionEntry} from '../src/render-visibility.js';

test('a queued offscreen/on-screen scroll batch resumes drawing from its final canvas state',()=>{
  const canvas={};
  const offscreen={target:canvas,time:10,isIntersecting:false};
  const onscreen={target:canvas,time:20,isIntersecting:true};
  assert.equal(latestIntersectionEntry([offscreen,onscreen],canvas).isIntersecting,true);
  assert.equal(latestIntersectionEntry([onscreen,{...offscreen,time:30}],canvas).isIntersecting,false);
  // Use entry timestamps rather than assuming every delivered list is sorted.
  assert.equal(latestIntersectionEntry([onscreen,offscreen],canvas),onscreen);
});

test('visibility batches retain the last equally timed target entry and ignore unrelated targets',()=>{
  const canvas={},other={};
  const first={target:canvas,time:10,isIntersecting:false};
  const last={target:canvas,time:10,isIntersecting:true};
  assert.equal(latestIntersectionEntry([first,last,{target:other,time:40,isIntersecting:false}],canvas),last);
  assert.equal(latestIntersectionEntry([{target:other,time:40,isIntersecting:false}],canvas),null);
  assert.equal(latestIntersectionEntry([],canvas),null);
});

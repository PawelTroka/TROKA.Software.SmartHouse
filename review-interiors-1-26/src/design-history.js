/** Undo design edits without moving the camera, changing daylight or replaying a
 * garage preview. A bounded session history is independent of saved A/B designs. */
export const VIEW_ONLY_KEYS=Object.freeze(['mode','preset','observerX','observerY','eyeHeight','poolEyeAboveWater','lookYaw','lookPitch','sunDate','sunMinutes','sunEnabled','sunPathVisible','showDimensions','showRays','garageProgress','garageReverse','renderQuality','sceneMotion']);
const copy=value=>JSON.parse(JSON.stringify(value));
const ignored=new Set(VIEW_ONLY_KEYS);
const fingerprint=value=>JSON.stringify(Object.fromEntries(Object.keys(value).filter(key=>!ignored.has(key)).sort().map(key=>[key,value[key]])));
const withView=(design,live)=>({...copy(design),...Object.fromEntries(VIEW_ONLY_KEYS.filter(key=>Object.hasOwn(live,key)).map(key=>[key,live[key]]))});

export function createDesignHistory(initial,{limit=40}={}){
  const capacity=Math.max(1,Math.min(100,Math.floor(limit)||40));
  let current=copy(initial),past=[],future=[];
  return {
    record(next){
      if(next.siteId!==current.siteId)throw new Error('Design history cannot cross properties');
      if(fingerprint(next)===fingerprint(current))return false;
      past.push(current);if(past.length>capacity)past.shift();current=copy(next);future=[];return true;
    },
    undo(live){if(!past.length)return null;future.push(current);current=past.pop();return withView(current,live);},
    redo(live){if(!future.length)return null;past.push(current);current=future.pop();return withView(current,live);},
    get canUndo(){return past.length>0;},get canRedo(){return future.length>0;},
    get length(){return past.length+1+future.length;},
  };
}

import {DESIGN_STYLES,getDesignStyle,designStyleSearchText} from './design-styles.js?v=1.36.0';
import {getInteriorStyleRecipe} from './interior-style-recipes.js?v=1.36.0';
import {getResortDesignIntent} from './resort-design-intents.js?v=1.36.0';
import {getStyleMaterialSamples} from './material-catalogue.js?v=1.36.0';
import {getRenovationArchitecture} from './renovation-architecture.js?v=1.36.0';
import {getRenovationGardenRecipe} from './renovation-garden.js?v=1.36.0';

const $=id=>document.getElementById(id);
const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
/** The same photographic surface families used by the renderer. Swatch images
 * are small derivatives, so opening the catalogue does not load full PBR sets. */
function materialBoard(style,{interior=false}={}){
  const board=document.createElement('span');board.className='material-board';
  for(const sample of getStyleMaterialSamples(style,{interior})){
    const item=document.createElement('span');item.className='material-sample';item.dataset.material=sample.asset;
    const picture=document.createElement('img');picture.src=sample.url;picture.alt=sample.label||sample.asset;
    picture.loading='lazy';picture.decoding='async';picture.width=160;picture.height=112;
    item.append(picture,text('span',sample.label||sample.asset,'material-sample-label'));
    board.append(item);
  }
  return board;
}

export function createStudioControls({getSettings,onChange,onMoment,onInspect,onUndo,onRedo}){
  const dialog=$('style-dialog'),grid=$('style-grid'),search=$('style-search'),family=$('style-family');
  const selector=$('designStyle'),status=$('style-status');
  let lastTrigger=null,stats=null,renderedStyle=null;
  $('style-catalogue-description').textContent=`Explore ${DESIGN_STYLES.filter(style=>style.id!=='current').length} complete designs for your home and garden, plus the original house.`;
  for(const style of DESIGN_STYLES){const option=text('option',style.label);option.value=style.id;selector.append(option);}
  for(const value of [...new Set(DESIGN_STYLES.map(style=>style.family))]){const option=text('option',value);option.value=value;family.append(option);}
  const cards=new Map();
  for(const style of DESIGN_STYLES){
    const button=document.createElement('button');button.type='button';button.className='style-card';button.dataset.styleId=style.id;
    button.setAttribute('aria-label',`Use ${style.label}`);button.setAttribute('aria-pressed','false');
    button.append(materialBoard(style));
    const body=document.createElement('span');body.className='style-card-body';
    body.append(text('span',style.family,'style-family'),text('strong',style.label),text('span',style.description,'style-card-description'));
    const intent=getResortDesignIntent(style.id);
    body.append(text('span',intent?.headline||(style.renovation?'A complete house and garden design.':'Original house · no renovation.'),'style-card-renovation'));
    button.append(body);button.addEventListener('click',()=>{choose(style.id);dialog.close();});grid.append(button);cards.set(style.id,button);
  }
  function filter(){
    const query=search.value.trim().toLocaleLowerCase();let count=0;
    for(const style of DESIGN_STYLES){const show=(!family.value||family.value===style.family)&&designStyleSearchText(style).includes(query);cards.get(style.id).hidden=!show;if(show)count++;}
    $('style-result-count').textContent=`${count} ${count===1?'design':'designs'}`;$('style-empty').hidden=count!==0;
  }
  function choose(id){onChange({designStyle:id,styleHouseFinish:id!=='current'});status.textContent=id==='current'?'Current house restored with its original layout.':`${getDesignStyle(id).label} applied to the windows, façades, rooms, furnishings and garden. The camera and light stay in place for comparison.`;}
  function open(event){lastTrigger=event?.currentTarget||$('style-open');search.value='';family.value='';filter();dialog.showModal();search.focus();}
  $('style-open').addEventListener('click',open);
  $('style-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>lastTrigger?.focus());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  search.addEventListener('input',filter);family.addEventListener('change',filter);
  selector.addEventListener('change',()=>choose(selector.value));
  $('styleHouseFinish').addEventListener('change',e=>onChange({styleHouseFinish:e.target.checked}));
  $('styleGardenLayout').addEventListener('change',e=>onChange({styleGardenLayout:e.target.checked}));
  $('renderQuality').addEventListener('change',e=>onChange({renderQuality:e.target.value}));
  $('sceneMotion').addEventListener('change',e=>onChange({sceneMotion:e.target.checked}));
  $('studio-undo').addEventListener('click',onUndo);$('studio-redo').addEventListener('click',onRedo);
  for(const button of document.querySelectorAll('[data-studio-moment]'))button.addEventListener('click',()=>onMoment(button.dataset.studioMoment));
  for(const button of document.querySelectorAll('[data-studio-inspect]'))button.addEventListener('click',()=>onInspect?.(button.dataset.studioInspect));
  function sync(){
    const s=getSettings(),style=getDesignStyle(s.designStyle);selector.value=style.id;
    $('styleHouseFinish').checked=s.styleHouseFinish;$('styleHouseFinish').disabled=style.id==='current';
    $('studio-house-scope').textContent=style.id==='current'?'House · Original layout':'House · Complete renovation';
    $('studio-house-scope').dataset.renovated=String(style.id!=='current'&&s.styleHouseFinish===true);
    $('studio-house-description').textContent=style.id==='current'?'Original drawing layout and house finishes. Select a style to explore a substantial renovation within the retained house.':getRenovationArchitecture(style.id).description+' '+getInteriorStyleRecipe(style.id).features.join(' · ')+'. '+style.renovation.description;
    const garden=getRenovationGardenRecipe(s),gardenControl=$('styleGardenLayout');
    gardenControl.checked=s.styleGardenLayout;gardenControl.disabled=style.id==='current'||s.siteId!=='sternicza-11';
    $('studio-garden-description').textContent=garden?garden.name+'. '+garden.description:
      style.id==='current'?'The original garden programme is active.':
      s.pavilionEnabled?'The pavilion study controls the pool and seating positions. The selected style still supplies the finishes and furnishings.':
      s.siteId!=='sternicza-11'?'The mapped garden dimensions remain active for this property.':
      !s.styleGardenLayout?'Your chosen garden programme is retained. Enable the style layout to compare its pool, dining, lounge, planting and cooking areas.':
      'Choose a spa garden programme to use the coordinated pool, dining, lounge and planting arrangement.';
    $('renderQuality').value=s.renderQuality;$('sceneMotion').checked=s.sceneMotion;
    $('design-studio').dataset.style=style.id;
    if(renderedStyle!==style.id){
      renderedStyle=style.id;
      $('studio-style-family').textContent=style.family;
      $('studio-style-description').textContent=style.description;
      const intent=getResortDesignIntent(style.id);
      $('studio-living').hidden=style.id==='current';
      $('studio-living-title').textContent=intent?.headline||'Life at home';
      $('studio-living-details').replaceChildren(...[['Retreat',intent?.retreat],['Gather',intent?.gathering],['After dark',intent?.evening]].filter(([,value])=>value).map(([label,value])=>{
        const item=document.createElement('div');item.append(text('dt',label),text('dd',value));return item;
      }));
      $('studio-swatches').replaceChildren(...style.swatches.map(color=>{const e=document.createElement('i');e.style.backgroundColor=color;e.setAttribute('aria-hidden','true');return e;}));
      $('studio-finishes').replaceChildren(...Object.entries(style.finishes).map(([key,value])=>{const item=document.createElement('div');item.append(text('dt',key==='surface'?'Ground finish':key==='canopy'?'Cover details':key==='lighting'?'Lighting':'Furniture'),text('dd',value));return item;}));
      $('studio-material-samples').replaceChildren(...[false,true].map(interior=>{
        const row=document.createElement('div');row.append(text('h4',interior?'Inside the house':'House and garden'),materialBoard(style,{interior}));return row;
      }));
      $('studio-bespoke').textContent=style.bespoke||'Finish recipes illustrate a design direction. Select material specifications and installed quotes before budgeting a renovation.';
      for(const [id,card]of cards)card.setAttribute('aria-pressed',String(id===style.id));
    }
    if(stats)performanceInfo(stats);
  }
  function performanceInfo(value){
    stats=value;if(!value)return;
    const host=$('render-diagnostics');
    for(const key of ['frames','shadowUpdates','calls','triangles','geometries','textures','pixelRatio','bufferWidth','bufferHeight','shadowSize','houseRenovationParts','houseRenovationProjection','houseOpeningCount','gardenKitchens','gardenPlantingBeds','garageVehicles'])if(Number.isFinite(value[key]))host.dataset[key]=String(value[key]);
    host.dataset.renderedStyle=value.renderedStyle||'pending';
    host.dataset.gardenScheme=value.gardenScheme||'manual';host.dataset.windowPattern=value.windowPattern||'original';
    for(const key of ['drawEnabled','canvasIntersecting','presentationVisible','renderPending'])host.dataset[key]=String(Boolean(value[key]));
    host.dataset.renderer=value.rendererType;host.dataset.motionActive=String(Boolean(value.motionActive));
    host.dataset.contactShading=String(Boolean(value.contactShading));
    host.dataset.interacting=String(Boolean(value.interacting));
    host.dataset.toneMapping=value.toneMapping||'direct';
    host.dataset.poolReflections=String(Boolean(value.poolReflections));
    host.dataset.surfaceAssetsRequested=String(value.surfaceAssets?.requested||0);
    host.dataset.surfaceAssetsLoaded=String(value.surfaceAssets?.loaded||0);
    host.dataset.surfaceAssetsFailed=String(value.surfaceAssets?.failed?.length||0);
    // Counts come from the actual scene batches, so browser acceptance can
    // verify corrected elevations and resolved roofs without a second model.
    for(const key of ['contextFacades','contextBalconies','contextEnvelopes'])host.dataset[key]=JSON.stringify(value[key]||{});
    $('render-quality-status').textContent=value.rendererType==='webgl'?`${value.quality==='eco'?'Eco':value.quality==='high'?'High detail':'Automatic'} · ${Number(value.pixelRatio||1).toFixed(2)}× display scale`:'Lightweight renderer';
    $('render-statistics').textContent=value.rendererType==='webgl'?`${(value.calls||0).toLocaleString()} draw calls · ${(value.triangles||0).toLocaleString()} triangles · ${value.bufferWidth||0} × ${value.bufferHeight||0} drawing buffer${value.contactShading?' · Contact shading':''}`:'Surface lighting and material depth require WebGL. Plan and calculations remain available.';
    $('render-motion-status').textContent=getSettings().sceneMotion?(value.motionActive?'Gentle water movement is active.':'Motion pauses while the scene is hidden, in a diagram, or when reduced motion is preferred.'):'The scene rests between interactions.';
  }
  function history({canUndo,canRedo}){$('studio-undo').disabled=!canUndo;$('studio-redo').disabled=!canRedo;}
  sync();filter();
  return {sync,history,performanceInfo};
}

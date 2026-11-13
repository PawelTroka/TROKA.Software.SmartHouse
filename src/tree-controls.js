import {TREE_CATALOG, getTreeType} from './tree-catalog.js?v=1.12.0';
import {createScreeningTree, screeningTreeVolumes, suggestTreePosition, TREE_LIMITS} from './screening-trees.js?v=1.12.0';
import {screeningTreeUnitPrice} from './costs.js?v=1.12.0';

const money = value => `${Math.round(value).toLocaleString('en-GB')} PLN`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Tree editing is deliberately immutable so A/B snapshots keep their own trees. */
export function createTreeControls({getSettings, getData, getObserver, getAnalysis, bounds, onChange, onViewChange, notify}) {
  const $ = id => document.getElementById(id);
  let selectedId = null, placing = false, suggestion = '', suggestionSignature = '', inventorySignature = '', targetSignature = '';
  // Placement scores belong to one observer, date and geometry. Keep camera and
  // price edits out, but invalidate the result when its screening context changes.
  function screeningSignature(state) {
    const ignored = new Set(['screeningTrees','mode','showRays','lookYaw','lookPitch','sunMinutes','sunEnabled','sunPathVisible','buyNewThujas','linkedHedges']);
    const geometry = Object.keys(state).sort().filter(key => !ignored.has(key) && !key.startsWith('cost')).map(key => [key,state[key]]);
    const trees = (state.screeningTrees || []).map(tree => [tree.id,tree.typeId,tree.x,tree.y,tree.height,tree.crownBase,tree.crownWidth,tree.crownDepth,tree.rotation,tree.enabled]);
    return JSON.stringify([geometry,trees,$('tree-target').value]);
  }
  function setSuggestion(message, state = getSettings()) {
    suggestion = message; suggestionSignature = screeningSignature(state);
  }
  const fields = {
    x: {label:'Position across plot', min:bounds.minX, max:bounds.maxX, step:.1, unit:'m'},
    y: {label:'Position along plot', min:bounds.minY, max:bounds.maxY, step:.1, unit:'m'},
    height: {label:'Total tree height', limits:TREE_LIMITS.height, step:.05, unit:'m'},
    crownBase: {label:'Crown starts above ground', limits:TREE_LIMITS.crownBase, step:.05, unit:'m'},
    crownWidth: {label:'Crown width', limits:TREE_LIMITS.crownWidth, step:.05, unit:'m'},
    crownDepth: {label:'Crown depth', limits:TREE_LIMITS.crownDepth, step:.05, unit:'m'},
    rotation: {label:'Crown rotation', limits:TREE_LIMITS.rotation, step:1, unit:'°'},
    unitPrice: {label:'Custom plant quote · 0 = catalog', limits:TREE_LIMITS.unitPrice, step:1, unit:'PLN', numberOnly:true},
  };
  for (const [key, field] of Object.entries(fields)) {
    const [min, max] = field.limits || [field.min, field.max];
    const wrapper = document.createElement('div');
    wrapper.className = `field tree-field${field.numberOnly ? ' tree-quote-field' : ''}`;
    wrapper.innerHTML = `<div class="field-top"><label for="tree-${key}${field.numberOnly ? '-value' : ''}">${esc(field.label)}</label><span class="value-input"><input id="tree-${key}-value" type="number" min="${min}" max="${max}" step="${field.step}" aria-label="${esc(field.label)} in ${field.unit === 'm' ? 'metres' : esc(field.unit)}"><span>${field.unit}</span></span></div>${field.numberOnly ? '' : `<input id="tree-${key}" type="range" min="${min}" max="${max}" step="${field.step}" aria-label="${esc(field.label)}"><div class="range-labels"><span>${Number(min).toFixed(key==='x'||key==='y'?1:0)} ${field.unit}</span><span>${Number(max).toFixed(key==='x'||key==='y'?1:0)} ${field.unit}</span></div>`}`;
    $('tree-dimension-controls').append(wrapper);
    const change = value => {
      if (value === '' || !Number.isFinite(Number(value))) return;
      patchSelected({[key]:Number(value)});
    };
    $(`tree-${key}-value`).addEventListener('input', event => change(event.target.value));
    $(`tree-${key}-value`).addEventListener('change', () => sync());
    $(`tree-${key}`)?.addEventListener('input', event => change(event.target.value));
  }

  for (const type of TREE_CATALOG) {
    const option = document.createElement('option');
    option.value = type.id; option.textContent = `${type.label} · ${money(type.pricePLN)}`;
    $('tree-type').append(option);
  }
  $('tree-type').value = 'austrian-pine-large';

  function selectedTree() { return (getSettings().screeningTrees || []).find(tree => tree.id === selectedId); }
  function changeTrees(trees) {
    onChange({screeningTrees:trees});
  }
  function patchSelected(patch) {
    if (!selectedTree()) return;
    suggestion = '';
    changeTrees(getSettings().screeningTrees.map(tree => tree.id === selectedId ? {...tree, ...patch} : {...tree}));
  }
  function showStock(type, host) {
    if (!type) { host.replaceChildren(); return; }
    host.innerHTML = `<div class="tree-stock-heading"><strong>${esc(type.botanicalName)}</strong><span class="tree-season-tag">${type.evergreen ? 'Evergreen' : 'Seasonal foliage'}</span></div><p>${esc(type.stockNote)}</p><a href="${esc(type.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(type.sourceTitle)} ↗</a>`;
  }
  function targetLabel() {
    return $('tree-target').selectedOptions[0]?.textContent || 'the target building';
  }
  function reportSuggestion(result) {
    if (!result?.position) return (result?.warnings || []).join(' ') || 'No suitable planting spot was found. Try a smaller crown or change the garden layout.';
    const before = result.blockedBefore ?? 0, after = result.blockedAfter ?? before, total = result.total ?? 0;
    const resultText = total ? `${targetLabel()}: ${before} → ${after} of ${total} sampled points blocked; ${Math.max(0,after-before)} additional points.` : 'Placed in a garden planting spot. Select a target building to compare screening.';
    return `${resultText} This is a sampled crown-envelope estimate.`;
  }
  function suggest(tree, state = getSettings()) {
    return suggestTreePosition(tree, getObserver(), $('tree-target').value, state, getData());
  }
  function addTrees(count = 1, duplicate = false) {
    const state = getSettings(), data = getData();
    if (!data) return;
    if ((state.screeningTrees || []).length >= 12) { notify('Up to 12 screening trees can be compared at once.'); return; }
    const original = duplicate ? selectedTree() : null;
    const type = getTreeType(original?.typeId || $('tree-type').value);
    if (!type) return;
    let next = {...state, screeningTrees:(state.screeningTrees || []).map(tree => ({...tree}))}, lastResult, blockedBefore;
    let added = 0;
    for (let i=0; i<count && next.screeningTrees.length<12; i++) {
      const used = new Set(next.screeningTrees.map(tree => tree.id));
      let n = 1; while (used.has(`tree-${n}`)) n++;
      const id = `tree-${n}`;
      const rear = data.site.rearMidpoint;
      const tree = original ? {...original, id, enabled:true} : createScreeningTree(type.id, {id, x:rear[0], y:rear[1]+state.terraceDepth+3});
      lastResult = suggest(tree, next);
      if (!lastResult?.position) break;
      if(blockedBefore === undefined)blockedBefore=lastResult.blockedBefore;
      const positioned = {...tree, ...lastResult.tree, ...lastResult.position, id, enabled:true};
      next.screeningTrees = [...next.screeningTrees, positioned];
      selectedId = id; added++;
    }
    placing = false;
    if (!added) { setSuggestion(reportSuggestion(lastResult)); sync(); notify('No suitable planting spot found. Try a smaller crown.'); return; }
    setSuggestion(`${added > 1 ? `${added} trees added. ` : ''}${reportSuggestion({...lastResult,blockedBefore})}`,next);
    onChange({screeningTrees:next.screeningTrees});
    notify(`${added} screening tree${added === 1 ? '' : 's'} added. Compare the eye-level view, plan and shade.`);
  }

  $('tree-type').addEventListener('change', () => showStock(getTreeType($('tree-type').value), $('tree-stock-preview')));
  $('tree-add').addEventListener('click', () => addTrees());
  $('tree-add-group').addEventListener('click', () => addTrees(3));
  $('tree-duplicate').addEventListener('click', () => addTrees(1,true));
  $('tree-select').addEventListener('change', event => {selectedId=event.target.value; placing=false; suggestion=''; sync(); onViewChange();});
  $('tree-enabled').addEventListener('change', event => patchSelected({enabled:event.target.checked}));
  $('tree-leaf-mode').addEventListener('change', event => {suggestion=''; onChange({treeLeafMode:event.target.value});});
  $('tree-remove').addEventListener('click', () => {
    const trees = getSettings().screeningTrees.filter(tree => tree.id !== selectedId).map(tree => ({...tree}));
    selectedId = trees.at(-1)?.id || null; placing = false; suggestion = '';
    changeTrees(trees);
  });
  $('tree-reset-size').addEventListener('click', () => {
    const tree=selectedTree(), type=getTreeType(tree?.typeId);
    if(type) { patchSelected({...type.dimensions, unitPrice:0}); notify('Supplier-size defaults restored; crown base and depth assumptions remain editable.'); }
  });
  $('tree-place').addEventListener('click', () => {
    if(!selectedTree())return;
    placing=!placing; suggestion='';
    if(placing) {onChange({mode:'plan'}); notify('Tap a soil area on the plan to place the selected tree.');}
    else {sync();onViewChange();}
  });
  $('tree-target').addEventListener('change', () => {suggestion='';sync();});
  $('tree-find-position').addEventListener('click', () => {
    const tree=selectedTree(); if(!tree)return;
    const result=suggest(tree);
    placing=false;
    if(result?.position){
      const trees=getSettings().screeningTrees.map(item=>item.id===selectedId?{...item,...result.tree,...result.position}: {...item});
      setSuggestion(reportSuggestion(result),{...getSettings(),screeningTrees:trees});
      changeTrees(trees);
    }else {setSuggestion(reportSuggestion(result));sync();notify('No suitable position was found for this crown.');}
  });

  function sync() {
    const state=getSettings(), data=getData(), trees=state.screeningTrees || [];
    const targets=(data?.buildings || []).filter(building=>building.kind==='target');
    const targetKey=targets.map(building=>`${building.id}:${building.label}`).join('|');
    if(targetSignature!==targetKey) {
      const previous=$('tree-target').value; $('tree-target').replaceChildren();
      for(const building of targets){const option=document.createElement('option');option.value=building.id;option.textContent=building.label || building.id;$('tree-target').append(option);}
      $('tree-target').value=targets.some(building=>building.id===previous)?previous:(targets.find(building=>/PCK\s*3/i.test(building.label))?.id || targets[0]?.id || '');
      targetSignature=targetKey;
    }
    if(suggestion && suggestionSignature!==screeningSignature(state))suggestion='';
    if(!trees.some(tree=>tree.id===selectedId)) {selectedId=trees.at(-1)?.id || null;placing=false;}
    const key=trees.map(tree=>`${tree.id}:${tree.typeId}:${tree.enabled}`).join('|');
    if(inventorySignature!==key){
      $('tree-select').replaceChildren();
      trees.forEach((tree,index)=>{const option=document.createElement('option');option.value=tree.id;option.textContent=`${index+1}. ${getTreeType(tree.typeId)?.label || 'Tree'}${tree.enabled?'':' · off'}`;$('tree-select').append(option);});
      inventorySignature=key;
    }
    $('tree-select').value=selectedId || '';
    $('tree-editor').hidden=!selectedId;
    $('tree-empty').hidden=trees.length>0;
    $('tree-count').textContent=`${trees.length} / 12`;
    $('tree-add').disabled=trees.length>=12;
    $('tree-add-group').disabled=trees.length>9;
    $('tree-duplicate').disabled=trees.length>=12;
    $('tree-leaf-mode').value=state.treeLeafMode || 'auto';
    $('tree-suggestion').textContent=suggestion;
    $('tree-suggestion').hidden=!suggestion;
    $('tree-place').textContent=placing?'Cancel placement':'Place on plan';
    $('tree-place').setAttribute('aria-pressed',String(placing));
    $('tree-placement-note').hidden=!placing;
    showStock(getTreeType($('tree-type').value), $('tree-stock-preview'));
    const tree=selectedTree(); if(!tree)return;
    const type=getTreeType(tree.typeId);
    $('tree-enabled').checked=tree.enabled;
    $('tree-selected-name').textContent=type.label;
    for(const [key,field] of Object.entries(fields)){
      const [min,max]=field.limits || [field.min,field.max], numeric=$(`tree-${key}-value`), range=$(`tree-${key}`);
      const effectiveMax=key==='crownBase'?Math.min(max,tree.height-.2):max;
      numeric.max=effectiveMax;
      if(document.activeElement!==numeric)numeric.value=Number(tree[key].toFixed(key==='rotation'||key==='unitPrice'?0:2));
      if(range){range.max=effectiveMax;range.value=tree[key];range.style.setProperty('--progress',`${100*(tree[key]-min)/(effectiveMax-min)}%`);}
    }
    const price=screeningTreeUnitPrice(tree);
    $('tree-current-price').textContent=price.status==='quote-required'?'Custom size · plant quote needed':`${money(price.low)} plant only${price.source==='custom'?' · your quote':' · catalog reference'}`;
    $('tree-current-price').classList.toggle('needs-quote',price.status==='quote-required');
    $('tree-price-note').textContent=`${price.reason || type.priceNote} Delivery, lifting and planting are itemised in the budget.`;
    $('tree-dimension-note').textContent=type.dimensionNote;
    const volume=data?screeningTreeVolumes(state,data).find(item=>item.id===tree.id):null;
    const warnings=volume?.warnings || [];
    $('tree-warning').textContent=warnings.join(' ');
    $('tree-warning').hidden=!warnings.length;
    $('tree-foliage-status').textContent=!tree.enabled?'This tree is off: excluded from screening, shade and purchase costs.':!volume?.plantable?'This location is not counted as screening. Move the trunk to a planting area.':volume?.foliageActive?`${type.evergreen?'Evergreen crown':'Leaf-on crown'} is included in privacy and shade. Dense foliage is an approximation.`:'Leaf-off comparison: this deciduous crown does not receive opaque-foliage credit.';
    $('tree-find-position').disabled=!targets.length||state.preset==='front';
    const target=(getAnalysis()?.byBlock || []).find(block=>block.id===$('tree-target').value);
    $('tree-target-current').textContent=state.preset==='front'?'Choose a rear-garden or living-room viewpoint to compare the pine screen against nearby buildings.':target?`${target.label}: ${target.visible} of ${target.total} sampled points remain visible from this viewpoint.`:'';
  }

  return {
    sync,
    cancelPlacement(){placing=false;sync();},
    planOptions(){return {
      selectedTreeId:selectedId,placingTree:placing,
      onTreePick(id){selectedId=id;placing=false;suggestion='';sync();onViewChange();},
      onTreePlace({x,y}){if(!placing||!selectedTree())return;placing=false;patchSelected({x,y});},
    };},
  };
}

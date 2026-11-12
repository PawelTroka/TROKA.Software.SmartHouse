/** Presentation of the editable planning budget; calculations live in costs.js. */
import {getSiteProfile} from './sites.js?v=1.5.0';
const $=id=>document.getElementById(id);
const n=(value,d=1)=>Number(value).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=value=>`${Math.round(value).toLocaleString('pl-PL')} zł`;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function amount(value,rounded=false){
  if(!value)return 'Quote needed';
  const roundedValue=v=>rounded&&v>100?Math.round(v/100)*100:v;
  const low=roundedValue(value.low),high=roundedValue(value.high);
  return `${rounded&&high>0?'≈ ':''}${money(low)}${Math.round(low)!==Math.round(high)?`–${money(high)}`:''}`;
}
const row=(label,quantity,total)=>`<tr><th scope="row">${label}</th><td>${quantity}</td><td>${total}</td></tr>`;
const table=(heading,rows)=>`<div class="budget-table-wrap"><h4>${heading}</h4><table class="budget-table"><thead><tr><th scope="col">Item</th><th scope="col">Quantity / basis</th><th scope="col">PLN</th></tr></thead><tbody>${rows}</tbody></table></div>`;

export function budgetSideLabels(data){
  const profile=getSiteProfile(data?.site?.id||'sternicza-11',data);
  return {rear:'Rear',left:`Left / ${profile.sideLabels.left}`,right:`Right / ${profile.sideLabels.right}`};
}

export function renderBudget(cost,settings,data){
  const h=cost.hedges,e=cost.earthworks,t=cost.screeningTrees;
  $('hedge-cost').textContent=amount(h.total,true);
  $('earthwork-cost').textContent=amount(e.total,true);
  $('combined-cost').textContent=amount(cost.total,true);
  $('hedge-quantity').textContent=h.procurement?`${h.count} trees · ${n(h.length)} m of hedge · ${n(h.spacing,2)} m spacing`:'New trees excluded from this budget';
  $('earthwork-quantity').textContent=e.compactedVolume>0?`${n(e.compactedVolume)} m³ finished · ${n(e.looseVolume)} m³ delivered`:'No soil raise selected';
  if($('screening-tree-cost'))$('screening-tree-cost').textContent=t?`${amount(t.total||t.knownSubtotal,true)}${t.status==='quote-required'?' + quotes':''}`:money(0);
  if($('screening-tree-quantity'))$('screening-tree-quantity').textContent=t?.count
    ?`${t.count} enabled ${t.count===1?'tree':'trees'} · ${amount(t.plantsKnown)} known plant supply${t.plantQuoteCount?` · ${t.plantQuoteCount} specimen ${t.plantQuoteCount===1?'quote':'quotes'} needed`:''}`
    :'No screening trees selected';
  $('cost-status').textContent=cost.status==='quote-required'
    ?`Some plant prices or services need a quote. Known costs: ${amount(cost.knownSubtotal,true)}; this is an incomplete subtotal. Enter specimen prices in Screening trees and service allowances in Budget assumptions.`
    :`PLN planning budget. The upper figure includes ${cost.contingencyPercent}% uncertainty allowance. Site allowances and rates are editable.`;
  $('cost-status').classList.toggle('needs-quote',cost.status==='quote-required');
  const panel=document.querySelector('.cost-panel');
  panel.dataset.status=cost.status;panel.dataset.totalLow=cost.total?.low??'';
  panel.dataset.earthworkLow=e.total.low;panel.dataset.compactedVolume=e.compactedVolume;
  panel.dataset.screeningTreeCount=t?.count||0;panel.dataset.screeningTreeKnownLow=t?.knownSubtotal.low||0;
  const sideLabel=budgetSideLabels(data);
  let plants=h.sides.map(s=>row(`${escape(sideLabel[s.side]||s.side)} · ${n(s.height)} m`,
    `${n(s.length)} m · ${s.count} trees${s.count?`<small>${s.unit.source==='custom'?'Your quote':s.unit.source==='unquoted'?'Custom quote required':'Stock price band'}${s.unit.low!==null?` · ${amount(s.unit)} / tree`:''}</small>`:''}`,
    amount(s.plants))).join('');
  plants+=row('Planting labour',`${h.count} trees × ${money(settings.costPlantingRate)}`,money(h.lines.planting));
  plants+=row('Tree delivery','Whole order allowance',money(h.lines.delivery));
  plants+=row('Lifting / equipment','Editable allowance',money(h.lines.equipment));
  const quantities=`<div class="budget-quantities"><div><span>Garden area to raise</span><strong>${n(e.area)} m²</strong><small>${e.isAreaOverride?'Your area override':'Mapped area after exclusions'}</small></div><div><span>Extra hedge beds</span><strong>${n(e.bedArea)} m²</strong><small>Overlapping corners count once</small></div><div><span>Finished added volume</span><strong>${n(e.compactedVolume)} m³</strong><small>${n(e.gardenVolume)} garden + ${n(e.bedVolume)} extra beds</small></div><div><span>Soil deliveries</span><strong>${e.loads} loads</strong><small>${n(e.truckCapacity,0)} m³/load; bulk and topsoil separate</small></div></div>`;
  let earth=row('Bulk fill material',`${n(e.looseFillVolume)} m³ loose × ${money(settings.costFillRate)}`,money(e.lines.fillMaterial));
  earth+=row('Topsoil material',`${n(e.looseTopsoilVolume)} m³ loose × ${money(settings.costTopsoilRate)}`,money(e.lines.topsoilMaterial));
  earth+=row('Spreading / compaction',`${n(e.compactedVolume)} m³ finished × ${money(settings.costEarthworkRate)}`,money(e.lines.spreading));
  earth+=row('Soil transport',`${e.loads} loads × ${money(settings.costSoilDelivery)}`,money(e.lines.transport));
  earth+=row('Retaining edges','Provisional allowance',money(e.lines.retaining));
  earth+=row('Drainage','Provisional allowance',money(e.lines.drainage));
  earth+=row('Access / preparation','Provisional allowance',money(e.lines.access));
  $('cost-detail-content').innerHTML=table('Thujas by side · supply and installation',plants)+quantities+
    `<p class="field-note">Gross rear area ${n(e.rearGrossArea)} m²; ${n(e.excludedArea)} m² excluded for the pool, terrace and retained structures. Topsoil is included within the selected raise. Loose material uses your ${n(e.looseFactor,2)}× delivery multiplier.</p>`+
    table('Rear-garden earthworks',earth)+
    `<p class="field-note">Line items exclude the ${cost.contingencyPercent}% upper-budget uncertainty allowance. Published plant bands are price references, not a guaranteed current offer. Enter supplier-confirmed final amounts, including applicable tax, for a purchasing budget.</p>`+
    `<ul class="budget-notes">${cost.notes.map(note=>`<li>${escape(note)}</li>`).join('')}</ul>`;
  if($('screening-tree-detail')){
    if(!t?.count){$('screening-tree-detail').innerHTML='';return;}
    let treeRows=t.rows.map((tree,index)=>row(`${index+1}. ${escape(tree.label)}`,
      `${n(tree.height,2)} m tall · ${n(tree.crownWidth,2)} × ${n(tree.crownDepth,2)} m crown<small>${escape(tree.unit.source==='custom'?'Your plant-only quote':tree.unit.source==='unquoted'?'Custom dimensions need a supplier quote':'Published purchased-stock reference')}</small>`,
      amount(tree.plants))).join('');
    const serviceAmount=id=>t.lineStatuses[id]==='quote-required'?'Quote needed':money(t.lines[id]);
    treeRows+=row('Planting',`${t.count} trees × ${money(settings.costScreeningPlanting||0)}`,serviceAmount('planting'));
    treeRows+=row('Anchoring',`${t.count} trees × ${money(settings.costScreeningAnchoring||0)}`,serviceAmount('anchoring'));
    treeRows+=row('Delivery',t.allDeliveryIncluded?'Included in these supplier prices':'One order allowance',serviceAmount('delivery'));
    treeRows+=row('Crane / unloading',t.liftingRequired?'One order allowance':'Not automatically required for these panels',serviceAmount('equipment'));
    treeRows+=row('Irrigation / establishment','One order allowance',serviceAmount('establishment'));
    const unknown=t.rows.filter(tree=>tree.unit.status==='quote-required').map(tree=>`${tree.label}: ${tree.unit.reason}`);
    $('screening-tree-detail').innerHTML=table('Screening trees · purchased plants and services',treeRows)+
      `<p class="field-note">${t.status==='quote-required'?'Known costs only':'Planning subtotal'}: ${amount(t.knownSubtotal,true)}. ${t.status==='quote-required'?'Unquoted plants or services are excluded; this is not a complete installed price. ':''}Disabled trees are excluded. Catalog Wyplatane panels include delivery; custom plant-only quotes and other suppliers use one separate delivery allowance.</p>`+
      (unknown.length?`<ul class="budget-notes">${unknown.map(note=>`<li>${escape(note)}</li>`).join('')}</ul>`:'')+
      `<p class="field-note">Tree sizes describe stock at purchase, not mature growth. The upper subtotal includes the same ${cost.contingencyPercent}% uncertainty allowance once; line items above exclude it. Pine and broad-hornbeam catalog amounts include VAT. Confirm the tax basis of the displayed Serbian spruce and pleached-hornbeam amounts.</p>`;
  }
}

function sourceLink(source){
  const a=document.createElement('a');
  try{const url=new URL(source.url);if(url.protocol!=='https:')return null;a.href=url.href;}catch{return null;}
  a.textContent=source.title;a.target='_blank';a.rel='noopener noreferrer';return a;
}
export function renderPriceSources(sources){
  $('price-date').textContent=`Reviewed ${sources.reviewedAt}. ${sources.taxNote}`;
  const list=$('cost-source-list');list.replaceChildren();
  for(const source of sources.sources||[]){
    const link=sourceLink(source);if(!link)continue;
    const li=document.createElement('li'),detail=document.createElement('small');
    detail.textContent=source.priceBasis;li.append(link,detail);list.append(li);
  }
  if(sources.tallStockReferences?.length){
    const intro=document.createElement('li');intro.className='tall-stock-intro';intro.textContent='Tall-tree references · enter your own quote above 4 m';list.append(intro);
    for(const source of sources.tallStockReferences){
      const link=sourceLink(source);if(!link)continue;
      const li=document.createElement('li'),detail=document.createElement('small');
      const height=Array.isArray(source.heightM)?source.heightM.join('–'):String(source.heightM);
      detail.textContent=`${source.cultivar}, ${height} m: ${money(source.pricePLN)} / tree. ${source.taxBasis}. ${source.note}`;
      li.append(link,detail);list.append(li);
    }
  }
}

export function renderTreePriceSources(sources){
  const date=$('tree-price-date'),list=$('tree-source-list');
  if(date)date.textContent=`Reviewed ${sources.reviewedAt}. ${sources.summary}`;
  if(!list)return;
  list.replaceChildren();
  for(const source of [...(sources.sources||[]),...(sources.plantSuitability||[])]){
    const link=sourceLink(source);if(!link)continue;
    const li=document.createElement('li'),detail=document.createElement('small');
    detail.textContent=source.priceBasis||source.note||'';
    li.append(link,detail);list.append(li);
  }
}

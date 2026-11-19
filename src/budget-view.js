/** Presentation of the editable planning budget; calculations live in costs.js. */
import {getSiteProfile} from './sites.js?v=1.27.0';
import {GARDEN_PRICE_REFERENCES} from './garden-budget-catalog.js?v=1.27.0';
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
const statusLabel=status=>({'planning-allowance':'Planning allowance · not a supplier quote','user-quote':'Your quote / allowance',
  'quote-required':'Quote required','catalog-reference':'Catalog reference','included-or-not-required':'Included / not required'}[status]||status);
function installedRows(items){
  return items.map(item=>{
    const references=(item.referenceIds||[]).map(id=>GARDEN_PRICE_REFERENCES.find(source=>source.id===id)).filter(Boolean);
    const links=references.map(source=>`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(item.referenceLabels?.[source.id]||source.title)}</a>`).join(' · ');
    return row(escape(item.label),`${escape(item.basis)}<small>${escape(statusLabel(item.priceStatus))}</small><small>${escape(item.scope)}</small>${links?`<small>Product benchmark: ${links}</small>`:''}`,amount(item.cost));
  }).join('');
}

export function budgetSideLabels(data){
  const profile=getSiteProfile(data?.site?.id||'sternicza-11',data);
  return {rear:'Rear',left:`Left / ${profile.sideLabels.left}`,right:`Right / ${profile.sideLabels.right}`,
    ...(data?.site?.edgeLabels?.front?{front:data.site.edgeLabels.front}:{})};
}

export function renderBudget(cost,settings,data){
  const h=cost.hedges,e=cost.earthworks,t=cost.screeningTrees;
  const spa=cost.spa,garden=cost.garden,privacy=cost.privacy,basementGarage=cost.basementGarage,balcony=cost.balcony,style=cost.style;
  const balconyMissing=balcony?.unquoted.length?' The first-floor balcony also needs a complete installed quote; its unquoted scope is excluded.':'';
  if($('balcony-cost-summary'))$('balcony-cost-summary').textContent=balcony?.enabled
    ?balcony.unquoted.length?'First-floor balcony: quote required. Its structure, foundations, deck, guards and access door are excluded from the known subtotal, even with planning allowances on.':`First-floor balcony: ${amount(balcony.knownBase)} installed quote, before the shared uncertainty allowance. Replaces the canopy cost.`
    :'The balcony quote applies only while balcony mode is selected and the terrace cover is enabled.';
  if($('privacy-cost-summary'))$('privacy-cost-summary').textContent=privacy?.enabled
    ?privacy.unquoted.length?`${privacy.unquoted.length} privacy ${privacy.unquoted.length===1?'structure needs an installed quote':'structures need installed quotes'}. Known privacy costs: ${amount(privacy.knownBase)}. Unquoted work is excluded from the known budget; planning allowances do not price these structures.`
      :`Privacy structures: ${amount(privacy.knownBase)} in installed quotes, before the shared uncertainty allowance. Terrace canopy priced separately.`
    :'Quotes apply only while the corresponding structure is selected. Terrace canopy priced separately.';
  if($('spa-cost'))$('spa-cost').textContent=spa?.status==='quote-required'?(spa.knownBase.low>0?`${amount(spa.knownSubtotal,true)} + quotes`:'Quote needed'):amount(spa?.total);
  if($('spa-quantity'))$('spa-quantity').textContent=spa?.enabled?spa.planningEnabled
    ?`${spa.rows.length} installed items · ${spa.rows.filter(row=>row.quoted).length} quote overrides`
    :`${spa.rows.filter(row=>row.quoted).length} of ${spa.rows.length} installed allowances entered`:'No spa programme selected';
  if($('spa-cost-detail'))$('spa-cost-detail').innerHTML=spa?.enabled?table(escape(spa.scopeLabel||'Spa construction · installed scope'),installedRows(spa.rows))+
    `<p class="field-note">Each full installation is counted once. Catalog product prices are separate benchmarks, not extra additions or received site quotations. ${spa.scopeId==='pool-and-jacuzzi'?'The compact jacuzzi is a size placeholder; seating capacity, model and service access need supplier confirmation. Confirm the mapped ks200 sewer route before fixing pool siting.':spa.overflow?'Custom overflow is a complete bespoke allowance; the factory Vienna spa is not certified for this conversion.':'The seven-seat spa retains its factory shell; removable terrace hatches preserve technical access.'}</p>`:'';
  if($('garden-cost-card'))$('garden-cost-card').hidden=!garden?.enabled;
  if($('garden-cost'))$('garden-cost').textContent=garden?.enabled?`${amount(garden.total||garden.knownSubtotal,true)}${garden.status==='quote-required'?' + quotes':''}`:money(0);
  if($('garden-quantity'))$('garden-quantity').textContent=garden?.enabled?`${garden.rows.length} garden-work lines · ${n(garden.quantities.terraceNet)} m² terrace finish`:'Additional garden scope not selected';
  if($('garden-cost-detail'))$('garden-cost-detail').innerHTML=garden?.enabled?table('Garden finishes and enabling work',installedRows(garden.rows))+
    '<p class="field-note">Mapped quantities and design assumptions are shown separately. The 20% ornamental-bed share, 12 baseline lighting fittings and unit rates are provisional. Garden pendants and hedge lanterns add their illustrated quantities using the same generic lighting rate; shade and support prices need a complete installed quote. Replace totals in Budget assumptions. These items exclude spa equipment, hedge / specimen supply and bulk garden fill.</p>':'';
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
    ?style?.unquoted.length
      ?`The selected design style needs an additional upgrade quote. Known base costs: ${amount(cost.knownSubtotal,true)}; style-specific finishes${style.houseFinishPreview?' and house renovation':''} are unquoted. Review all unquoted work in the expanded budget.`
      :basementGarage?.unquoted.length
      ?`The basement garage and ramp need a complete project quote. Known costs: ${amount(cost.knownSubtotal,true)}; this is an incomplete subtotal. Garden allowances do not cover basement conversion.${balconyMissing}`
      :privacy?.unquoted.length
      ?`Selected privacy structures need installed quotes. Known costs: ${amount(cost.knownSubtotal,true)}; this is an incomplete subtotal. Planning allowances do not price these custom structures. Review the unquoted items in the expanded budget.${balconyMissing}`
      :balcony?.unquoted.length
      ?`The first-floor balcony needs a complete installed project quote. Known costs: ${amount(cost.knownSubtotal,true)}; this is an incomplete subtotal. Planning allowances do not price its structure, foundations, guards or access door.`
      :`Some plants, services or garden installations need a quote. Known costs: ${amount(cost.knownSubtotal,true)}; this is an incomplete subtotal. Enter specimen prices and installed quotes, or enable planning allowances.`
    :`PLN ${garden?.enabled?(h.fullPerimeter?'rear garden + full perimeter hedges':h.sides.some(side=>side.side==='front')?'rear garden + front hedge':'rear-garden'):'planning'} budget. The upper figure includes ${cost.contingencyPercent}% uncertainty allowance once. ${cost.planningEnabled?'Installed ranges are planning assumptions, not received supplier quotes.':'Site allowances and rates are editable.'}`;
  $('cost-status').classList.toggle('needs-quote',cost.status==='quote-required');
  const panel=document.querySelector('.cost-panel');
  panel.dataset.status=cost.status;panel.dataset.totalLow=cost.total?.low??'';
  panel.dataset.earthworkLow=e.total.low;panel.dataset.compactedVolume=e.compactedVolume;
  panel.dataset.screeningTreeCount=t?.count||0;panel.dataset.screeningTreeKnownLow=t?.knownSubtotal.low||0;
  panel.dataset.gardenKnownLow=garden?.knownBase.low||0;panel.dataset.planningEnabled=cost.planningEnabled?'true':'false';
  panel.dataset.privacyKnownLow=privacy?.knownBase.low||0;panel.dataset.privacyUnquotedCount=privacy?.unquoted.length||0;
  panel.dataset.basementGarageKnownLow=basementGarage?.knownBase.low||0;panel.dataset.basementGarageUnquotedCount=basementGarage?.unquoted.length||0;
  panel.dataset.balconyKnownLow=balcony?.knownBase.low||0;panel.dataset.balconyUnquotedCount=balcony?.unquoted.length||0;
  panel.dataset.styleKnownLow=style?.knownBase.low||0;panel.dataset.styleUnquotedCount=style?.unquoted.length||0;
  const sideLabel={front:'Front / street',...budgetSideLabels(data)};
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
    `<p class="field-note">Gross rear area ${n(e.rearGrossArea)} m²; ${n(e.excludedArea)} m² excluded for the pool, terrace${spa?.enabled&&spa.scopeId!=='pool-and-jacuzzi'?', sauna, sunken lounge, cold plunge':''} and retained structures. Topsoil is included within the selected raise. Loose material uses your ${n(e.looseFactor,2)}× delivery multiplier.</p>`+
    table('Rear-garden earthworks',earth)+
    (style?.enabled?table('Selected design style · incremental upgrade',installedRows(style.rows))+
      '<p class="field-note">Base finish, furniture and lighting lines remain included. This line covers only the additional installed upgrade after reconciling that base scope. No supplier specification or style premium is inferred from the visual. Zero is unquoted and excluded.</p>':'')+
    (privacy?.enabled?table('Privacy structures · installed quotes',installedRows(privacy.rows))+
      '<p class="field-note">Custom structures are quote-only. Unquoted work is excluded from the known subtotal, even with planning allowances on. The terrace canopy is counted separately in garden finishes.</p>':'')+
    (basementGarage?.enabled?table('Basement garage and ramp · separate project quote',installedRows(basementGarage.rows))+
      '<p class="field-note">The clearance model does not establish structural feasibility or an installed price. A zero quote remains unpriced; garden earthworks, drainage and retaining allowances do not cover this conversion.</p>':'')+
    (balcony?.enabled?table('First-floor balcony · separate installed project quote',installedRows(balcony.rows))+
      '<p class="field-note">The balcony replaces the canopy, so no canopy rate is added. A zero quote means unpriced work excluded from the known subtotal, even with planning allowances on. The quote must cover the structural proposal, foundations, waterproofing, guards and first-floor access. Ground-floor terrace finishes remain a separate scope.</p>':'')+
    `<p class="field-note">Line items exclude the ${cost.contingencyPercent}% upper-budget uncertainty allowance. Published plant bands are price references, not a guaranteed current offer. Enter supplier-confirmed final amounts, including applicable tax, for a purchasing budget.</p>`+
    `<ul class="budget-notes">${cost.notes.map(note=>`<li>${escape(note)}</li>`).join('')}</ul>`;
  if($('screening-tree-detail')){
    if(!t?.count){$('screening-tree-detail').innerHTML='';return;}
    let treeRows=t.rows.map((tree,index)=>row(`${index+1}. ${escape(tree.label)}`,
      `${n(tree.height,2)} m tall · ${n(tree.crownWidth,2)} × ${n(tree.crownDepth,2)} m crown<small>${escape(tree.unit.source==='custom'?'Your plant-only quote':tree.unit.source==='unquoted'?'Custom dimensions need a supplier quote':tree.unit.source==='catalog-assumption'?'Catalog price; crown width assumed':'Published purchased-stock reference')}</small><small>${escape(tree.taxNote||'')}</small>`,
      amount(tree.plants))).join('');
    for(const service of t.serviceRows||[]){
      const basis=service.id==='delivery'&&t.allDeliveryIncluded?'Included in these supplier prices':service.basis;
      treeRows+=row(escape(service.label),`${escape(basis)}<small>${escape(statusLabel(service.priceStatus))}</small>`,amount(service.cost));
    }
    const unknown=t.rows.filter(tree=>tree.unit.status==='quote-required').map(tree=>`${tree.label}: ${tree.unit.reason}`);
    $('screening-tree-detail').innerHTML=table('Screening trees · purchased plants and services',treeRows)+
      `<p class="field-note">${t.status==='quote-required'?'Known costs only':'Planning subtotal'}: ${amount(t.knownSubtotal,true)}. ${t.status==='quote-required'?'Unquoted plants or services are excluded; this is not a complete installed price. ':''}Disabled trees are excluded. Catalog Wyplatane panels include delivery; custom plant-only quotes and other suppliers use one separate delivery allowance.</p>`+
      (unknown.length?`<ul class="budget-notes">${unknown.map(note=>`<li>${escape(note)}</li>`).join('')}</ul>`:'')+
      `<p class="field-note">Prices refer to purchased stock; crown dimensions marked as assumptions are editable examples. The upper subtotal includes the same ${cost.contingencyPercent}% uncertainty allowance once. Markflor Brabant is net, with VAT additional. Fischer and Wyplatane tax treatment needs confirmation; De Bruyn website prices include VAT unless otherwise stated. This comparison combines published price bases, not tax-normalised purchasing quotes.</p>`;
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

export function renderGardenPriceSources(sources){
  const date=$('garden-price-date'),list=$('garden-source-list');
  if(date)date.textContent=`Reviewed ${sources.reviewedAt}. ${sources.summary}`;
  if(!list)return;
  list.replaceChildren();
  for(const source of sources.sources||[]){
    const link=sourceLink(source);if(!link)continue;
    const li=document.createElement('li'),detail=document.createElement('small');
    const price=source.from?`From ${money(source.low)}`:amount(source);
    detail.textContent=`Catalog reference · ${price}. ${source.tax} ${source.scope}`;
    li.append(link,detail);list.append(li);
  }
}

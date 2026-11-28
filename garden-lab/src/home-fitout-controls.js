import {LIVING_CINEMA_LAYOUTS,getLivingCinemaLayout} from './living-cinema.js?v=1.40.0';
import {luxuryKitchenSchedule} from './luxury-kitchen.js?v=1.40.0';

export function fillCinemaOptions(select){
  select.replaceChildren(...LIVING_CINEMA_LAYOUTS.map(layout=>new Option(`${layout.letter} · ${layout.label}${layout.recommended?' · Recommended':''}`,layout.id)),new Option('Earlier saved arrangement','legacy'));
}

export function syncCinemaControls(select,note,state){
  select.value=state.livingCinemaLayout||'legacy';
  const layout=getLivingCinemaLayout(state.livingCinemaLayout);
  note.textContent=state.livingCinemaLayout==='legacy'||!state.livingCinemaLayout
    ?'This saved design keeps its earlier arrangement. Choose A–D to compare the new living-room proposals.'
    :layout.summary;
}

/** A fixed, readable inventory remains available when labels are hidden. */
export function renderKitchenSchedule(host){
  const list=document.createElement('dl');list.className='kitchen-equipment-schedule';
  for(const item of luxuryKitchenSchedule()){
    const row=document.createElement('div'),title=document.createElement('dt'),detail=document.createElement('dd');
    title.textContent=item.label;
    detail.textContent=item.detail;
    if(item.hidden){const tag=document.createElement('span');tag.className='equipment-concealed';tag.textContent='Concealed';title.append(' ',tag);}
    if(item.reference){
      const source=item.url?document.createElement('a'):document.createElement('span');
      source.textContent=item.reference;
      if(item.url){source.href=item.url;source.target='_blank';source.rel='noopener noreferrer';}
      source.className='equipment-reference';detail.append(source);
    }
    row.append(title,detail);list.append(row);
  }
  host.replaceChildren(list);
}

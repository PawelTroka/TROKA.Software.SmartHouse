/** Three-track lift-and-slide proposal shared by rendering and walking.
 * Offsets are measured along the host wall. The two moving leaves stack over
 * the left fixed leaf; the mechanism opens two thirds of the clear span.
 * Dimensions describe a visual proposal, not an approved product or lintel.
 */
export const HST_FRAME_WIDTH = .028;
export const HST_TRACK_PITCH = .047;
function stackingPanelLayout(opening, settings = {}, count = 3, control = 'hstOpen') {
  const start = Number(opening.offset ?? opening.lo ?? 0);
  const width = Number(opening.width ?? (opening.hi - opening.lo));
  const raw = Number(settings[control] ?? opening.openFraction ?? 1);
  const open = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
  const frame = Math.min(HST_FRAME_WIDTH, Math.max(.005, width / 20));
  const left = start + frame, right = start + width - frame;
  const pitch = Math.max(0, (right - left) / count);
  const panels = Array.from({length: count}, (_, index) => {
    const lo = left + index * pitch * (1 - open);
    return {index, lo, hi: lo + pitch, width: pitch,
      centre: lo + pitch / 2, track: index * HST_TRACK_PITCH,
      fixed: index === 0, frameWidth: frame / 2};
  });
  const clearLo = panels[count-1].hi;
  const clear = {lo: clearLo, hi: right, width: Math.max(0, right - clearLo)};
  return {open, control, start, width, frameWidth: frame, panels, clear,
    blocked: panels.map(({lo, hi}) => ({lo, hi})),
    maximumClearWidth: (count-1) * pitch, stackSide: 'left', tracks: count};
}
export const hstPanelLayout=(opening,settings={})=>stackingPanelLayout(opening,settings,3);
/** Upper doors share the three-track mechanism and the stacked-open default,
 * but have their own control so the terrace and balcony can operate separately. */
export const balconyPanelLayout=(opening,settings={})=>stackingPanelLayout(opening,settings,3,'balconyOpen');
export const slidingPanelLayout=(opening,settings={})=>(opening.type||opening.kind)==='balcony-door'
  ?balconyPanelLayout(opening,settings):hstPanelLayout(opening,settings);

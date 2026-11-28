/** Camera and display choices for the shared drawing-based house. */
import {DESIGN_STYLES} from './design-styles.js?v=1.40.0';

export const INTERIOR_DEFAULTS=Object.freeze({
  interiorEnabled:false,interiorLayout:'existing',interiorFloor:'ground',
  interiorStyle:'follow',interiorView:'dollhouse',interiorRoomId:'',
  interiorFurniture:true,interiorChanges:false,planExteriorApplied:false,
  officeCoworking:true,officeGuestBedOpen:false,gymBenchParked:true,
  livingCinemaLayout:'right-media',showEquipmentLabels:true,
});
export const INTERIOR_STRING_KEYS=Object.freeze(['interiorLayout','interiorFloor','interiorStyle','interiorView','interiorRoomId','livingCinemaLayout']);
export function sanitizeInteriorState(input={},siteId='sternicza-11'){
  const out={...INTERIOR_DEFAULTS};
  if(!input||typeof input!=='object'||Array.isArray(input))return out;
  for(const key of ['interiorEnabled','interiorFurniture','interiorChanges','planExteriorApplied','officeCoworking','officeGuestBedOpen','gymBenchParked','showEquipmentLabels'])if(typeof input[key]==='boolean')out[key]=input[key];
  if(['legacy','right-media','left-media','garden-salon','crosswall-media'].includes(input.livingCinemaLayout))out.livingCinemaLayout=input.livingCinemaLayout;
  if(['existing','renovation'].includes(input.interiorLayout))out.interiorLayout=input.interiorLayout;
  if(['ground','first','basement','attic'].includes(input.interiorFloor))out.interiorFloor=input.interiorFloor;
  if(['dollhouse','plan','room'].includes(input.interiorView))out.interiorView=input.interiorView;
  if(input.interiorStyle==='follow'||DESIGN_STYLES.some(style=>style.id===input.interiorStyle))out.interiorStyle=input.interiorStyle;
  if(typeof input.interiorRoomId==='string'&&/^[a-z0-9_-]{0,64}$/i.test(input.interiorRoomId))out.interiorRoomId=input.interiorRoomId;
  if(siteId!=='sternicza-11'){out.interiorEnabled=false;out.planExteriorApplied=false;}
  return out;
}

/** Architectural garden proposals in site metres. These feed the existing pool,
 * excavation, sunlight, privacy, plan and budget models; they are not overlays. */
import {summerGardenEnabled,SUMMER_POOL,SUMMER_FIREPIT,summerGardenFurniture} from './summer-garden.js?v=1.36.0';
import {MINIMAL_STYLE_DEFINITIONS} from './minimal-style-definitions.js?v=1.36.0';
const rect=(x,y,width,length)=>Object.freeze({x,y,width,length});
const scheme=(name,pool,firepit,dining,loungers,path,beds)=>Object.freeze({
  name,pool:rect(...pool),firepit:Object.freeze(firepit),dining:rect(...dining),
  loungers:Object.freeze(loungers.map(Object.freeze)),path:Object.freeze(path.map(Object.freeze)),
  beds:Object.freeze(beds.map(b=>rect(...b))),
});
export const RENOVATION_GARDEN_SCHEMES=Object.freeze({
  retreat:scheme('Pool and sheltered retreat',
    [14.52,26.3,3.5,8],[8.4,27.2],[3.4,24.4,3.8,3.4],[[12.4,23.65],[13.45,23.65]],
    [[6.2,29.1],[5.7,30.8],[5.2,32.5]],[[1.45,24.3,.62,6.3],[11.8,32.7,1.2,1.5]]),
  courtyard:scheme('Dining court and garden rooms',
    [14.52,26.3,3.5,7.5],[8.1,30],[3.0,26.1,4.1,3.7],[[11.95,24],[13.0,24]],
    [[6.4,23.5],[6.4,24.8],[6.4,30.7],[5.8,32.4]],[[1.4,25.4,.70,6.8],[8.1,28.5,3.2,.55]]),
  gallery:scheme('Linear pool and open gallery',
    [2,25.1,3.5,8],[8.3,29.8],[13.7,24.2,4.0,3.6],[[6.4,25.1],[7.5,25.1]],
    [[10.8,23.75],[10.8,24.9],[10.8,26.3],[10.8,27.7],[6.4,32.7]],[[6.8,28.2,.70,3.8],[13.5,31.1,3.8,.65]]),
  dune:scheme('Boardwalk and barefoot lounge',
    [14.52,26.3,3.5,8],[7.4,29.0],[2.9,24.5,3.8,3.6],[[12.2,23.8],[13.25,23.8]],
    [[6.0,28.4],[5.7,30.0],[5.2,31.6],[4.8,33.0]],[[1.35,23.9,.65,5.6],[12.1,29.0,1.0,4.2]]),
  social:scheme('Pool club and evening dining',
    [2,25,3.5,8],[8.1,30],[12.7,24.2,4.8,3.8],[[6.3,25.0],[7.4,25.0]],
    [[10.8,23.75],[10.8,25],[10.8,26.4],[10.8,27.8],[6.35,32.7]],[[1.2,24,.4,8],[13.3,31.2,3.8,.7]]),
  mineral:scheme('Mineral court and sunken salon',
    [14.1,26.2,3.5,8],[7.1,29.3],[2.6,24.5,4.0,3.5],[[10.8,23.8],[11.9,23.8]],
    [[5.7,28.4],[5.8,30.0],[5.4,31.6],[4.9,33.0]],[[1.35,23.8,.55,6],[11.9,28.3,1.05,4.6]]),
});
const styles={
  'organic-modern':['mineral','Sculpted mineral courts, a sunken conversation room and a long swimming pool.'],
  'hidden-bali':['retreat','Teak boardwalks, woven daybeds, layered planting and a sheltered dining court.'],
  'mediterranean-villa':['courtyard','A generous terracotta dining court, herb beds and a separate sunken salon.'],
  'modern-minimal':['gallery','A long lap pool, aligned paths, open lawn and a quiet dining gallery.'],
  scandinavian:['gallery','A simple pool axis, open timber dining and restrained planting borders.'],
  japandi:['retreat','Low facing seats, quiet stepping stones and a planted edge behind the dining court.'],
  'organic-scandinavian':['dune','Soft planting beside a timber walk and a relaxed outdoor sitting room.'],
  'organic-japandi':['mineral','An asymmetric stone court, paired low seating and a long planted edge.'],
  'space-age':['social','A long pool, sculptural lounge islands and a large round-table court.'],
  'party-club':['social','An enlarged dining court facing the pool, with an evening fire lounge.'],
  'baltic-dune':['dune','Weathered boardwalks, wind-softened grass beds and an informal canvas lounge.'],
  coastal:['courtyard','A seaside dining court with white framed furniture, herb beds and a sheltered resting court.'],
  'beach-house':['dune','Wide bleached boards connect a linen daybed, a quiet fire lounge and the spa garden.'],
  'gdansk-brick':['courtyard','Brick garden rooms separate supper, resting, swimming and the evening fire.'],
  'danish-midcentury':['gallery','A long pool, teak dining court and open sculptural furniture on a clear garden axis.'],
  'finnish-sauna':['retreat','Timber resting platforms link the sauna, plunge and sheltered outdoor dining.'],
  'riviera-deco':['social','A generous supper court, geometric planted bands and a poolside salon.'],
  'arts-and-crafts':['courtyard','An oak dining court, herb borders and an intimate fire room.'],
  'palm-springs':['social','A pool-club garden with bright sling seating, a generous table and open social court.'],
  'desert-modern':['mineral','Monolithic stone seating, restrained planted strips and an earthen dining court.'],
  'alpine-lodge':['retreat','Broad timber courts, deep lounge furniture and a warm sauna-side retreat.'],
  'industrial-loft':['gallery','A long pool beside a concrete dining gallery, steel furniture and a sheltered resting court.'],
  ...Object.fromEntries(MINIMAL_STYLE_DEFINITIONS.map(style=>[style.id,style.gardenLayout])),
};
export const RENOVATION_GARDEN_RECIPES=Object.freeze(Object.fromEntries(Object.entries(styles)
  .map(([id,[scheme,description]])=>[id,Object.freeze({id,scheme,description,...RENOVATION_GARDEN_SCHEMES[scheme]})])));

export function getRenovationGardenRecipe(settings={},data){
  if(settings.styleGardenLayout===false||settings.pavilionEnabled===true||
    (data?.site?.id||settings.siteId||'sternicza-11')!=='sternicza-11'||
    !(settings.gardenProgram||'').startsWith('spa'))return null;
  const recipe=RENOVATION_GARDEN_RECIPES[settings.designStyle]||null;
  return recipe&&summerGardenEnabled(settings,data)?{...recipe,pool:SUMMER_POOL,firepit:SUMMER_FIREPIT,
    ...summerGardenFurniture(settings),name:`${recipe.name} · left-edge pool`}:recipe;
}

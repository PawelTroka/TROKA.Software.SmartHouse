// Kitchen modules in metres. A niche is a clear appliance opening; cabinet
// sides and end panels are accounted for separately instead of shrinking it.
const item=(id,kind,label,x,z,width,depth,extra={})=>({id,kind,label,roomId:'front-kitchen',x,z,width,depth,rotation:0,...extra});
const fixed=entry=>Object.freeze(entry);
export const KITCHEN_APPLIANCE_REFERENCES=Object.freeze({
  dishwasher:fixed({name:'Miele G 7985 SCVi XXL AutoDos K2O',width:.598,height:.845,depth:.550,nicheWidth:.600,nicheHeight:[.845,.910],nicheDepth:.550,openDepth:1.205,
    url:'https://www.miele.pl/product/12440470/zmywarka-w-pelni-zintegrowana-xxl-g-7985-scvi-xxl-autodos-k2o-cleansteel-obsidianblack'}),
  steamOven:fixed({name:'Miele DGC 7865 HC Pro',width:.595,height:.596,depth:.567,capacityLitres:67,nicheWidth:[.560,.568],nicheHeight:[.590,.595],nicheDepth:.550,plumbed:true,
    url:'https://www.miele.pl/product/12100920/piekarnik-parowy-z-przylaczem-do-wody-i-odplywu-dgc-7865-hc-pro-obsidianblack'}),
  speedOven:fixed({name:'Miele H 7840 BM',width:.595,height:.456,depth:.563,capacityLitres:43,microwaveWatts:1000,nicheWidth:[.560,.568],nicheHeight:[.450,.452],nicheDepth:.550,
    url:'https://www.miele.pl/product/11105960/kompaktowy-piekarnik-z-kuchnia-mikrofalowa-h-7840-bm-stal-nierdzewna-czysta-stal'}),
  fridge:fixed({name:'Bosch KFN96AXEA four-door fridge-freezer',width:.905,height:1.830,depth:.731,
    url:'https://www.bosch-home.pl/pl/mkt-product/chlodzenie-i-zamrazanie/chlodziarko-zamrazarki/chlodziarko-zamrazarki/KFN96AXEA'}),
  sink:fixed({name:'Franke Box Center BWX 220-54-27',width:.860,depth:.510,height:.200,minimumBase:.900,bowlWidths:[.540,.270],
    url:'https://www.franke.com/pl/pl/home-solutions/produkty/mythos/product-detail-page.html/127.0557.961.html'}),
  wineCooler:fixed({name:'Miele KWT 6322 UG-1',width:.596,height:.816,depth:.570,nicheWidth:.600,nicheHeight:[.820,.870],nicheDepth:.580,minimumVentAreaCm2:430,
    url:'https://media.miele.com/downloads/l-/pl/FS_12497000_PLP_PL-pl.pdf'}),
});
const reference=key=>({referenceEquipment:KITCHEN_APPLIANCE_REFERENCES[key].name,referenceUrl:KITCHEN_APPLIANCE_REFERENCES[key].url,productDimensions:{...KITCHEN_APPLIANCE_REFERENCES[key]}});
const secondaryWidth=options=>options.secondaryDishwasherWidth===.45?.45:.60;

export const KITCHEN_MODULES=Object.freeze([
  fixed({id:'wet-end-front',run:'sink',width:.020,kind:'end-panel'}),
  fixed({id:'dishwasher-1',run:'sink',width:.600,kind:'clear-niche',assignment:'Main dishwasher'}),
  fixed({id:'sink-base',run:'sink',width:1.010,kind:'cabinet',sideThickness:.018,assignment:'Workstation sink, waste sorting and cleaning pull-outs'}),
  fixed({id:'dishwasher-2',run:'sink',width:.600,kind:'clear-niche',assignment:'Second dishwasher'}),
  fixed({id:'wet-end-rear',run:'sink',width:.020,kind:'end-panel'}),
  fixed({id:'peninsula-corner',run:'peninsula',width:.650,kind:'blind-corner',assignment:'Access from dining side for serving dishes'}),
  fixed({id:'peninsula-drawers',run:'peninsula',width:.900,kind:'drawers',assignment:'Cutlery top, daily crockery middle, deep pans below'}),
  fixed({id:'wine-cooler',run:'peninsula',width:.600,kind:'clear-niche',assignment:'Two-zone wine storage with front ventilation'}),
  fixed({id:'peninsula-end',run:'peninsula',width:.050,kind:'end-panel'}),
  fixed({id:'cooking-corner',run:'cooking',width:1.200,kind:'blind-corner',assignment:'Swing-out corner baskets through a 520 mm access front'}),
  fixed({id:'hob-drawers',run:'cooking',width:.900,kind:'drawers',assignment:'Utensils and pots below the induction hob'}),
  fixed({id:'preparation-drawers',run:'cooking',width:.900,kind:'drawers',assignment:'Knives, boards, food containers and pans'}),
  fixed({id:'spice-pullout',run:'cooking',width:.410,kind:'pull-out',assignment:'Oils, spices and tall bottles'}),
  fixed({id:'fridge-bay',run:'tall',width:.960,kind:'appliance-bay',assignment:'Four-door fridge-freezer with side and rear allowances'}),
  fixed({id:'oven-tower',run:'tall',width:.600,kind:'tower',assignment:'Full combi-steam oven and separate microwave/speed oven'}),
  fixed({id:'nutrition-pantry',run:'tall',width:.550,kind:'pantry',assignment:'Hidden protein powders, supplements and small appliances'}),
  fixed({id:'pantry-corner',run:'tall',width:.550,kind:'corner-pantry',assignment:'Filled corner for bulk supplies and occasional appliances'}),
]);

export function luxuryKitchenSchedule(options={}){
  const second=secondaryWidth(options),r=KITCHEN_APPLIANCE_REFERENCES;
  const row=(id,label,width,depth,height,detail,ref=null,hidden=false,category='appliance')=>({id,label,width,depth,height,detail,
    reference:ref?.name||null,url:ref?.url||null,hidden,category});
  return [
    row('kitchen-dishwasher-1','Dishwasher 1 · 60 cm',.60,.65,.845,'Fully integrated XXL AutoDos; 600 mm clear niche beside the sink.',r.dishwasher,true),
    row('kitchen-dishwasher-2',`Dishwasher 2 · ${Math.round(second*100)} cm`,second,.65,.845,second===.60?'Second full-size XXL dishwasher; the pair fits the measured wet run.':'Slimline appliance allowance; the released 150 mm becomes tray storage.',second===.60?r.dishwasher:null,true),
    row('sink-base','Workstation sink and waste · 101 cm',1.01,.65,.90,'860 × 510 mm two-bowl workstation sink; waste-sorting pull-out and cleaning storage below.',r.sink,true,'worktop'),
    row('kitchen-steam-oven','Combi-steam oven · 67 L',.60,.63,.596,'Plumbed Miele Diamond oven with HydroClean, installed in a 600 mm tower.',r.steamOven),
    row('kitchen-speed-oven','Microwave / speed oven · 43 L',.60,.63,.456,'Separate compact oven with 1000 W microwave above the combi-steam oven.',r.speedOven),
    row('kitchen-fridge','Four-door fridge-freezer · 96 cm bay',.96,.79,1.83,'905 mm product in a wider ventilated bay; 731 mm body depth plus rear allowance. Final hinge clearances follow its installation drawing.',r.fridge),
    row('kitchen-wine-cooler','Wine cooler · 60 cm',.60,.85,.816,'Undercounter two-zone cooler in the peninsula; modeled grille gives at least 430 cm² free ventilation.',r.wineCooler),
    row('kitchen-nutrition-pantry','Hidden nutrition pantry · 55 cm',.55,.63,2.70,'Closed, labelled storage for powder tubs, supplements, a blender and compact appliances; deep pull-outs keep the contents reachable.',null,true,'storage'),
    row('kitchen-pantry-corner','Full-height corner pantry · 55 cm',.55,.63,2.70,'Fills the retained corner with bulk-food and occasional-appliance storage.',null,true,'storage'),
    row('peninsula-drawers','Peninsula drawers · 90 cm',.90,.85,.90,'Cutlery above, crockery in the middle and deep pan drawers below.',null,true,'storage'),
    row('cooking-corner','Corner pull-out · 120 cm',1.20,.62,.90,'A 520 mm access front serves swing-out baskets in the blind corner.',null,true,'storage'),
    row('cooking-drawers','Cooking and preparation drawers · 180 cm',1.80,.62,.90,'Two 900 mm drawer stacks divide utensils, boards, pots and food containers; 410 mm spice pull-out alongside.',null,true,'storage'),
    row('hob','Induction cooking · 80 cm',.80,.52,.03,'80 cm induction allowance with flush glass and concealed extraction; final appliance and duct route remain selectable.',null,false,'worktop'),
    row('kitchen-hall-selfie-mirror','Hall-facing mirror · 255 × 234 cm',2.55,.026,2.34,'Continuous full-height mirror on the stair-facing kitchen wall, clear of the chimney enclosure and entry.',null,false,'mirror'),
  ];
}
export const LUXURY_KITCHEN_SCHEDULE=Object.freeze(luxuryKitchenSchedule().map(fixed));

export function luxuryKitchenFixtures(options={}){
  const second=secondaryWidth(options),applianceLabel=(title,detail,anchorHeight)=>({title,detail,anchorHeight});
  const wetModules=[{x:.805,width:.60,appliance:'kitchen-dishwasher-1'},{x:0,width:1.01,doors:2,assignment:'Waste sorting and cleaning'},
    {x:-.805+(second===.45?.075:0),width:second,appliance:'kitchen-dishwasher-2'},...(second===.45?[{x:-1.03,width:.15,drawers:false,assignment:'Tray pull-out'}]:[])];
  return [
    item('west-counter','counter','225 cm wet run: two dishwashers and workstation sink',.675,6.875,.65,2.25,{front:[1,0],drawers:false,joinedCounter:'kitchen-island',modules:wetModules,applianceNiches:true}),
    item('street-counter','counter','Cooking, preparation drawers and accessible blind corner',2.075,8.31,3.41,.62,{front:[0,-1],drawers:true,
      modules:[{x:1.105,width:1.20,frontInset:.68,assignment:'Corner swing-out baskets'},{x:.055,width:.90,drawers:true,assignment:'Utensils and pots'},
        {x:-.845,width:.90,drawers:true,assignment:'Boards and preparation'},{x:-1.50,width:.41,drawers:false,assignment:'Spices and oils'}]}),
    item('east-counter','storage','600 mm oven tower and 550 mm hidden nutrition pantry',4.10,7.515,.63,1.15,{front:[-1,0],height:2.70,pantry:true,ceilingFitted:true,ceilingScribe:.05,
      modules:[{x:-.275,width:.60,applianceTower:true,assignment:'Combi-steam and microwave ovens'},{x:.30,width:.55,assignment:'Hidden nutrition pantry'}]}),
    item('kitchen-fridge','fridge','Bosch four-door fridge-freezer in a ventilated 960 mm bay',4.055,6.46,.79,.96,{front:[-1,0],height:1.83,doorCount:4,actualWidth:.905,actualDepth:.731,
      equipmentLabel:applianceLabel('Fridge-freezer · 4 doors','Bosch · 905 mm',1.67),ventilation:{rear:.059,sideTotal:.055,top:.10},...reference('fridge')}),
    item('kitchen-fridge-top','wallCabinet','Ceiling-height storage above the ventilated refrigerator bay',4.10,6.46,.63,.96,{front:[-1,0],baseHeight:1.93,height:.77,wallMounted:true,ceilingFitted:true,ceilingScribe:.05}),
    item('kitchen-wall-storage','wallCabinet','Continuous cooking-wall storage with concealed extraction',2.075,8.47,3.41,.34,{front:[0,-1],baseHeight:1.48,height:1.22,wallMounted:true,ceilingFitted:true,ceilingScribe:.05}),
    item('kitchen-pantry-corner','storage','Full-height corner pantry for bulk and occasional appliances',4.10,8.365,.63,.55,{front:[-1,0],height:2.70,pantry:true,corner:true,ceilingFitted:true,ceilingScribe:.05,
      equipmentLabel:applianceLabel('Corner pantry','Bulk and occasional appliances',1.60)}),
    item('kitchen-island','counter','Connected peninsula with wine cooler and assigned drawers',1.45,5.325,2.20,.85,{height:.90,front:[0,1],variant:'social-peninsula',drawers:true,
      modules:[{x:-.775,width:.65,backAccess:true,assignment:'Dining-side serving storage'},{x:0,width:.90,drawers:true,assignment:'Cutlery, crockery and pans'},{x:.75,width:.60,appliance:'kitchen-wine-cooler'}],
      joinedCounter:'west-counter',waterfallEnds:[1],approaches:[[1.85,6.30],[3.15,5.325]]}),
    item('hob','hob','80 cm induction cooktop with flush glass',2.02,8.31,.80,.52,{hostId:'street-counter',front:[0,-1],induction:true,equipmentLabel:applianceLabel('Induction · 80 cm','Flush cooking zone',.98)}),
    item('kitchen-sink','sink','Franke Box Center workstation sink · 540 + 270 mm bowls',.675,6.94,.510,.860,{hostId:'west-counter',front:[1,0],basins:2,bowlWidths:[.540,.270],bowlDepth:.410,bowlHeight:.200,worktopOpening:{width:.836,depth:.436},
      faucetOutside:true,workstation:true,approach:[1.55,6.94],equipmentLabel:applianceLabel('Workstation sink + waste','Two bowls · sorting pull-out below',1.12),...reference('sink')}),
    item('kitchen-dishwasher-1','dishwasher','Fully integrated Miele XXL dishwasher 1 · 60 cm',.675,6.07,.65,.60,{front:[1,0],hostId:'west-counter',height:.845,frontHeight:.72,frontBase:.135,integrated:true,
      approach:[1.60,6.07],operatingDepth:1.205,equipmentLabel:applianceLabel('Dishwasher 1 · 60 cm','Miele AutoDos · hidden',.82),...reference('dishwasher')}),
    item('kitchen-dishwasher-2','dishwasher',second===.60?'Fully integrated Miele XXL dishwasher 2 · 60 cm':'Fully integrated slimline dishwasher allowance · 45 cm',.675,7.38+second/2,.65,second,{front:[1,0],hostId:'west-counter',height:.845,frontHeight:.72,frontBase:.135,integrated:true,
      approach:[1.60,7.38+second/2],operatingDepth:1.205,equipmentLabel:applianceLabel(`Dishwasher 2 · ${Math.round(second*100)} cm`,second===.60?'Miele AutoDos · hidden':'Slimline allowance',.82),...(second===.60?reference('dishwasher'):{})}),
    item('kitchen-steam-oven','steamOven','Miele DGC 7865 HC Pro · 67 L combi-steam oven',4.10,7.24,.63,.60,{front:[-1,0],hostId:'east-counter',baseHeight:.58,height:.596,
      approach:[3.05,7.24],equipmentLabel:applianceLabel('Combi-steam oven · 67 L','Miele DGC 7865 HC Pro',.91),...reference('steamOven')}),
    item('kitchen-speed-oven','speedOven','Miele H 7840 BM · microwave and compact oven',4.10,7.24,.63,.60,{front:[-1,0],hostId:'east-counter',baseHeight:1.22,height:.456,
      equipmentLabel:applianceLabel('Microwave / speed oven','Miele H 7840 BM · 43 L',1.50),...reference('speedOven')}),
    item('kitchen-nutrition-pantry','cabinetLabel','Hidden protein, supplements and appliance pantry',4.10,7.815,.63,.55,{front:[-1,0],hostId:'east-counter',height:2.70,nonBlocking:true,
      contents:['Protein powder tubs','Supplement containers','Blender and shaker bottles','Small-appliance garage'],equipmentLabel:applianceLabel('Nutrition pantry · 55 cm','Powders · supplements · appliances',1.62)}),
    item('kitchen-wine-cooler','wineCooler','Miele two-zone undercounter wine cooler',2.20,5.325,.60,.85,{front:[0,1],hostId:'kitchen-island',height:.816,actualDepth:.570,
      approach:[2.20,6.30],ventilationFreeAreaCm2:436.8,equipmentLabel:applianceLabel('Wine cooler · 60 cm','Miele · two zones',.72),...reference('wineCooler')}),
    item('kitchen-cutlery-drawers','cabinetLabel','Cutlery, daily crockery and deep pan drawers',1.45,5.325,.90,.85,{front:[0,1],hostId:'kitchen-island',nonBlocking:true,
      equipmentLabel:applianceLabel('Peninsula drawers · 90 cm','Cutlery · crockery · deep pans',.64)}),
    item('kitchen-cooking-drawers','cabinetLabel','Utensils and pot drawers below induction',2.02,8.31,.90,.62,{front:[0,-1],hostId:'street-counter',nonBlocking:true,
      equipmentLabel:applianceLabel('Cooking drawers · 90 cm','Utensils above · pots below',.62)}),
    item('kitchen-preparation-drawers','cabinetLabel','Knives, boards and preparation storage',2.92,8.31,.90,.62,{front:[0,-1],hostId:'street-counter',nonBlocking:true,
      equipmentLabel:applianceLabel('Preparation drawers · 90 cm','Knives · boards · food containers',.62)}),
    item('kitchen-spice-pullout','cabinetLabel','Tall spice, oil and bottle pull-out',3.575,8.31,.410,.62,{front:[0,-1],hostId:'street-counter',nonBlocking:true,
      equipmentLabel:applianceLabel('Spice pull-out · 41 cm','Oils · spices · tall bottles',.60)}),
    item('kitchen-corner-pullout','cabinetLabel','Accessible blind-corner baskets',1.31,8.31,.520,.62,{front:[0,-1],hostId:'street-counter',nonBlocking:true,
      equipmentLabel:applianceLabel('Corner swing-out baskets','52 cm access · 120 cm corner',.60)}),
    item('kitchen-serving-storage','cabinetLabel','Dining-side peninsula corner cupboard',.675,5.325,.650,.85,{front:[0,-1],hostId:'kitchen-island',nonBlocking:true,
      equipmentLabel:applianceLabel('Serving storage · 65 cm','Corner accessed from dining side',.60)}),
    item('kitchen-upper-storage-label','cabinetLabel','Cooking-wall tableware and concealed extraction',2.075,8.47,3.41,.34,{front:[0,-1],hostId:'kitchen-wall-storage',nonBlocking:true,
      equipmentLabel:applianceLabel('Upper storage','Tableware · concealed extractor',2.14)}),
    {...item('kitchen-hall-selfie-mirror','mirror','Continuous stair-facing full-height mirror',4.608,7.295,.026,2.55,{front:[1,0],height:2.34,mountHeight:1.35,wallMounted:true,heroMirror:true}),roomId:'hall'},
  ];
}

export function luxuryKitchenSummary(options={}){
  return {kind:'fitted-luxury-kitchen',schedule:luxuryKitchenSchedule(options),modules:KITCHEN_MODULES.flatMap(m=>m.id==='dishwasher-2'&&secondaryWidth(options)===.45?
      [{...m,width:.45},{id:'wet-tray-pullout',run:'sink',width:.150,kind:'pull-out',assignment:'Tray storage beside the slimline dishwasher'}]:[{...m}]),equipment:KITCHEN_APPLIANCE_REFERENCES,
    clearances:{wetRun:2.25,dishwasherClearNiches:[.60,secondaryWidth(options)],sinkBase:1.01,wetEndPanels:.020,
      cabinetHeightDatum:.900,worktopHeight:.919,worktopUnderside:.881,dishwasherHeight:.845,remainingAboveDishwasher:.036,
      peninsulaLength:2.20,entryBesideChimney:1.18,counterToFridge:2.66,openDishwasherAisle:2.005,
      fridgeBay:{width:.96,depth:.79,bodyWidth:.905,bodyDepth:.731,rearAllowance:.059,combinedSideAllowance:.055},
      wineVentFreeAreaCm2:436.8,installationNote:'Planning envelopes; final appliance drawings govern ventilation, hinge openings, services, worktop cut-outs and mounting.'},
    mirror:{width:2.55,height:2.34,bottom:.18,top:2.52,wall:'Hall face of kitchen enclosure',normal:[1,0,0]},
    storage:['Waste sorting and cleaning under sink','900 mm cutlery / crockery / pan drawers in peninsula','900 mm utensils / pots below hob',
      '900 mm preparation drawers','410 mm spice pull-out','1200 mm blind corner with swing-out baskets','550 mm hidden nutrition and appliance pantry','550 mm full-height corner pantry','Cooking-wall and refrigerator-top cupboards']};
}

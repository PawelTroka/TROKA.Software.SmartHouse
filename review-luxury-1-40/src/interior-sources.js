// Transcriptions and interpretations of the ten private sheets supplied for this study.
export const INTERIOR_SOURCES = [
  {id:'cellar',file:'IMG_8721.jpeg',title:'Cellar plan',reading:'900 cm depth, 40 cm outer walls, 440 / 40 / 340 cm internal depth chain. Brick-floored corridor and four earth-floored cellar rooms. Rear external access and separate internal stair.'},
  {id:'ground',file:'IMG_8722.jpeg',title:'Ground-floor plan',reading:'1077 cm overall, a centred 355 cm entrance bay, paired street stairs and granite posts. Two board-floored rear rooms, two kitchens, hall and bathroom. Note to straighten the lower flight of the existing timber stair.'},
  {id:'first',file:'IMG_8723.jpeg',title:'First-floor plan',reading:'Three rear rooms, cranked master partition, hall, large front room including bay, kitchen, bathroom, 80 × 200 cm doors and folding attic stair. Rear room widths 420, 342, 240 cm. The bay is 307 × 168 cm internally; its 355 cm masonry width has 10 cm external insulation on each side. Two rear windows on this sheet.'},
  {id:'section',file:'IMG_8724.jpeg',title:'Section I–I',reading:'−2.50 m foundation line, −2.00 cellar floor, ±0.00 ground floor, +3.05 first floor, +5.75 upper ceiling, +8.75 ridge and +9.60 chimney. Clear spaces 1.70, 2.75 and 2.70 m. Roof marked 30°. Local +7.25 m reference.'},
  {id:'front',file:'IMG_8725.jpeg',title:'Street elevation',reading:'Central projecting gable and bay, two flanking flights, multipane joinery, ground-floor shutters, plinth, eaves and two chimney stacks. The central lower panels differ from the openings on other sheets.'},
  {id:'side',file:'IMG_8726.jpeg',title:'Side elevation',reading:'Paired side windows at each occupied level, two small cellar lights and a circular gable vent. The projecting front bay has a narrow upper side light.'},
  {id:'detached',file:'IMG_8727(1).jpeg',title:'Separate garage or outbuilding elevations',reading:'North elevation has two portals beneath a pitched roof. West has a side door, window and dormer. South gable and east wall are shown largely blank. No dimensioned floor plan.'},
  {id:'structure',file:'IMG_8728.jpeg',title:'Floor structure over ground floor, 1:50',reading:'Existing timber floors, reinforced concrete ring beams W, concrete B15 and steel A0. Stair opening, front projection and 361 / 355 / 361 cm frontage chain. References to structural sheets 3/K and 6/K.'},
  {id:'ground-markup',file:'image(20261118-224203).png',title:'Ground-floor renovation markup',reading:'Open kitchen and living space, large dining table, U-shaped seating and right-wall TV, combined bathroom, broad rear HST and 4 m terrace.'},
  {id:'first-markup',file:'image(20261118-224942).png',title:'First-floor renovation markup',reading:'Expanded master, office, three guest bedrooms, wardrobe, compact sauna, whirlpool, soaking tub and two-person shower. A shared 4 m balcony extends across all three rear rooms. The later bathroom brief supersedes the two-tub markup: one hydrotherapy spa upstairs, with the deep soaking tub downstairs.'},
];

export const INTERIOR_CHANGES = {
  ground:[
    'Open the partition between the rear rooms and the wall between dining and the front-left kitchen. Keep the two flue cores visible.',
    'Join the right kitchen and bathroom. Keep access through the landing and remove the redundant internal doorway with the divider.',
    'Fit one deep soaking tub, a walk-in shower, a dual vanity, WC and bidet. Put the mirror on the solid stair wall and keep the low bidet below the street-window sill.',
    'Provide near-full-width rear lift-and-slide glazing (HST) to the 4.00 m terrace.',
    'Place a long table on the left, U-shaped seating facing a right-wall TV, and fitted cabinets in the front-left kitchen.',
  ],
  first:[
    'Straighten the master bedroom’s stepped front partition. Retain the middle office and right guest bedroom.',
    'Divide the front-left room into guest bedrooms II and III, with a new side corridor and independent doors. Enclose the bay as a wardrobe.',
    'Combine the kitchen and bath into a spa bathroom with one large hydrotherapy tub, jets and lighting, a two-person shower, a single vanity and WC.',
    'Enclose the right end of the hall for the sauna and move its new bath partition 0.36 m to give about 1.28 × 1.30 m clear. Move the guest-room door left and hinge the sauna door to open outward along the hall’s lower edge.',
    'Open three separate rear doors onto one continuous 4.00 m shared balcony.',
  ],
  basement:[
    'Keep the drawn cellar as the baseline. The optional two-car conversion compares a lowered floor and two straight parking lanes against its stair and chimney cores.',
    'The street entry and large garage aperture need their own structural design. Existing cellar access below the proposed rear terrace also needs coordination.',
  ],
  attic:[
    'Retain a single unpartitioned roof space, exposed truss envelope and folding access. No conversion into bedrooms is marked.',
  ],
};

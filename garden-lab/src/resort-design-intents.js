// Short design notes for the actual furnishing and lighting recipes. They
// describe a proposal, not additional rooms, measured planting or quoted work.
import {MINIMAL_STYLE_DEFINITIONS} from './minimal-style-definitions.js?v=1.35.0';
const intent = (headline, retreat, gathering, evening, signature) => Object.freeze({
  headline, retreat, gathering, evening, signature,
});

export const RESORT_DESIGN_INTENTS = Object.freeze({
  current: intent(
    'Your original house and garden',
    'The existing furniture arrangement stays in place.',
    'The original terrace and garden dining setting remain available.',
    'Keep the original woven pendants and garden light arrangement.',
    'Pale stone, timber and woven shades.'),
  'organic-modern': intent(
    'A quiet stone courtyard',
    'A rounded sofa and two chairs gather around a low stone table.',
    'An oval dining table softens the paved court.',
    'Soft saucers light the seating, with a quieter glow along the garden edge.',
    'Travertine tones, rounded upholstery and bronze.'),
  'hidden-bali': intent(
    'A private garden retreat',
    'A deep woven sofa, daybed extension and occasional chair make a relaxed lounge.',
    'A timber dining setting becomes a small outdoor room.',
    'Amber basket lanterns gather warm light around the places to sit.',
    'Dark teak, open weave and close ceiling battens.'),
  'mediterranean-villa': intent(
    'Long lunches in the courtyard',
    'A garden-facing sofa and opposing chairs make an open linen salon.',
    'Round dining keeps conversation close within the garden court.',
    'Framed lanterns bring warm pools of light to the terracotta court.',
    'Limewash, terracotta and olive green.'),
  'modern-minimal': intent(
    'Room to breathe',
    'A low sofa faces the garden, with an occasional chair and movable ottoman.',
    'A long dining table follows the clean lines of the paving.',
    'Narrow fittings and low path lights give the evening scene a restrained rhythm.',
    'Pale slabs, graphite frames and fine shadow lines.'),
  scandinavian: intent(
    'Easy summer living',
    'A timber sofa and two light chairs form an everyday conversation group.',
    'Simple timber dining leaves space for a relaxed meal outdoors.',
    'Bell shades give the table a soft, warm centre.',
    'Pale boards, painted timber and blue-grey linen.'),
  japandi: intent(
    'A slower garden ritual',
    'Two facing platforms create a quiet place for conversation around a low table.',
    'Opposing dining benches create a compact, deliberate gathering place.',
    'A few framed lanterns mark the occupied spaces and the route through the garden.',
    'Dark paired battens, woven fabric and honed stone.'),
  'organic-scandinavian': intent(
    'Soft shapes, open space',
    'A garden-facing sofa and opposing chairs soften the lounge with curved timber.',
    'An oval table brings a softer edge to outdoor dining.',
    'Shallow shades spread soft light over the furniture.',
    'Blond timber, mineral tones and moss green.'),
  'organic-japandi': intent(
    'A sheltered place to unwind',
    'A low sofa, daybed extension and occasional chair make an asymmetric lounge.',
    'An oval dining setting keeps the gathering area compact.',
    'Oval lanterns and low garden lights leave space between the brighter areas.',
    'Clay tones, walnut rails and pillowed upholstery.'),
  'space-age': intent(
    'A playful poolside lounge',
    'A curved sofa and two pod chairs gather around a rounded table.',
    'Pedestal dining keeps the floor open beneath the furniture.',
    'Opal orbs give the seating a small constellation of warm light.',
    'Pale terrazzo, chrome and a restrained orange accent.'),
  'party-club': intent(
    'Stay for another drink',
    'A deep channelled sofa and generous chairs create a sociable evening salon.',
    'A banquette dining setting keeps the group together.',
    'Tiered pendants concentrate the glow around the social spaces.',
    'Plum upholstery, dark stone and fine metallic trim.'),
  'baltic-dune': intent(
    'A quiet Baltic escape',
    'A low garden-facing sofa, canvas chair and ottoman keep the lounge informal.',
    'An open timber table makes a simple gathering place.',
    'Muted bell shades and low route lighting suit a quieter evening.',
    'Silvered boards, sandy canvas and muted sea green.'),
  coastal: intent(
    'A welcoming seaside verandah',
    'A tailored linen sofa and two chairs create a bright conversation room.',
    'Cross-back chairs gather around a pale plank dining table.',
    'White framed lanterns keep the covered seating warm after sunset.',
    'Painted weatherboards, shutters and crossed timber guards.'),
  'beach-house': intent(
    'Barefoot days, sheltered evenings',
    'A low linen sofa, daybed extension and rope chair make space to stretch out.',
    'Rounded dining and pale timber connect the house to its sheltered garden.',
    'Warm, shaded lights pick out the lounge and the route to the spa.',
    'Bleached timber, sand tones and sea-glass accents.'),
  'gdansk-brick': intent(
    'A warm urban courtyard',
    'Facing timber and leather-toned seats make a sheltered conversation room.',
    'Trestle dining gives the brick court a generous communal centre.',
    'Amber framed lanterns soften the masonry and metal.',
    'Clinker, oak and blackened steel.'),
  'danish-midcentury': intent(
    'Good company, beautiful timber',
    'A raised teak sofa and two lounge chairs gather around a low table.',
    'An oval dining table draws the seating together.',
    'Broad saucers make the table the focus after dark.',
    'Tapered timber legs, amber fabric and bronze.'),
  'finnish-sauna': intent(
    'Rest between sauna sessions',
    'Facing slatted seats create a quiet resting salon beside the garden.',
    'Low dining benches keep the gathering place simple and close to the deck.',
    'Amber fittings and low path lights lead between the resting places.',
    'Cedar boards, charcoal trim and warm linen.'),
  'riviera-deco': intent(
    'An intimate evening salon',
    'A rounded sofa and generous chairs create an intimate evening salon.',
    'Banquette dining gives the social area a sheltered outline.',
    'Layered disc shades bring a warm glow to the seating.',
    'Shell pink, sea green and fine brass details.'),
  'arts-and-crafts': intent(
    'A garden made for gathering',
    'A garden-facing oak sofa and opposing chairs make a settled sitting room.',
    'Trestle dining anchors the brick court.',
    'Framed lanterns bring a domestic scale to the evening garden.',
    'Pegged timber, basketweave brick and woven fabric.'),
  'palm-springs': intent(
    'A bright poolside afternoon',
    'A low sofa and two open chairs form a pool-inspired conversation group.',
    'A round dining table makes room for a casual meal or an aperitif.',
    'Small opal globes keep the poolside mood playful and warm.',
    'Aqua fabric, pale terrazzo and a coral accent.'),
  'desert-modern': intent(
    'Stillness in warm stone',
    'A low garden-facing sofa, chair and ottoman create a sheltered mineral lounge.',
    'Opposing benches keep dining compact and grounded.',
    'Clay-coloured shades and low light emphasise the warm surfaces.',
    'Sandstone, earthen render and bronze.'),
  'alpine-lodge': intent(
    'A warm retreat among the trees',
    'A deep timber sofa and generous chairs form a warm evening salon.',
    'A substantial timber table brings everyone together.',
    'Dark framed lanterns cast warm light across the broad boards.',
    'Cedar, wool tones and dark iron.'),
  'industrial-loft': intent(
    'An easy outdoor dining room',
    'A garden-facing sofa and opposing chairs pair leather tones with steel frames.',
    'A long workshop-style table makes a communal dining setting.',
    'Spun shades put warm light where people gather.',
    'Board-marked concrete, steel and warm timber.'),
  ...Object.fromEntries(MINIMAL_STYLE_DEFINITIONS.map(style=>[style.id,intent(...style.intent)])),
});

export const getResortDesignIntent = id => RESORT_DESIGN_INTENTS[id] || RESORT_DESIGN_INTENTS.current;

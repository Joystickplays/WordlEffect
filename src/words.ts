import raw from './valid.txt?raw'

// Answers are common words; guesses may be anything in the full dictionary.
export const ANSWERS = `
about above actor adapt adore adult after again agent agree ahead alarm album alert alien alike alive allow
alone along alpha amber ample angel anger angle apart apple apply arena argue arise armor aroma arrow aside
aspen atlas audio avoid awake award aware azure bacon badge baker basic basin batch beach beard beast begin
being below bench berry birch birth black blade blame blank blast blaze blend bless blind bliss block bloom
blown blunt blush board boast bonus boost booth bound brain brave bread break breed brick bride brief bring
brink brisk broad brook broom brown brush build built bunch burst cabin cable camel candy canoe cargo carol
carry catch cause cedar chain chair chalk charm chart chase cheap check cheek cheer chess chest chief child
chill chime choir chord cider civic claim clamp clash class clean clear clerk click cliff climb cling cloak
clock close cloth cloud clove coach coast cocoa color comet coral couch count court cover crack craft crane
crash crawl crazy cream creek crest crisp cross crowd crown crumb crush crust curve cycle daily dairy daisy
dance dealt debut decay delta dense depth diary digit diner dizzy dodge doing donor doubt dough draft drain
drama drank drawn dream dress dried drift drill drink drive dunes dusty dwell eager eagle early earth easel
eaten ebony elbow elder elect elite ember empty enjoy enter entry equal equip erase error essay event every
exact exist extra fable faint fairy faith false fancy feast fence ferry fetch fever fiber field fifth fifty
fight final flair flame flash fleet flick fling float flock flood floor flora flour fluid flute focus foggy
force forge forth forty forum found frame fresh frost froze fruit fully funny gauge ghost giant given glade
glass gleam glide gloom glory gloss glove glyph going grace grade grain grand grant grape graph grasp grass
grave great green greet grill grind grove grown guard guess guest guide guild habit happy harsh haste hatch
haven heart heavy hedge hello heron hinge hobby honey honor horse hotel hound house hover human humid humor
hurry icing ideal image index inner input irony ivory jelly jewel joint jolly judge juice juicy kayak kneel
knife knock known koala label lance large laser later laugh layer leafy learn lease least leave ledge lemon
level light lilac limit linen liver llama lodge lofty logic loose lotus loyal lucky lunar lunch lyric magic
major maker mango manor maple march marsh match mayor medal melon mercy merit merry metal meter midst might
minor minty mirth model moist money month moose moral motor mount mouse mouth movie music naive nerve never
newly niche night noble noise north novel nurse nylon oasis ocean offer often olive onion opera orbit order
organ other otter ought ounce outer owner oxide paint panel paper party pasta patch pause peace peach pearl
pedal penny perch petal phase phone photo piano piece pilot pinch pitch pixel pizza place plain plane plant
plate plaza plume plush point polar porch pouch power press price pride prime print prism prize probe proof
proud prove pulse punch pupil puppy purse quail quart queen query quest quick quiet quill quilt quirk quite
quote radar radio rainy raise rally ranch range rapid raven reach react ready realm rebel relax relay reply
ridge right rigid rinse ripen risen river roast robin robot rocky rouge rough round route royal rumor rural
rusty sable saint salad salty sandy sauce scale scarf scene scent scone scope score scout scrub sense serve
seven shade shake shall shape share shark sharp sheep sheet shelf shell shift shine shiny shirt shore short
shout sight silky silly since siren sixth skate skill skirt slate sleep slice slide slope small smart smell
smile smoke snack snail snake sneak solar solid solve sonic sorry sound south space spare spark speak spell
spend spice spine spoke spoon sport spray squad stack staff stage stair stamp stand stare start state steam
steel steep stern stick still sting stock stone stool storm story stove straw strip stuck study style sugar
suite sunny super surge swamp swarm sweep sweet swift swing sword syrup table taken tango taste teach tempo
tenth thank theme there thick thing think third thorn those three threw throw thumb tiger tight timer toast
today token topaz torch total touch tough towel tower trace track trade trail train trait tread treat trend
trial tribe trick tried truck truly trunk trust truth tulip tutor twice twist ultra uncle under unity until
upper upset urban usage usual utter valid value valve vapor vault venue verse video vigor vinyl viola viper
visit vista vital vivid vocal voice wagon waist waltz watch water waver weary weave wedge whale wheat wheel
where which while whirl white whole width windy woken woman world worry worth would wound woven wrist write
wrong yacht yearn yeast yield young youth zebra zesty
`
  .trim()
  .split(/\s+/)

export const VALID = new Set([...raw.split('\n'), ...ANSWERS])

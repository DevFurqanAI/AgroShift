export const STANDARD_OUT_OF_SCOPE_REPLY =
  "I'm Ask AgroShift, your agricultural assistant. I can help with farming, crop rotations, climate information, field health, and using AgroShift.";

export type DomainDecision = 'in_scope' | 'out_of_scope' | 'ambiguous';

export interface RelevantContextSlices {
  profile: boolean;
  climate: boolean;
  fieldHealth: boolean;
  rotation: boolean;
}

export interface DomainEvaluation {
  decision: DomainDecision;
  reason: string;
  needsFarmContext: boolean;
  relevantSlices: RelevantContextSlices;
}

export interface AssistantTurnInput {
  role: 'user' | 'assistant';
  content: string;
}

const GENERIC_FARM_NAME_STOPLIST = new Set([
  'test',
  'tests',
  'farm',
  'field',
  'plot',
  'home',
  'sample',
  'demo',
  'data',
  'my',
  'new',
]);

// Explicit out-of-scope software / technical internals / non-ag prompts checked FIRST
const EXPLICIT_SOFTWARE_OR_INTERNALS_RE =
  /\b(how was agroshift (?:programmed|built|coded|developed|implemented|created)|what (?:tech stack|framework|programming language) (?:does|did) agroshift|agroshift(?:'s)? source code|write (?:me )?(?:a )?(?:python|javascript|typescript|java|c\+\+|c#|rust|go|php|ruby|sql|html|css|bash|react) (?:code|script|program|app|function|component)|debug (?:my |this )?code|leetcode|binary search|linked list|react hook|fastapi endpoint|vercel config|gemini api key|system prompt)\b/i;

const EXPLICIT_ENTERTAINMENT_CREATIVE_CHITCHAT_RE =
  /\b(tell (?:me )?(?:a )?joke|write (?:me )?(?:a )?(?:short )?(?:story|poem|haiku|essay|song|rap|lyrics|novel|script)|play a game|who won the (?:world cup|match|game|super bowl|oscars|election)|football score|cricket score|nba score|capital city of|what is the capital of|horoscope|astrology|zodiac|netflix|celebrity gossip|movie recommendation|dating advice|relationship advice)\b/i;

const EXPLICIT_GENERAL_MATH_OR_SCIENCE_RE =
  /\b(algebra|quadratic equation|polynomial|factorize|factor this|calculus|derivative|integral|trigonometry|pythagorean|logarithm|eigenvalue|matrix multiplication|linear equation|solve for [a-z]|quantum mechanics|black hole|string theory|periodic table|photosynthesis aside|relativity theory)\b/i;

const GREETING_ONLY_RE =
  /^(?:hi|hello|hey|hiya|yo|greetings|good (?:morning|afternoon|evening|day)|how are you(?: doing)?|what'?s up|sup|howdy|thanks|thank you|ok|okay|cool|nice|bye|goodbye|who are you|what can you do|help me)\b[!.?\s]*$/i;

// Core in-scope agricultural, Earth observation, AgroShift, and farm-calculation patterns
const AG_DOMAIN_KEYWORDS_RE =
  /\b(agricult\w*|agronom\w*|farm\w*|crop\w*|rotation\w*|harvest\w*|plant(?:ing|ed|s)?|sow(?:ing|n|s)?|fallow\w*|tillage|no-till|cover crop\w*|intercrop\w*|legume\w*|cereal\w*|pulse\w*|grain\w*|oilseed\w*|wheat|maize|corn|rice|paddy|soybean\w*|chickpea\w*|lentil\w*|millet\w*|sorghum|barley|oat\w*|cotton|sugarcane|potato\w*|tomato\w*|canola|mustard|groundnut\w*|peanut\w*|cowpea\w*|alfalfa|clover|sunflower\w*|sesame|mung\w*|nitrogen|phosphorus|potassium|npk|compost\w*|manure|mulch\w*|residue\w*|fertiliz\w*|pesticid\w*|herbicid\w*|fungicid\w*|pest\w*|aphid\w*|blight|rust|weed\w*|yield\w*|germinat\w*|emergen\w*|canopy|biomass|chlorophyll|root\w*|soil\w*|subsoil|topsoil|loam\w*|clay|sandy|silt|salinity|sodic|drainage|waterlog\w*|organic matter|moisture|humidity|irrigat\w*|drip|sprinkler|furrow|rainfed|rain-fed|drought\w*|arid|rain(?:fall)?|precipitat\w*|evapotranspiration|et0|water demand|water stress|water availability|frost|chill(?:ing)?|heat risk|heat stress|temperature\w*|growing degree|gdd|climate\w*|weather|monsoon|kharif|rabi|zaid|season\w*|nasa power|sentinel(?:-?2)?|copernicus|open-?meteo|ndvi|ndmi|satellite\w*|vegetation index|pixel coverage|cloud cover|sustainab\w*|resilien\w*|erosion|agroshift|dashboard|overview|field health|rotation planner|climate intelligence|compare scenarios|farm dossier|farm profile|saved plan\w*|my farms|add farm|onboarding|field boundary|polygon|export json|smallholder|hectare\w*|acre\w*)\b/i;

const FARM_CALC_UNITS_RE =
  /\b(ha|hectare|hectares|acre|acres|ac|mm\/day|mm\/yr|mm\/month|millimeter|millimeters|inches of rain|celsius|fahrenheit|°c|°f|kg\/ha|t\/ha|tons\/ha|lb\/ac|liters\/m2|litres\/m2|m3\/ha|cubic meter\w*)\b/i;

const CALC_INTENT_RE =
  /\b(convert|conversion|calculate|calc|how many|how much|formula|equation|ratio|per hectare|per acre|difference between|total rain|average temp|mean temp)\b/i;

const FARM_OR_SESSION_REFERENCE_RE =
  /\b(my farm|our farm|this farm|the farm|my field\w*|our field\w*|this field\w*|my plot\w*|my land|my crop\w*|our crop\w*|my soil|my ph|my water|my irrigation|my climate|my ndvi|my ndmi|my rotation\w*|my plan\w*|my option\w*|my scenario\w*|my profile|my area|my acreage|my hectares|for my farm|on my farm|apply to my|saved farm|saved plan\w*|this location|current session|current farm|these results|above results|loaded observation\w*|loaded climate|loaded field)\b/i;

const ARITHMETIC_OR_EQUATION_ONLY_RE =
  /(?:solve\s+(?:this|the)?\s*(?:equation|math|problem)?|\bsquare root of\b|\d+\s*[xXyYzZ]\s*[+\-=]|[+\-*/^]\s*\d+\s*=|what\s+is\s+\d+\s*(?:\+|\-|\*|\/|times|divided by|plus|minus|percent of)\s*\d+)/i;

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function hasFarmSpecificReference(
  normalizedQuestion: string,
  farmContext?: Record<string, unknown> | null
): boolean {
  if (!farmContext) return false;
  if (FARM_OR_SESSION_REFERENCE_RE.test(normalizedQuestion)) {
    return true;
  }

  const rawFarmName =
    typeof farmContext.farmName === 'string' ? farmContext.farmName.trim() : '';
  if (
    rawFarmName.length >= 4 &&
    !GENERIC_FARM_NAME_STOPLIST.has(rawFarmName.toLowerCase())
  ) {
    const escaped = rawFarmName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(normalizedQuestion)) {
      return true;
    }
  }

  // Also check explicit "for farm <name>" even for short/generic names like "Tests"
  if (rawFarmName.length >= 2) {
    const escaped = rawFarmName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(`\\b(?:farm|profile)\\s+(?:named\\s+)?["']?${escaped}["']?\\b`, 'i').test(
        normalizedQuestion
      )
    ) {
      return true;
    }
  }

  return false;
}

export function detectRelevantContextSlices(
  question: string,
  recentMessages: AssistantTurnInput[] = [],
  farmContext?: Record<string, unknown> | null
): { needsFarmContext: boolean; relevantSlices: RelevantContextSlices } {
  const normalized = normalizeText(question);
  const recentUserText = recentMessages
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => m.content)
    .join(' ');

  const needsFarmContext =
    hasFarmSpecificReference(normalized, farmContext) ||
    (normalized.length < 45 &&
      /\b(it|that|this|those|why|what about|expand|explain more)\b/i.test(normalized) &&
      hasFarmSpecificReference(recentUserText, farmContext));

  if (!needsFarmContext || !farmContext) {
    return {
      needsFarmContext: false,
      relevantSlices: {
        profile: false,
        climate: false,
        fieldHealth: false,
        rotation: false,
      },
    };
  }

  const combined = `${normalized} ${recentUserText}`.toLowerCase();
  const asksClimate =
    /\b(climate|nasa power|historical|temp|temperature|rain|rainfall|precip|monsoon|season|drought|frost|heat)\b/.test(
      combined
    );
  const asksFieldHealth =
    /\b(ndvi|ndmi|satellite|sentinel|copernicus|field health|canopy|vegetation|pixel|cloud|weather|humidity|moisture|stress|open-meteo)\b/.test(
      combined
    );
  const asksRotation =
    /\b(rotat|crop|sequence|plan|option|score|scenario|legume|family|plant|sow|soil|ph|water|irrigat)\b/.test(
      combined
    );
  const asksBroadSummary =
    /\b(farm profile|summar|overview|readiness|my farm|my data|everything|report|dossier)\b/.test(
      combined
    );

  return {
    needsFarmContext: true,
    relevantSlices: {
      profile: true,
      climate: asksClimate || asksRotation || asksBroadSummary,
      fieldHealth: asksFieldHealth || asksBroadSummary,
      rotation: asksRotation || asksBroadSummary,
    },
  };
}

export function selectRelevantFarmContext(
  question: string,
  recentMessages: AssistantTurnInput[],
  rawFarmContext?: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!rawFarmContext || typeof rawFarmContext !== 'object') return null;

  const { needsFarmContext, relevantSlices } = detectRelevantContextSlices(
    question,
    recentMessages,
    rawFarmContext
  );
  if (!needsFarmContext) return null;

  const selected: Record<string, unknown> = {};

  if (relevantSlices.profile) {
    selected.farmerProvidedInformation = {
      farmName: rawFarmContext.farmName ?? null,
      country: rawFarmContext.country ?? null,
      region: rawFarmContext.region ?? null,
      coordinates: rawFarmContext.coordinates ?? null,
      areaHectares: rawFarmContext.areaHectares ?? null,
      farmType: rawFarmContext.farmType ?? null,
      irrigationMethod: rawFarmContext.irrigationMethod ?? null,
      waterAvailability: rawFarmContext.waterAvailability ?? null,
      rainfallReliability: rawFarmContext.rainfallReliability ?? null,
      soil: rawFarmContext.soil ?? null,
      previousCrop: rawFarmContext.previousCrop ?? null,
      orderedCropHistory: rawFarmContext.orderedCropHistory ?? [],
      priorities: rawFarmContext.priorities ?? [],
    };
  }

  if (relevantSlices.climate && rawFarmContext.loadedClimateSummary !== undefined) {
    selected.nasaPowerHistoricalClimate = rawFarmContext.loadedClimateSummary;
  }

  if (relevantSlices.fieldHealth && rawFarmContext.loadedFieldHealth !== undefined) {
    selected.sentinel2AndWeatherMeasurements = rawFarmContext.loadedFieldHealth;
  }

  if (relevantSlices.rotation && rawFarmContext.loadedRotationScreening !== undefined) {
    selected.rotationScreeningInterpretations = rawFarmContext.loadedRotationScreening;
  }

  return selected;
}

export function evaluateDomainPolicy(
  latestQuestion: string,
  recentMessages: AssistantTurnInput[] = [],
  farmContext?: Record<string, unknown> | null
): DomainEvaluation {
  const normalized = normalizeText(latestQuestion);
  const contextMeta = detectRelevantContextSlices(
    normalized,
    recentMessages,
    farmContext
  );

  if (!normalized) {
    return {
      decision: 'out_of_scope',
      reason: 'empty_message',
      ...contextMeta,
    };
  }

  // 1. Always reject greetings / casual chat / identity chitchat without agricultural content
  if (GREETING_ONLY_RE.test(normalized)) {
    return {
      decision: 'out_of_scope',
      reason: 'greeting_or_casual_chat',
      ...contextMeta,
    };
  }

  // 2. Reject explicit software programming, AgroShift code internals, and creative writing / sports / entertainment BEFORE broad keyword passes
  if (EXPLICIT_SOFTWARE_OR_INTERNALS_RE.test(normalized)) {
    return {
      decision: 'out_of_scope',
      reason: 'software_or_agroshift_internals',
      ...contextMeta,
    };
  }

  if (EXPLICIT_ENTERTAINMENT_CREATIVE_CHITCHAT_RE.test(normalized)) {
    return {
      decision: 'out_of_scope',
      reason: 'entertainment_sports_trivia_or_creative',
      ...contextMeta,
    };
  }

  // 3. Agricultural, Earth Observation, AgroShift feature, or farm-math check
  const hasAgKeyword = AG_DOMAIN_KEYWORDS_RE.test(normalized);
  const hasFarmCalcUnits = FARM_CALC_UNITS_RE.test(normalized);
  const hasCalcIntent = CALC_INTENT_RE.test(normalized);

  // Reject pure math/science prompts that do NOT involve farming units or ag domain terms
  if (
    !hasAgKeyword &&
    !hasFarmCalcUnits &&
    (EXPLICIT_GENERAL_MATH_OR_SCIENCE_RE.test(normalized) ||
      ARITHMETIC_OR_EQUATION_ONLY_RE.test(normalized))
  ) {
    return {
      decision: 'out_of_scope',
      reason: 'general_math_or_unrelated_science',
      ...contextMeta,
    };
  }

  // Disambiguate explicitly non-agricultural contexts paired with words like moisture/temp
  if (
    /\b(basement|bathroom|drywall|wall mold|car engine|radiator|smartphone|laptop|cpu|gpu|air conditioner|hvac)\b/i.test(
      normalized
    )
  ) {
    return {
      decision: 'out_of_scope',
      reason: 'non_agricultural_context',
      ...contextMeta,
    };
  }

  if (hasAgKeyword || (hasCalcIntent && hasFarmCalcUnits) || hasFarmCalcUnits) {
    return {
      decision: 'in_scope',
      reason: hasCalcIntent && hasFarmCalcUnits ? 'agricultural_calculation' : 'agricultural_or_agroshift_topic',
      ...contextMeta,
    };
  }

  // 4. Short follow-up in an active agricultural thread (no off-topic trigger)
  const priorUserTurns = recentMessages
    .filter((m) => m.role === 'user')
    .slice(0, -1)
    .slice(-3);

  const priorWasAg = priorUserTurns.some((m) =>
    AG_DOMAIN_KEYWORDS_RE.test(m.content)
  );
  if (
    priorWasAg &&
    normalized.length <= 120 &&
    !EXPLICIT_GENERAL_MATH_OR_SCIENCE_RE.test(normalized) &&
    !EXPLICIT_SOFTWARE_OR_INTERNALS_RE.test(normalized) &&
    !EXPLICIT_ENTERTAINMENT_CREATIVE_CHITCHAT_RE.test(normalized)
  ) {
    return {
      decision: 'in_scope',
      reason: 'agricultural_conversation_followup',
      ...contextMeta,
    };
  }

  // 5. Clearly non-ag trivia / personal / unrelated patterns
  if (
    /\b(president|prime minister|parliament|bitcoin|crypto|stock price|movie|actor|actress|singer|football|soccer|cricket|basketball|tennis|olympics|recipe|cook|bake|workout|gym|diet|resume|cover letter|interview|hotel|flight|vacation|love life|boyfriend|girlfriend|tallest mountain|largest ocean|who invented|who discovered|world war|eiffel tower|mona lisa|solar system|milky way|how many continents|speed of light|ceo of)\b/i.test(
      normalized
    )
  ) {
    return {
      decision: 'out_of_scope',
      reason: 'unrelated_general_knowledge_or_advice',
      ...contextMeta,
    };
  }

  // 6. Truly ambiguous standalone request: requires constrained classification step
  return {
    decision: 'ambiguous',
    reason: 'ambiguous_requires_domain_classification',
    ...contextMeta,
  };
}

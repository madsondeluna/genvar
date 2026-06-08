// ClinVar condition names are standardized English medical terms. The user asked for full PT-BR
// translation, so a curated dictionary covers the common/known conditions exactly, and a
// rule-based fallback handles the rest (token substitution; rare names may stay imperfect).

const CONDITION_PT = {
  'not provided': 'Não informado',
  'not specified': 'Não especificado',
  'see cases': 'Ver casos',
  'inborn genetic diseases': 'Doenças genéticas congênitas',
  'hereditary cancer-predisposing syndrome': 'Síndrome hereditária de predisposição ao câncer',
  // Hemochromatosis / HFE
  'hemochromatosis type 1': 'Hemocromatose tipo 1',
  'hereditary hemochromatosis': 'Hemocromatose hereditária',
  'juvenile hemochromatosis': 'Hemocromatose juvenil',
  'hfe-related disorder': 'Transtorno relacionado ao HFE',
  'transferrin serum level quantitative trait locus 2':
    'Locus de característica quantitativa do nível sérico de transferrina 2',
  // Porphyrias
  'familial porphyria cutanea tarda': 'Porfiria cutânea tardia familiar',
  'porphyria cutanea tarda': 'Porfiria cutânea tardia',
  'variegate porphyria': 'Porfiria variegada',
  // Neuro / general phenotypes
  cardiomyopathy: 'Cardiomiopatia',
  'peripheral neuropathy': 'Neuropatia periférica',
  'alzheimer disease type 1': 'Doença de Alzheimer tipo 1',
  'abnormality of the male genitalia': 'Anormalidade da genitália masculina',
  'abnormality of the nervous system': 'Anormalidade do sistema nervoso',
  'abnormal peripheral nervous system morphology':
    'Morfologia anormal do sistema nervoso periférico',
  'abdominal pain': 'Dor abdominal',
  pain: 'Dor',
  'atypical behavior': 'Comportamento atípico',
  'microvascular complications of diabetes, susceptibility to, 7':
    'Suscetibilidade a complicações microvasculares do diabetes, 7',
  // Coagulation (factor V Leiden, prothrombin)
  thrombophilia: 'Trombofilia',
  'thrombophilia due to activated protein c resistance':
    'Trombofilia por resistência à proteína C ativada',
  'factor v deficiency': 'Deficiência de fator V',
  'recurrent pregnancy loss': 'Perda gestacional recorrente',
  // Hemoglobinopathies (HBB)
  'sickle cell anemia': 'Anemia falciforme',
  'sickle cell disease': 'Doença falciforme',
  'beta thalassemia': 'Beta talassemia',
  'beta-thalassemia': 'Beta talassemia',
  'hemoglobin c disease': 'Doença da hemoglobina C',
  'hereditary persistence of fetal hemoglobin': 'Persistência hereditária da hemoglobina fetal',
}

// High-confidence single-word substitutions for the rule-based fallback. Order-sensitive grammar
// is not attempted; this only swaps recognizable medical tokens to keep output mostly Portuguese.
const TOKEN_PT = {
  disease: 'doença',
  diseases: 'doenças',
  syndrome: 'síndrome',
  disorder: 'transtorno',
  disorders: 'transtornos',
  deficiency: 'deficiência',
  hereditary: 'hereditária',
  familial: 'familiar',
  congenital: 'congênita',
  inborn: 'congênita',
  cancer: 'câncer',
  tumor: 'tumor',
  anemia: 'anemia',
  neuropathy: 'neuropatia',
  peripheral: 'periférica',
  central: 'central',
  abnormality: 'anormalidade',
  abnormal: 'anormal',
  nervous: 'nervoso',
  system: 'sistema',
  pain: 'dor',
  behavior: 'comportamento',
  atypical: 'atípico',
  juvenile: 'juvenil',
  susceptibility: 'suscetibilidade',
  complications: 'complicações',
  microvascular: 'microvasculares',
  cardiomyopathy: 'cardiomiopatia',
  porphyria: 'porfiria',
  thrombophilia: 'trombofilia',
  deafness: 'surdez',
  blindness: 'cegueira',
  epilepsy: 'epilepsia',
  seizures: 'convulsões',
  intellectual: 'intelectual',
  developmental: 'do desenvolvimento',
  delay: 'atraso',
  muscular: 'muscular',
  dystrophy: 'distrofia',
  retinal: 'retiniana',
  hearing: 'audição',
  loss: 'perda',
  growth: 'crescimento',
  metabolism: 'metabolismo',
  immunodeficiency: 'imunodeficiência',
  malformation: 'malformação',
  of: 'de',
  the: 'o',
  and: 'e',
  to: 'a',
  with: 'com',
  type: 'tipo',
}

function ruleTranslate(name) {
  // "X type N" -> "<traduz X> tipo N"
  const typeMatch = name.match(/^(.*?)[,\s]+type\s+([\w-]+)\.?$/i)
  if (typeMatch) {
    return `${translateCondition(typeMatch[1])} tipo ${typeMatch[2]}`
  }
  const words = name.split(/\s+/).map((w) => {
    const bare = w.toLowerCase().replace(/[.,;]/g, '')
    return TOKEN_PT[bare] || w
  })
  const joined = words.join(' ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

export function translateCondition(name) {
  if (!name) return name
  const key = name.trim().toLowerCase()
  if (CONDITION_PT[key]) return CONDITION_PT[key]
  return ruleTranslate(name.trim())
}

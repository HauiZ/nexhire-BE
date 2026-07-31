import { CvParseProvider } from '../cv-parsing/entities/cv-parsing.enum';

export interface AiModelPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  multiplier: number;
}

export const AI_CONFIG_KEYS = {
  ACTIVE_PROVIDER: 'ACTIVE_AI_PROVIDER',
  GEMINI_MODEL: 'GEMINI_ACTIVE_MODEL',
  OPENAI_MODEL: 'OPENAI_ACTIVE_MODEL',
} as const;

export const SUPPORTED_AI_MODELS = {
  [CvParseProvider.GEMINI]: [
    {
      id: 'gemini-3.5-flash',
      name: 'Gemini 3.5 Flash',
      isDefault: true,
    },
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      isDefault: false,
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      isDefault: false,
    },
  ],
  [CvParseProvider.OPENAI]: [
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      isDefault: false,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      isDefault: false,
    },
    {
      id: 'gpt-5.5',
      name: 'GPT-5.5 Compatible',
      isDefault: true,
    },
  ],
} as const;

export const AI_MODEL_PRICING: Partial<Record<CvParseProvider, Record<string, AiModelPricing>>> = {
  [CvParseProvider.OPENAI]: {
    'gpt-5.5': {
      inputUsdPerMillionTokens: 5,
      outputUsdPerMillionTokens: 30,
      multiplier: 0.9,
    },
  },
} as const;

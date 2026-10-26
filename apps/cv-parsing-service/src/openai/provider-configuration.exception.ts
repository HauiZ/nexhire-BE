import { ServiceUnavailableException } from '@nestjs/common';
import { ERROR_CODES } from '@nexhire/shared';

/** Terminal for this delivery; an operator must correct provider configuration. */
export class ProviderConfigurationException extends ServiceUnavailableException {
  constructor(readonly providerErrorCode: string) {
    super({
      code: ERROR_CODES.AI.SERVICE_UNAVAILABLE,
      message: 'OpenAI resume parser configuration requires administrator action',
    });
  }
}

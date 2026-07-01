import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as public so the active global auth guard skips it. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

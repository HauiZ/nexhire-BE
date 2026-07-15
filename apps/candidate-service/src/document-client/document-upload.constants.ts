export const CANDIDATE_AVATAR_MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
export const CANDIDATE_CV_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export const CANDIDATE_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const CANDIDATE_CV_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

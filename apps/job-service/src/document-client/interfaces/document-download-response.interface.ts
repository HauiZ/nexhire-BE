export interface DocumentDownloadResponse {
  id: string;
  documentType: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  expiresInSeconds: number;
}

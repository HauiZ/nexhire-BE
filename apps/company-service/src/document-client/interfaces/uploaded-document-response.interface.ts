export interface UploadedDocumentResponse {
  id: string;
  documentType: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  key: string;
  url: string;
}

export interface DocumentMetadataResponse {
  id: string;
  documentType: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

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

// Data model types for AWS Doc Intelligence

export interface DocumentSection {
  sectionId: string;
  heading: string;
  pageNumber: number;
  text: string;
  embedding: number[];
}

export interface DocumentMetadata {
  documentId: string;
  name: string;
  pageCount: number;
  format: string;
  s3Key: string;
  sections: DocumentSection[];
  uploadedAt: string;
}

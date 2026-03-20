const BUCKET_PREFIX = process.env.BUCKET_PREFIX || "";

export const BUCKETS = {
  CustomDocsUploads: `${BUCKET_PREFIX}custom-docs-uploads`,
  WorkshopContent: `${BUCKET_PREFIX}workshop-content`,
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

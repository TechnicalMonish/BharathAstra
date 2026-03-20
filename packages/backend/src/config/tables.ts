const TABLE_PREFIX = process.env.TABLE_PREFIX || "";

export const TABLES = {
  Documents: `${TABLE_PREFIX}Documents`,
  ContentCache: `${TABLE_PREFIX}ContentCache`,
  AuthorDB: `${TABLE_PREFIX}AuthorDB`,
  TrendData: `${TABLE_PREFIX}TrendData`,
  Workshops: `${TABLE_PREFIX}Workshops`,
  ResourceTracking: `${TABLE_PREFIX}ResourceTracking`,
  PricingData: `${TABLE_PREFIX}PricingData`,
  SearchHistory: `${TABLE_PREFIX}SearchHistory`,
  QueryHistory: `${TABLE_PREFIX}QueryHistory`,
  // RAG Pipeline Tables
  DocumentChunks: `${TABLE_PREFIX}DocumentChunks`,
  DocumentIndex: `${TABLE_PREFIX}DocumentIndex`,
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

export const TABLE_SCHEMAS = {
  Documents: {
    partitionKey: "docId",
    sortKey: "sectionId",
  },
  ContentCache: {
    partitionKey: "cacheKey",
    sortKey: undefined,
    ttlAttribute: "expiresAt",
  },
  AuthorDB: {
    partitionKey: "authorId",
    sortKey: undefined,
  },
  TrendData: {
    partitionKey: "topic",
    sortKey: "date",
  },
  Workshops: {
    partitionKey: "workshopId",
    sortKey: undefined,
  },
  ResourceTracking: {
    partitionKey: "sessionId",
    sortKey: "resourceId",
  },
  PricingData: {
    partitionKey: "serviceCode",
    sortKey: "region",
  },
  SearchHistory: {
    partitionKey: "userId",
    sortKey: "timestamp",
  },
  QueryHistory: {
    partitionKey: "userId",
    sortKey: "timestamp",
  },
  // RAG Pipeline Tables
  DocumentChunks: {
    partitionKey: "docId",
    sortKey: "chunkId",
  },
  DocumentIndex: {
    partitionKey: "docId",
    sortKey: "indexVersion",
  },
} as const;

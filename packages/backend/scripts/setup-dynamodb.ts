/**
 * Script to create DynamoDB tables required by the application.
 * Run with: npx ts-node scripts/setup-dynamodb.ts
 */
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  type KeySchemaElement,
  type AttributeDefinition,
} from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const client = new DynamoDBClient({ region });

interface TableDef {
  name: string;
  partitionKey: string;
  sortKey?: string;
}

const tables: TableDef[] = [
  { name: "Workshops", partitionKey: "workshopId" },
  { name: "Documents", partitionKey: "docId", sortKey: "sectionId" },
  { name: "ContentCache", partitionKey: "cacheKey" },
  { name: "AuthorDB", partitionKey: "authorId" },
  { name: "TrendData", partitionKey: "topic", sortKey: "date" },
  { name: "ResourceTracking", partitionKey: "sessionId", sortKey: "resourceId" },
  { name: "PricingData", partitionKey: "serviceCode", sortKey: "region" },
  { name: "SearchHistory", partitionKey: "userId", sortKey: "timestamp" },
  { name: "QueryHistory", partitionKey: "userId", sortKey: "timestamp" },
  // RAG Pipeline Tables
  { name: "DocumentChunks", partitionKey: "docId", sortKey: "chunkId" },
  { name: "DocumentIndex", partitionKey: "docId", sortKey: "indexVersion" },
];

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "ResourceNotFoundException") {
      return false;
    }
    throw err;
  }
}

async function createTable(def: TableDef): Promise<void> {
  const prefix = process.env.TABLE_PREFIX || "";
  const fullName = `${prefix}${def.name}`;

  if (await tableExists(fullName)) {
    console.log(`✓ Table "${fullName}" already exists, skipping.`);
    return;
  }

  const keySchema: KeySchemaElement[] = [
    { AttributeName: def.partitionKey, KeyType: "HASH" },
  ];
  const attrDefs: AttributeDefinition[] = [
    { AttributeName: def.partitionKey, AttributeType: "S" },
  ];

  if (def.sortKey) {
    keySchema.push({ AttributeName: def.sortKey, KeyType: "RANGE" });
    attrDefs.push({ AttributeName: def.sortKey, AttributeType: "S" });
  }

  await client.send(
    new CreateTableCommand({
      TableName: fullName,
      KeySchema: keySchema,
      AttributeDefinitions: attrDefs,
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  console.log(`✓ Created table "${fullName}"`);
}

async function main() {
  console.log(`Creating DynamoDB tables in region: ${region}\n`);

  for (const table of tables) {
    try {
      await createTable(table);
    } catch (err) {
      console.error(`✗ Failed to create "${table.name}":`, err);
    }
  }

  console.log("\nDone.");
}

main();

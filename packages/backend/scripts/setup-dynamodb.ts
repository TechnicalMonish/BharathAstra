/**
 * DynamoDB Table Setup Script
 * Creates all required tables for the BharathAstra RAG system
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION || "us-east-1";
const tablePrefix = process.env.DYNAMODB_TABLE_PREFIX || "bharathastra";

const client = new DynamoDBClient({ region });

interface TableDefinition {
  name: string;
  partitionKey: { name: string; type: "S" | "N" };
  sortKey?: { name: string; type: "S" | "N" };
  gsi?: Array<{
    name: string;
    partitionKey: { name: string; type: "S" | "N" };
    sortKey?: { name: string; type: "S" | "N" };
  }>;
}

const tables: TableDefinition[] = [
  {
    name: `${tablePrefix}-documents`,
    partitionKey: { name: "docId", type: "S" },
    gsi: [
      {
        name: "category-index",
        partitionKey: { name: "category", type: "S" },
        sortKey: { name: "lastUpdated", type: "S" },
      },
      {
        name: "type-index",
        partitionKey: { name: "type", type: "S" },
        sortKey: { name: "lastUpdated", type: "S" },
      },
    ],
  },
  {
    name: `${tablePrefix}-vectors`,
    partitionKey: { name: "chunkId", type: "S" },
    gsi: [
      {
        name: "docId-index",
        partitionKey: { name: "docId", type: "S" },
        sortKey: { name: "chunkId", type: "S" },
      },
    ],
  },
  {
    name: `${tablePrefix}-doc-index`,
    partitionKey: { name: "docId", type: "S" },
    sortKey: { name: "indexVersion", type: "S" },
    gsi: [
      {
        name: "status-index",
        partitionKey: { name: "status", type: "S" },
        sortKey: { name: "lastIndexedAt", type: "S" },
      },
    ],
  },
  {
    name: `${tablePrefix}-content-cache`,
    partitionKey: { name: "docId", type: "S" },
  },
  {
    name: `${tablePrefix}-question-history`,
    partitionKey: { name: "userId", type: "S" },
    sortKey: { name: "questionId", type: "S" },
    gsi: [
      {
        name: "timestamp-index",
        partitionKey: { name: "userId", type: "S" },
        sortKey: { name: "timestamp", type: "S" },
      },
    ],
  },
  {
    name: `${tablePrefix}-workshops`,
    partitionKey: { name: "workshopId", type: "S" },
    gsi: [
      {
        name: "category-index",
        partitionKey: { name: "category", type: "S" },
        sortKey: { name: "title", type: "S" },
      },
    ],
  },
  {
    name: `${tablePrefix}-blog-posts`,
    partitionKey: { name: "postId", type: "S" },
    gsi: [
      {
        name: "source-index",
        partitionKey: { name: "source", type: "S" },
        sortKey: { name: "publishedAt", type: "S" },
      },
    ],
  },
];

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

async function createTable(table: TableDefinition): Promise<void> {
  const exists = await tableExists(table.name);
  if (exists) {
    console.log(`✅ Table ${table.name} already exists`);
    return;
  }

  console.log(`📦 Creating table ${table.name}...`);

  const keySchema = [
    { AttributeName: table.partitionKey.name, KeyType: "HASH" as const },
  ];
  const attributeDefinitions = [
    { AttributeName: table.partitionKey.name, AttributeType: table.partitionKey.type },
  ];

  if (table.sortKey) {
    keySchema.push({ AttributeName: table.sortKey.name, KeyType: "RANGE" as const });
    attributeDefinitions.push({
      AttributeName: table.sortKey.name,
      AttributeType: table.sortKey.type,
    });
  }

  const gsiDefinitions = table.gsi?.map((gsi) => {
    // Add GSI key attributes if not already in attributeDefinitions
    if (!attributeDefinitions.find((a) => a.AttributeName === gsi.partitionKey.name)) {
      attributeDefinitions.push({
        AttributeName: gsi.partitionKey.name,
        AttributeType: gsi.partitionKey.type,
      });
    }
    if (gsi.sortKey && !attributeDefinitions.find((a) => a.AttributeName === gsi.sortKey!.name)) {
      attributeDefinitions.push({
        AttributeName: gsi.sortKey.name,
        AttributeType: gsi.sortKey.type,
      });
    }

    const gsiKeySchema = [
      { AttributeName: gsi.partitionKey.name, KeyType: "HASH" as const },
    ];
    if (gsi.sortKey) {
      gsiKeySchema.push({ AttributeName: gsi.sortKey.name, KeyType: "RANGE" as const });
    }

    return {
      IndexName: gsi.name,
      KeySchema: gsiKeySchema,
      Projection: { ProjectionType: "ALL" as const },
    };
  });

  const command = new CreateTableCommand({
    TableName: table.name,
    KeySchema: keySchema,
    AttributeDefinitions: attributeDefinitions,
    BillingMode: "PAY_PER_REQUEST",
    GlobalSecondaryIndexes: gsiDefinitions && gsiDefinitions.length > 0 ? gsiDefinitions : undefined,
  });

  await client.send(command);
  console.log(`✅ Created table ${table.name}`);
}

async function main() {
  console.log("🚀 Setting up DynamoDB tables for BharathAstra...\n");
  console.log(`Region: ${region}`);
  console.log(`Table prefix: ${tablePrefix}\n`);

  for (const table of tables) {
    try {
      await createTable(table);
    } catch (error) {
      console.error(`❌ Failed to create table ${table.name}:`, error);
    }
  }

  console.log("\n✨ DynamoDB setup complete!");
  console.log("\nTables created:");
  tables.forEach((t) => console.log(`  - ${t.name}`));
}

main().catch(console.error);

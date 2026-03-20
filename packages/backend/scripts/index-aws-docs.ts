/**
 * Script to index AWS documentation for the RAG system.
 * Run with: npx ts-node scripts/index-aws-docs.ts
 */

import { getRAGPipeline } from "../src/services/doc-navigator/ragPipeline";

// AWS documentation to index
const AWS_DOCS_TO_INDEX = [
  {
    docId: "aws-lambda-developer-guide",
    title: "AWS Lambda Developer Guide",
    category: "Compute",
    url: "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html",
  },
  {
    docId: "aws-amazon-ecs-developer-guide",
    title: "Amazon ECS Developer Guide",
    category: "Compute",
    url: "https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html",
  },
  {
    docId: "aws-amazon-s3-user-guide",
    title: "Amazon S3 User Guide",
    category: "Storage",
    url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html",
  },
  {
    docId: "aws-amazon-dynamodb-developer-guide",
    title: "Amazon DynamoDB Developer Guide",
    category: "Database",
    url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html",
  },
  {
    docId: "aws-aws-iam-user-guide",
    title: "AWS IAM User Guide",
    category: "Security",
    url: "https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html",
  },
];

async function indexAllDocs() {
  console.log("Starting AWS documentation indexing...\n");
  
  const pipeline = getRAGPipeline({
    maxPagesPerDoc: 10, // Limit pages for faster indexing during development
    chunkMaxTokens: 512,
    chunkOverlapTokens: 50,
  });

  for (const doc of AWS_DOCS_TO_INDEX) {
    console.log(`\n📚 Indexing: ${doc.title}`);
    console.log(`   URL: ${doc.url}`);
    
    try {
      const result = await pipeline.indexDocument(
        doc.url,
        doc.docId,
        doc.title,
        doc.category
      );

      if (result.success) {
        console.log(`   ✅ Success! Indexed ${result.sections} sections`);
      } else {
        console.log(`   ❌ Failed: ${result.errors?.join(", ")}`);
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log("\n✨ Indexing complete!");
}

// Run the indexing
indexAllDocs().catch(console.error);

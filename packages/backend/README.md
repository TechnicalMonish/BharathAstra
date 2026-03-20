# BharathAstra Backend - AWS RAG Setup

## Prerequisites

1. AWS Account with access to:
   - Amazon Bedrock (Claude models enabled)
   - DynamoDB
   - S3

2. AWS CLI configured with credentials:
   ```bash
   aws configure
   ```

3. Node.js 18+ installed

## Environment Variables

Create a `.env` file in `packages/backend/`:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# DynamoDB Tables (will be created automatically)
DYNAMODB_TABLE_PREFIX=bharathastra

# S3 Bucket for document caching
S3_BUCKET_NAME=bharathastra-docs-cache

# Server
PORT=3001
NODE_ENV=development
```

## Quick Start (Local Development)

1. Install dependencies:
   ```bash
   cd packages/backend
   npm install
   ```

2. Set up DynamoDB tables:
   ```bash
   npm run setup:dynamodb
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

4. The backend will be available at `http://localhost:3001`

## AWS Services Used

### Amazon Bedrock
- **Embeddings**: `amazon.titan-embed-text-v1` (1536 dimensions)
- **LLM**: `anthropic.claude-3-sonnet-20240229-v1:0`

Make sure these models are enabled in your AWS Bedrock console.

### DynamoDB Tables
- `bharathastra-documents` - Document metadata
- `bharathastra-vectors` - Vector embeddings for RAG
- `bharathastra-doc-index` - Document index status
- `bharathastra-content-cache` - Cached document content
- `bharathastra-question-history` - User question history

### S3 Bucket
- `bharathastra-docs-cache` - Stores fetched documentation pages

## API Endpoints

### RAG Endpoints

- `POST /api/docs/rag/query` - Ask a question using RAG
  ```json
  {
    "question": "How do I create a Lambda function?",
    "docIds": ["aws-aws-lambda-developer-guide"]
  }
  ```

- `POST /api/docs/rag/index-official` - Index AWS documentation
  ```json
  {
    "docIds": ["aws-aws-lambda-developer-guide", "aws-amazon-s3-user-guide"]
  }
  ```

- `GET /api/docs/rag/status/:docId` - Check indexing status

- `GET /api/docs/rag/indexed` - List all indexed documents

### Document Endpoints

- `GET /api/docs/list` - List available documents
- `POST /api/docs/upload` - Upload custom document
- `POST /api/docs/query` - Query documents (legacy)

## Deployment to AWS

### Option 1: AWS Lambda + API Gateway (Serverless)

1. Install AWS CDK:
   ```bash
   npm install -g aws-cdk
   ```

2. Deploy:
   ```bash
   cd packages/backend
   npm run deploy
   ```

### Option 2: EC2/ECS

1. Build the Docker image:
   ```bash
   docker build -t bharathastra-backend .
   ```

2. Push to ECR and deploy to ECS/EC2

## Troubleshooting

### "Bedrock model not available"
- Ensure you've enabled the required models in AWS Bedrock console
- Check your AWS region supports Bedrock

### "DynamoDB table not found"
- Run `npm run setup:dynamodb` to create tables

### "Access Denied"
- Verify your AWS credentials have the required permissions
- Check IAM policies for Bedrock, DynamoDB, and S3 access

## Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/bharathastra-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bharathastra-*",
        "arn:aws:s3:::bharathastra-*/*"
      ]
    }
  ]
}
```

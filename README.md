# 🇮🇳 BharathAstra - AWS Developer Intelligence Platform

An AI-powered platform for AWS developers featuring intelligent documentation search, blog aggregation, and cost prediction tools. Built with Amazon Bedrock, DynamoDB, and modern web technologies.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)

## 🌟 Features

### 📚 Documentation Navigator (RAG-Powered)
- **Semantic Search**: Ask natural language questions about AWS documentation
- **RAG Pipeline**: Uses Amazon Bedrock for embeddings and answer generation
- **Custom Document Upload**: Index your own PDFs, markdown, and text files
- **Citation Support**: Answers include source citations from documentation
- **Follow-up Questions**: AI suggests related questions to explore

### 📰 Blog Aggregator
- **AWS Blog Search**: Search across AWS blogs and announcements
- **Trend Analysis**: Discover trending AWS topics and services
- **Content Recommendations**: Get personalized blog recommendations
- **Conflict Detection**: Identify outdated or conflicting information

### 💰 Cost Predictor
- **Workshop Cost Analysis**: Estimate costs for AWS workshops and tutorials
- **Resource Tracking**: Track resources created during tutorials
- **Cleanup Scripts**: Generate scripts to delete workshop resources
- **Cost Notifications**: Get alerts for potential cost overruns

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│                    Deployed on Vercel/Amplify                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express.js)                        │
│                    Deployed on EC2/Lambda                        │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌───────────────┐
│ Amazon Bedrock│     │    DynamoDB     │     │      S3       │
│  (AI/ML)      │     │  (Vector Store) │     │   (Cache)     │
└───────────────┘     └─────────────────┘     └───────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- AWS Account with Bedrock access
- AWS CLI configured (`aws configure`)

### 1. Clone and Install

```bash
git clone https://github.com/TechnicalMonish/BharathAstra.git
cd BharathAstra
npm install
```

### 2. Configure Environment

Create `packages/backend/.env`:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Server
PORT=3001
NODE_ENV=development
```

### 3. Setup DynamoDB Tables

```bash
cd packages/backend
npm run setup:dynamodb
```

### 4. Start Development Servers

Terminal 1 - Backend:
```bash
npm run dev:backend
```

Terminal 2 - Frontend:
```bash
npm run dev:frontend
```

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health

## 📁 Project Structure

```
BharathAstra/
├── packages/
│   ├── frontend/          # Next.js frontend application
│   │   ├── src/
│   │   │   ├── app/       # Next.js app router pages
│   │   │   ├── components/# React components
│   │   │   └── lib/       # API clients and utilities
│   │   └── package.json
│   │
│   ├── backend/           # Express.js backend API
│   │   ├── src/
│   │   │   ├── routes/    # API route handlers
│   │   │   ├── services/  # Business logic services
│   │   │   │   ├── doc-navigator/    # RAG pipeline
│   │   │   │   ├── blog-aggregator/  # Blog search
│   │   │   │   └── cost-predictor/   # Cost analysis
│   │   │   ├── lib/       # AWS SDK wrappers
│   │   │   └── config/    # Configuration
│   │   └── package.json
│   │
│   └── shared/            # Shared TypeScript types
│       └── src/types/
│
├── package.json           # Root workspace config
└── README.md
```

## 🔧 AWS Services Used

| Service | Purpose |
|---------|---------|
| **Amazon Bedrock** | AI embeddings (Titan) and LLM (Claude) |
| **DynamoDB** | Vector storage, document metadata, caching |
| **S3** | Document content caching |

### Required Bedrock Models

Enable these models in your AWS Bedrock console:
- `amazon.titan-embed-text-v2:0` - Text embeddings (1024 dimensions)
- `anthropic.claude-3-sonnet-20240229-v1:0` - Answer generation

## 📡 API Reference

### Documentation Navigator

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/docs/rag/query` | POST | Ask a question using RAG |
| `/api/docs/rag/index-official` | POST | Index AWS documentation |
| `/api/docs/rag/index-custom` | POST | Index custom document |
| `/api/docs/rag/status/:docId` | GET | Check indexing status |
| `/api/docs/rag/indexed` | GET | List indexed documents |
| `/api/docs/upload` | POST | Upload custom document |
| `/api/docs/list` | GET | List available documents |

### Blog Aggregator

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/blog/search` | POST | Search AWS blogs |
| `/api/blog/trending` | GET | Get trending topics |
| `/api/blog/recommendations/:id` | GET | Get recommendations |

### Cost Predictor

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cost/workshops` | GET | List workshops |
| `/api/cost/scan` | POST | Scan tutorial for costs |
| `/api/cost/tracking` | GET | Get tracked resources |
| `/api/cost/cleanup/:sessionId` | GET | Get cleanup script |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run backend tests only
npm run test:backend

# Run frontend tests only
npm run test:frontend
```

## 🚢 Deployment

### Frontend (Vercel)

1. Connect your GitHub repository to Vercel
2. Set environment variable: `NEXT_PUBLIC_API_URL=https://your-backend-url/api`
3. Deploy

### Backend (AWS)

See [Backend README](packages/backend/README.md) for detailed deployment instructions.

## 🔐 IAM Permissions

Your AWS credentials need these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:*"],
      "Resource": "arn:aws:dynamodb:*:*:table/bharathastra-*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": ["arn:aws:s3:::bharathastra-*", "arn:aws:s3:::bharathastra-*/*"]
    }
  ]
}
```

## 🛠️ Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:frontend` | Start frontend dev server |
| `npm run dev:backend` | Start backend dev server |
| `npm run build` | Build all packages |
| `npm test` | Run all tests |
| `npm run lint` | Lint all packages |
| `npm run format` | Format code with Prettier |

### Adding New Features

1. Define types in `packages/shared/src/types/`
2. Implement backend service in `packages/backend/src/services/`
3. Add API routes in `packages/backend/src/routes/`
4. Create frontend components in `packages/frontend/src/components/`
5. Add page in `packages/frontend/src/app/`

## 🐛 Troubleshooting

### "Bedrock model not available"
- Enable required models in AWS Bedrock console
- Verify your region supports Bedrock

### "PayloadTooLargeError"
- Large documents may exceed default limits
- Backend is configured for 50MB max payload

### "DynamoDB table not found"
- Run `npm run setup:dynamodb` in backend directory

### "CORS errors"
- Ensure backend is running on correct port
- Check `NEXT_PUBLIC_API_URL` in frontend

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📞 Support

- GitHub Issues: [Report a bug](https://github.com/TechnicalMonish/BharathAstra/issues)
- Documentation: See `/docs` page in the application

---

Built with ❤️ for AWS developers

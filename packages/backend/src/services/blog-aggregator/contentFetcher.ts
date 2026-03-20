import {
  ContentSource,
  type ContentItem,
  type SourceResult,
  type ExpandedQuery,
  AuthorityLevel,
  DifficultyLevel,
} from "@aws-intel/shared";
import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";

// --- Constants ---

const SOURCE_TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;
const BASE_DELAY_MS = 500;

// AWS Blog RSS Feed URLs
const AWS_BLOG_FEEDS = [
  { url: "https://aws.amazon.com/blogs/aws/feed/", category: "AWS News" },
  { url: "https://aws.amazon.com/blogs/compute/feed/", category: "Compute" },
  { url: "https://aws.amazon.com/blogs/database/feed/", category: "Database" },
  { url: "https://aws.amazon.com/blogs/architecture/feed/", category: "Architecture" },
  { url: "https://aws.amazon.com/blogs/security/feed/", category: "Security" },
  { url: "https://aws.amazon.com/blogs/devops/feed/", category: "DevOps" },
  { url: "https://aws.amazon.com/blogs/machine-learning/feed/", category: "Machine Learning" },
  { url: "https://aws.amazon.com/blogs/containers/feed/", category: "Containers" },
  { url: "https://aws.amazon.com/blogs/networking-and-content-delivery/feed/", category: "Networking" },
  { url: "https://aws.amazon.com/blogs/storage/feed/", category: "Storage" },
  { url: "https://aws.amazon.com/blogs/developer/feed/", category: "Developer Tools" },
  { url: "https://aws.amazon.com/blogs/mobile/feed/", category: "Mobile" },
  { url: "https://aws.amazon.com/blogs/big-data/feed/", category: "Big Data" },
  { url: "https://aws.amazon.com/blogs/apn/feed/", category: "Partner Network" },
  { url: "https://aws.amazon.com/blogs/startups/feed/", category: "Startups" },
  { url: "https://aws.amazon.com/blogs/opensource/feed/", category: "Open Source" },
  { url: "https://aws.amazon.com/blogs/gametech/feed/", category: "Game Tech" },
  { url: "https://aws.amazon.com/blogs/iot/feed/", category: "IoT" },
  { url: "https://aws.amazon.com/blogs/media/feed/", category: "Media" },
  { url: "https://aws.amazon.com/blogs/publicsector/feed/", category: "Public Sector" },
];

const rssParser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "AWS-Intel-Platform/1.0",
  },
});

// --- Retry helper ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  baseDelay = BASE_DELAY_MS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// --- Timeout helper ---

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// --- Source adapters ---

// Helper to extract AWS services mentioned in content
function extractAwsServices(text: string): string[] {
  const awsServicePatterns = [
    /\b(EC2|S3|Lambda|DynamoDB|RDS|ECS|EKS|Fargate|CloudFormation|CloudWatch)\b/gi,
    /\b(API Gateway|Step Functions|SNS|SQS|Kinesis|EventBridge|AppSync)\b/gi,
    /\b(IAM|Cognito|KMS|Secrets Manager|WAF|Shield|GuardDuty)\b/gi,
    /\b(VPC|Route 53|CloudFront|ELB|ALB|NLB|Transit Gateway)\b/gi,
    /\b(Redshift|Athena|EMR|Glue|QuickSight|Lake Formation)\b/gi,
    /\b(SageMaker|Bedrock|Rekognition|Comprehend|Textract|Polly|Lex)\b/gi,
    /\b(CodePipeline|CodeBuild|CodeDeploy|CodeCommit|CodeArtifact)\b/gi,
    /\b(Amplify|AppRunner|Lightsail|Elastic Beanstalk)\b/gi,
  ];
  
  const services = new Set<string>();
  for (const pattern of awsServicePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => services.add(m));
    }
  }
  return Array.from(services);
}

// Helper to estimate read time based on content length
function estimateReadTime(content: string): number {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

// Helper to determine difficulty level from content
function determineDifficulty(content: string, title: string): DifficultyLevel {
  const text = `${title} ${content}`.toLowerCase();
  
  const advancedKeywords = ["advanced", "deep dive", "architecture", "optimization", "performance tuning", "at scale"];
  const beginnerKeywords = ["getting started", "introduction", "beginner", "tutorial", "first steps", "basics"];
  
  if (advancedKeywords.some(kw => text.includes(kw))) {
    return DifficultyLevel.ADVANCED;
  }
  if (beginnerKeywords.some(kw => text.includes(kw))) {
    return DifficultyLevel.BEGINNER;
  }
  return DifficultyLevel.INTERMEDIATE;
}

// Helper to check if content matches query
function matchesQuery(item: { title?: string; content?: string; contentSnippet?: string }, query: ExpandedQuery): boolean {
  // If no search terms, return all items
  if (query.originalTerms.length === 0 && query.awsServices.length === 0) {
    return true;
  }
  
  const searchText = `${item.title || ""} ${item.content || ""} ${item.contentSnippet || ""}`.toLowerCase();
  
  // Check original terms
  const termsMatch = query.originalTerms.length === 0 || 
    query.originalTerms.some(term => searchText.includes(term.toLowerCase()));
  
  // Check AWS services
  const servicesMatch = query.awsServices.length === 0 ||
    query.awsServices.some(service => searchText.includes(service.toLowerCase()));
  
  // Check synonyms
  const synonymsMatch = query.synonyms.length === 0 ||
    query.synonyms.some(syn => searchText.includes(syn.toLowerCase()));
  
  // Check concepts
  const conceptsMatch = query.concepts.length === 0 ||
    query.concepts.some(concept => searchText.includes(concept.toLowerCase()));
  
  return termsMatch || servicesMatch || synonymsMatch || conceptsMatch;
}

// Fetch real AWS Blog posts from RSS feeds
async function fetchAwsBlog(query: ExpandedQuery): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];
  
  // Fetch from all AWS blog feeds in parallel
  const feedPromises = AWS_BLOG_FEEDS.map(async (feed) => {
    try {
      const parsedFeed = await rssParser.parseURL(feed.url);
      
      const items: ContentItem[] = (parsedFeed.items || [])
        .filter(item => matchesQuery(item, query))
        .map((item, index) => {
          const content = item.contentSnippet || item.content || "";
          const title = item.title || "Untitled";
          const awsServices = extractAwsServices(`${title} ${content}`);
          
          return {
            id: `aws-blog-${feed.category.toLowerCase().replace(/\s+/g, "-")}-${index}-${Date.now()}`,
            source: ContentSource.AWS_BLOG,
            sourceId: item.guid || item.link,
            title,
            url: item.link || "",
            author: {
              name: item.creator || item.author || "AWS",
              credentials: ["AWS Official"],
              authorityLevel: AuthorityLevel.AWS_EMPLOYEE,
            },
            publishDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            retrievedAt: new Date(),
            content: content.substring(0, 2000), // Limit content size
            metadata: {
              hasCodeExamples: content.includes("<code") || content.includes("```"),
              hasDiagrams: content.includes("<img") || content.includes("diagram"),
              hasStepByStep: content.toLowerCase().includes("step") || content.includes("1."),
              estimatedReadTime: estimateReadTime(content),
              difficultyLevel: determineDifficulty(content, title),
              techStack: [],
              awsServices,
              freeTierCompatible: content.toLowerCase().includes("free tier"),
            },
          };
        });
      
      return items;
    } catch (error) {
      console.error(`Failed to fetch AWS blog feed ${feed.category}:`, error);
      return [];
    }
  });
  
  const results = await Promise.all(feedPromises);
  results.forEach(items => allItems.push(...items));
  
  // Remove duplicates based on URL
  const uniqueItems = Array.from(
    new Map(allItems.map(item => [item.url, item])).values()
  );
  
  return uniqueItems;
}

// Fetch from Reddit public JSON API (no API key needed)
async function fetchReddit(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    const searchTerms = [...query.originalTerms, ...query.awsServices].filter(Boolean);
    if (searchTerms.length === 0) {
      searchTerms.push("aws");
    }
    const searchQuery = searchTerms.join(" ");
    
    // Reddit public JSON API — search r/aws and r/serverless
    const subreddits = ["aws", "serverless", "devops"];
    const allItems: ContentItem[] = [];
    
    for (const sub of subreddits) {
      try {
        const response = await axios.get(`https://www.reddit.com/r/${sub}/search.json`, {
          params: {
            q: searchQuery,
            sort: "relevance",
            t: "year",
            limit: 10,
            restrict_sr: "on",
          },
          timeout: 10000,
          headers: {
            "User-Agent": "AWS-Intel-Platform/1.0 (educational project)",
          },
        });
        
        const posts = response.data?.data?.children || [];
        
        posts.forEach((post: any, index: number) => {
          const data = post.data;
          if (!data) return;
          
          const title = data.title || "Untitled";
          const content = data.selftext || data.title || "";
          
          allItems.push({
            id: `reddit-${data.id || index}-${Date.now()}`,
            source: ContentSource.REDDIT,
            sourceId: data.id,
            title,
            url: data.url?.startsWith("https://www.reddit.com") 
              ? data.url 
              : `https://www.reddit.com${data.permalink || ""}`,
            author: {
              name: data.author || "Anonymous",
              credentials: [],
              authorityLevel: AuthorityLevel.COMMUNITY_MEMBER,
            },
            publishDate: data.created_utc ? new Date(data.created_utc * 1000) : new Date(),
            retrievedAt: new Date(),
            content: content.substring(0, 2000),
            metadata: {
              hasCodeExamples: content.includes("```") || content.includes("    "),
              hasDiagrams: false,
              hasStepByStep: content.toLowerCase().includes("step"),
              estimatedReadTime: estimateReadTime(content),
              difficultyLevel: determineDifficulty(content, title),
              techStack: [],
              awsServices: extractAwsServices(`${title} ${content}`),
            },
            engagement: {
              points: data.score || 0,
              comments: data.num_comments || 0,
              normalizedScore: Math.min(10, (data.score || 0) / 50),
            },
          });
        });
      } catch (err) {
        // Individual subreddit failure is OK
      }
    }
    
    return allItems;
  } catch (error) {
    console.error("Failed to fetch from Reddit:", error);
    return [];
  }
}

// Fetch from Hacker News API (Algolia)
async function fetchHackerNews(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    // Build search query for AWS-related content
    const searchTerms = [...query.originalTerms, ...query.awsServices].filter(Boolean);
    if (searchTerms.length === 0) {
      searchTerms.push("aws");
    }
    const searchQuery = searchTerms.join(" ");
    
    const response = await axios.get("https://hn.algolia.com/api/v1/search", {
      params: {
        query: searchQuery,
        tags: "story",
        hitsPerPage: 30,
      },
      timeout: 12000,
    });
    
    const hits = response.data.hits || [];
    
    return hits
      .map((hit: any, index: number) => {
        const content = hit.story_text || hit.title || "";
        const title = hit.title || "Untitled";
        
        return {
          id: `hn-${hit.objectID || index}-${Date.now()}`,
          source: ContentSource.HACKERNEWS,
          sourceId: hit.objectID,
          title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          author: {
            name: hit.author || "Anonymous",
            credentials: [],
            authorityLevel: AuthorityLevel.COMMUNITY_MEMBER,
          },
          publishDate: hit.created_at ? new Date(hit.created_at) : new Date(),
          retrievedAt: new Date(),
          content: content.substring(0, 2000),
          metadata: {
            hasCodeExamples: content.includes("```") || content.includes("<code"),
            hasDiagrams: false,
            hasStepByStep: false,
            estimatedReadTime: estimateReadTime(content),
            difficultyLevel: determineDifficulty(content, title),
            techStack: [],
            awsServices: extractAwsServices(`${title} ${content}`),
          },
          engagement: {
            points: hit.points || 0,
            comments: hit.num_comments || 0,
            normalizedScore: Math.min(10, (hit.points || 0) / 50),
          },
        };
      });
  } catch (error) {
    console.error("Failed to fetch from Hacker News:", error);
    return [];
  }
}

// Medium RSS feeds for AWS-related content — use axios directly for reliability
const MEDIUM_AWS_FEEDS = [
  "https://medium.com/feed/tag/aws",
  "https://medium.com/feed/tag/amazon-web-services",
];

// Fetch from Medium using axios + rss-parser fallback
async function fetchMedium(query: ExpandedQuery): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];
  
  // Try fetching each feed with axios first (more reliable than rss-parser for Medium)
  for (const feedUrl of MEDIUM_AWS_FEEDS) {
    try {
      const response = await axios.get(feedUrl, {
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        responseType: "text",
      });
      
      // Parse the XML response with rss-parser
      const parsedFeed = await rssParser.parseString(response.data);
      
      (parsedFeed.items || []).slice(0, 10).forEach((item, index) => {
        const content = item.contentSnippet || item.content || "";
        const title = item.title || "Untitled";
        
        allItems.push({
          id: `medium-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: ContentSource.MEDIUM,
          sourceId: item.guid || item.link,
          title,
          url: item.link || "",
          author: {
            name: item.creator || item.author || "Medium Author",
            credentials: [],
            authorityLevel: AuthorityLevel.COMMUNITY_MEMBER,
          },
          publishDate: item.pubDate ? new Date(item.pubDate) : new Date(),
          retrievedAt: new Date(),
          content: content.substring(0, 2000),
          metadata: {
            hasCodeExamples: content.includes("<code") || content.includes("```"),
            hasDiagrams: content.includes("<img"),
            hasStepByStep: content.toLowerCase().includes("step"),
            estimatedReadTime: estimateReadTime(content),
            difficultyLevel: determineDifficulty(content, title),
            techStack: [],
            awsServices: extractAwsServices(`${title} ${content}`),
          },
        });
      });
    } catch (error) {
      console.error(`Failed to fetch Medium feed ${feedUrl}:`, (error as Error).message);
    }
  }
  
  // Remove duplicates
  return Array.from(new Map(allItems.map(item => [item.url, item])).values());
}

// Fetch from Dev.to API — use search endpoint for better results
async function fetchDevTo(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    const searchTerms = [...query.originalTerms, ...query.awsServices].filter(Boolean);
    if (searchTerms.length === 0) {
      searchTerms.push("aws");
    }
    
    // Try both the search endpoint and the tag endpoint
    const requests = [
      // Search endpoint
      axios.get("https://dev.to/api/articles", {
        params: { tag: "aws", per_page: 15, top: 7 },
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      }).catch(() => ({ data: [] })),
      // Also try cloud tag
      axios.get("https://dev.to/api/articles", {
        params: { tag: "cloud", per_page: 10, top: 7 },
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      }).catch(() => ({ data: [] })),
    ];
    
    const responses = await Promise.all(requests);
    const allArticles = [...(responses[0].data || []), ...(responses[1].data || [])];
    
    // Deduplicate by id
    const seen = new Set<number>();
    const articles = allArticles.filter((a: any) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    
    return articles.map((article: any) => {
      const content = article.description || "";
      const title = article.title || "Untitled";
      const url = article.url || "";
      
      return {
        id: `devto-${article.id}-${Date.now()}`,
        source: ContentSource.DEVTO,
        sourceId: String(article.id),
        title,
        url,
        author: {
          name: article.user?.name || article.user?.username || "Dev.to Author",
          credentials: [],
          authorityLevel: AuthorityLevel.COMMUNITY_MEMBER,
        },
        publishDate: article.published_at ? new Date(article.published_at) : new Date(),
        retrievedAt: new Date(),
        content: content.substring(0, 2000),
        metadata: {
          hasCodeExamples: (article.tag_list || []).includes("tutorial"),
          hasDiagrams: false,
          hasStepByStep: title.toLowerCase().includes("how to") || title.toLowerCase().includes("guide"),
          estimatedReadTime: article.reading_time_minutes || estimateReadTime(content),
          difficultyLevel: determineDifficulty(content, title),
          techStack: article.tag_list || [],
          awsServices: extractAwsServices(`${title} ${content}`),
        },
        engagement: {
          likes: article.positive_reactions_count || 0,
          comments: article.comments_count || 0,
          normalizedScore: Math.min(10, (article.positive_reactions_count || 0) / 20),
        },
      };
    });
  } catch (error) {
    console.error("Failed to fetch from Dev.to:", (error as Error).message);
    return [];
  }
}

// Fetch from YouTube via RSS feeds for AWS channels
async function fetchYouTube(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    // AWS official YouTube channel RSS feeds
    const channelFeeds = [
      { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCd6MoB9NC6uYN2grvUNT-Zg", name: "Amazon Web Services" },
      { url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCraiFqWi0qSIxXxXN4IHFBQ", name: "AWS Events" },
    ];
    
    const allItems: ContentItem[] = [];
    
    for (const channel of channelFeeds) {
      try {
        const response = await axios.get(channel.url, {
          timeout: 10000,
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          responseType: "text",
        });
        
        const parsedFeed = await rssParser.parseString(response.data);
        
        (parsedFeed.items || []).slice(0, 10).forEach((item, index) => {
          const title = item.title || "Untitled";
          const content = item.contentSnippet || item.content || title;
          
          allItems.push({
            id: `yt-${channel.name.replace(/\s+/g, "-")}-${index}-${Date.now()}`,
            source: ContentSource.YOUTUBE,
            sourceId: item.id || item.link,
            title,
            url: item.link || "",
            author: {
              name: channel.name,
              credentials: ["AWS Official"],
              authorityLevel: AuthorityLevel.AWS_EMPLOYEE,
            },
            publishDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            retrievedAt: new Date(),
            content: content.substring(0, 2000),
            metadata: {
              hasCodeExamples: false,
              hasDiagrams: true,
              hasStepByStep: title.toLowerCase().includes("tutorial") || title.toLowerCase().includes("how to"),
              estimatedReadTime: 15,
              difficultyLevel: determineDifficulty(content, title),
              techStack: [],
              awsServices: extractAwsServices(`${title} ${content}`),
            },
          });
        });
      } catch (err) {
        console.error(`Failed to fetch YouTube feed ${channel.name}:`, (err as Error).message);
      }
    }
    
    return allItems;
  } catch (error) {
    console.error("Failed to fetch from YouTube:", (error as Error).message);
    return [];
  }
}

// Fetch from GitHub API - search for AWS-related repositories and discussions
async function fetchGitHub(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    const searchTerms = [...query.originalTerms, ...query.awsServices].filter(Boolean);
    if (searchTerms.length === 0) {
      searchTerms.push("aws");
    }
    const searchQuery = `${searchTerms.join(" ")} aws`;
    
    const response = await axios.get("https://api.github.com/search/repositories", {
      params: {
        q: searchQuery,
        sort: "stars",
        order: "desc",
        per_page: 20,
      },
      timeout: 12000,
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AWS-Intel-Platform/1.0",
      },
    });
    
    const repos = response.data.items || [];
    
    return repos.map((repo: any, index: number) => {
      const content = repo.description || "";
      const title = repo.full_name || repo.name || "Untitled";
      
      return {
        id: `github-${repo.id || index}-${Date.now()}`,
        source: ContentSource.GITHUB,
        sourceId: String(repo.id),
        title: `${title} - ${content}`,
        url: repo.html_url || "",
        author: {
          name: repo.owner?.login || "GitHub User",
          credentials: [],
          authorityLevel: repo.owner?.login?.startsWith("aws") ? AuthorityLevel.AWS_EMPLOYEE : AuthorityLevel.COMMUNITY_MEMBER,
        },
        publishDate: repo.pushed_at ? new Date(repo.pushed_at) : new Date(),
        retrievedAt: new Date(),
        content: `${content} Stars: ${repo.stargazers_count}. Language: ${repo.language || "N/A"}. Topics: ${(repo.topics || []).join(", ")}`,
        metadata: {
          hasCodeExamples: true,
          hasDiagrams: false,
          hasStepByStep: false,
          estimatedReadTime: 5,
          difficultyLevel: determineDifficulty(content, title),
          techStack: [repo.language].filter(Boolean),
          awsServices: extractAwsServices(`${title} ${content} ${(repo.topics || []).join(" ")}`),
        },
        engagement: {
          stars: repo.stargazers_count || 0,
          forks: repo.forks_count || 0,
          normalizedScore: Math.min(10, (repo.stargazers_count || 0) / 100),
        },
      };
    });
  } catch (error) {
    console.error("Failed to fetch from GitHub:", error);
    return [];
  }
}

// Fetch from StackOverflow API for AWS-related Q&A
async function fetchTwitter(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    const searchTerms = [...query.originalTerms, ...query.awsServices].filter(Boolean);
    if (searchTerms.length === 0) {
      searchTerms.push("aws");
    }
    const searchQuery = searchTerms.join(" ");
    
    const response = await axios.get("https://api.stackexchange.com/2.3/search/excerpts", {
      params: {
        order: "desc",
        sort: "relevance",
        q: searchQuery,
        tagged: "amazon-web-services",
        site: "stackoverflow",
        pagesize: 15,
        filter: "default",
      },
      timeout: 10000,
    });
    
    const items = response.data?.items || [];
    
    return items
      .filter((item: any) => item.item_type === "question")
      .map((item: any, index: number) => {
        const title = (item.title || "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        const content = (item.excerpt || "").replace(/<[^>]+>/g, "");
        
        return {
          id: `so-${item.question_id || index}-${Date.now()}`,
          source: ContentSource.TWITTER, // Reusing the slot for StackOverflow
          sourceId: String(item.question_id),
          title,
          url: `https://stackoverflow.com/questions/${item.question_id}`,
          author: {
            name: "StackOverflow Community",
            credentials: [],
            authorityLevel: AuthorityLevel.RECOGNIZED_CONTRIBUTOR,
          },
          publishDate: item.creation_date ? new Date(item.creation_date * 1000) : new Date(),
          retrievedAt: new Date(),
          content: content.substring(0, 2000),
          metadata: {
            hasCodeExamples: content.includes("```") || content.includes("<code"),
            hasDiagrams: false,
            hasStepByStep: false,
            estimatedReadTime: estimateReadTime(content),
            difficultyLevel: determineDifficulty(content, title),
            techStack: (item.tags || []),
            awsServices: extractAwsServices(`${title} ${content}`),
          },
          engagement: {
            score: item.score || 0,
            answers: item.answer_count || 0,
            normalizedScore: Math.min(10, (item.score || 0) / 10),
          },
        };
      });
  } catch (error) {
    console.error("Failed to fetch from StackOverflow:", (error as Error).message);
    return [];
  }
}

// AWS Documentation RSS feed
async function fetchAwsDocs(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    // AWS What's New RSS feed - contains documentation updates
    const feedUrl = "https://aws.amazon.com/about-aws/whats-new/recent/feed/";
    const parsedFeed = await rssParser.parseURL(feedUrl);
    
    return (parsedFeed.items || [])
      .slice(0, 20)
      .map((item, index) => {
        const content = item.contentSnippet || item.content || "";
        const title = item.title || "Untitled";
        
        return {
          id: `aws-docs-${index}-${Date.now()}`,
          source: ContentSource.AWS_DOCS,
          sourceId: item.guid || item.link,
          title,
          url: item.link || "",
          author: {
            name: "AWS Documentation",
            credentials: ["AWS Official"],
            authorityLevel: AuthorityLevel.AWS_EMPLOYEE,
          },
          publishDate: item.pubDate ? new Date(item.pubDate) : new Date(),
          retrievedAt: new Date(),
          content: content.substring(0, 2000),
          metadata: {
            hasCodeExamples: content.includes("<code") || content.includes("```"),
            hasDiagrams: content.includes("<img"),
            hasStepByStep: content.toLowerCase().includes("step"),
            estimatedReadTime: estimateReadTime(content),
            difficultyLevel: DifficultyLevel.INTERMEDIATE,
            techStack: [],
            awsServices: extractAwsServices(`${title} ${content}`),
          },
        };
      });
  } catch (error) {
    console.error("Failed to fetch AWS Docs:", error);
    return [];
  }
}

// AWS Whitepapers - scrape the whitepapers page
async function fetchAwsWhitepapers(query: ExpandedQuery): Promise<ContentItem[]> {
  try {
    // Use AWS Whitepapers RSS/Atom feed
    const feedUrl = "https://aws.amazon.com/whitepapers/latest/feed/";
    
    try {
      const parsedFeed = await rssParser.parseURL(feedUrl);
      
      return (parsedFeed.items || [])
        .slice(0, 15)
        .map((item, index) => {
          const content = item.contentSnippet || item.content || "";
          const title = item.title || "Untitled";
          
          return {
            id: `aws-whitepaper-${index}-${Date.now()}`,
            source: ContentSource.AWS_WHITEPAPERS,
            sourceId: item.guid || item.link,
            title,
            url: item.link || "",
            author: {
              name: "AWS",
              credentials: ["AWS Official"],
              authorityLevel: AuthorityLevel.AWS_EMPLOYEE,
            },
            publishDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            retrievedAt: new Date(),
            content: content.substring(0, 2000),
            metadata: {
              hasCodeExamples: false,
              hasDiagrams: true,
              hasStepByStep: false,
              estimatedReadTime: 30, // Whitepapers are typically longer
              difficultyLevel: DifficultyLevel.ADVANCED,
              techStack: [],
              awsServices: extractAwsServices(`${title} ${content}`),
            },
          };
        });
    } catch {
      // Fallback: scrape the whitepapers page
      const response = await axios.get("https://aws.amazon.com/whitepapers/", {
        timeout: 8000,
        headers: {
          "User-Agent": "AWS-Intel-Platform/1.0",
        },
      });
      
      const $ = cheerio.load(response.data);
      const items: ContentItem[] = [];
      
      // Parse whitepaper cards from the page
      $(".m-card, .lb-card, article").each((index, element) => {
        const $el = $(element);
        const title = $el.find("h3, h2, .m-card-title").first().text().trim();
        const link = $el.find("a").first().attr("href");
        const description = $el.find("p, .m-card-description").first().text().trim();
        
        if (title && link) {
          const url = link.startsWith("http") ? link : `https://aws.amazon.com${link}`;
          
          items.push({
            id: `aws-whitepaper-${index}-${Date.now()}`,
            source: ContentSource.AWS_WHITEPAPERS,
            sourceId: url,
            title,
            url,
            author: {
              name: "AWS",
              credentials: ["AWS Official"],
              authorityLevel: AuthorityLevel.AWS_EMPLOYEE,
            },
            publishDate: new Date(),
            retrievedAt: new Date(),
            content: description.substring(0, 2000),
            metadata: {
              hasCodeExamples: false,
              hasDiagrams: true,
              hasStepByStep: false,
              estimatedReadTime: 30,
              difficultyLevel: DifficultyLevel.ADVANCED,
              techStack: [],
              awsServices: extractAwsServices(`${title} ${description}`),
            },
          });
        }
      });
      
      return items.slice(0, 20); // Limit results
    }
  } catch (error) {
    console.error("Failed to fetch AWS Whitepapers:", error);
    return [];
  }
}

// --- Source adapter registry ---

type SourceAdapter = (query: ExpandedQuery) => Promise<ContentItem[]>;

const SOURCE_ADAPTERS: Record<ContentSource, SourceAdapter> = {
  [ContentSource.AWS_BLOG]: fetchAwsBlog,
  [ContentSource.REDDIT]: fetchReddit,
  [ContentSource.HACKERNEWS]: fetchHackerNews,
  [ContentSource.MEDIUM]: fetchMedium,
  [ContentSource.DEVTO]: fetchDevTo,
  [ContentSource.YOUTUBE]: fetchYouTube,
  [ContentSource.GITHUB]: fetchGitHub,
  [ContentSource.TWITTER]: fetchTwitter,
  [ContentSource.AWS_DOCS]: fetchAwsDocs,
  [ContentSource.AWS_WHITEPAPERS]: fetchAwsWhitepapers,
};

// --- ContentFetcher class ---

export class ContentFetcher {
  private adapters: Record<ContentSource, SourceAdapter>;

  constructor(adapters?: Partial<Record<ContentSource, SourceAdapter>>) {
    this.adapters = { ...SOURCE_ADAPTERS, ...adapters };
  }

  /**
   * Fetch content from all sources in parallel with per-source timeout.
   * Continues processing when individual sources fail.
   */
  async fetchFromAllSources(query: ExpandedQuery): Promise<SourceResult[]> {
    const sources = Object.values(ContentSource) as ContentSource[];

    const results = await Promise.all(
      sources.map((source) => this.fetchSourceWithHandling(source, query))
    );

    return results;
  }

  /**
   * Fetch content from a single source — no retry, just timeout.
   */
  async fetchFromSource(
    source: ContentSource,
    query: ExpandedQuery
  ): Promise<ContentItem[]> {
    const adapter = this.adapters[source];
    if (!adapter) {
      throw new Error(`No adapter registered for source: ${source}`);
    }

    return withTimeout(adapter(query), SOURCE_TIMEOUT_MS);
  }

  private async fetchSourceWithHandling(
    source: ContentSource,
    query: ExpandedQuery
  ): Promise<SourceResult> {
    const start = Date.now();
    try {
      const items = await this.fetchFromSource(source, query);
      return {
        source,
        items,
        retrievalTime: Date.now() - start,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      return {
        source,
        items: [],
        error,
        retrievalTime: Date.now() - start,
      };
    }
  }
}

// Export internals for testing
export {
  withRetry,
  withTimeout,
  sleep,
  SOURCE_ADAPTERS,
  SOURCE_TIMEOUT_MS,
  MAX_RETRIES,
  BASE_DELAY_MS,
  fetchAwsBlog,
  fetchReddit,
  fetchHackerNews,
  fetchMedium,
  fetchDevTo,
  fetchYouTube,
  fetchGitHub,
  fetchTwitter,
  fetchAwsDocs,
  fetchAwsWhitepapers,
  type SourceAdapter,
};

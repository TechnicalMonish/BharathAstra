// Enums for the AWS Developer Intelligence Platform

// === Documentation Navigator Enums ===

export enum DocumentFormat {
  PDF = "pdf",
  HTML = "html",
  MARKDOWN = "markdown",
  TEXT = "text",
}

export enum QueryType {
  HOW_TO = "how_to",
  WHAT_IS = "what_is",
  TROUBLESHOOT = "troubleshoot",
  BEST_PRACTICE = "best_practice",
  COMPARISON = "comparison",
}

export enum DocumentType {
  OFFICIAL_AWS = "official_aws",
  CUSTOM_UPLOAD = "custom_upload",
}

export enum AnswerType {
  DIRECT = "direct",
  MULTI_STEP = "multi_step",
  REFERENCE = "reference",
  AMBIGUOUS = "ambiguous",
}

export enum RelationType {
  PREREQUISITE = "prerequisite",
  NEXT_STEP = "next_step",
  RELATED_CONCEPT = "related_concept",
}

export enum ExperienceLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

// === Blog Aggregator Enums ===

export enum ContentSource {
  AWS_BLOG = "aws_blog",
  REDDIT = "reddit",
  HACKERNEWS = "hackernews",
  MEDIUM = "medium",
  DEVTO = "devto",
  YOUTUBE = "youtube",
  GITHUB = "github",
  TWITTER = "twitter",
  AWS_DOCS = "aws_docs",
  AWS_WHITEPAPERS = "aws_whitepapers",
}

export enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum AuthorityLevel {
  AWS_HERO = "aws_hero",
  AWS_EMPLOYEE = "aws_employee",
  RECOGNIZED_CONTRIBUTOR = "recognized_contributor",
  COMMUNITY_MEMBER = "community_member",
  UNKNOWN = "unknown",
}

export enum RecencyRange {
  LAST_WEEK = "last_week",
  LAST_MONTH = "last_month",
  LAST_3_MONTHS = "last_3_months",
  LAST_6_MONTHS = "last_6_months",
  LAST_YEAR = "last_year",
}

export enum ConflictSeverity {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export enum TrendStatus {
  RISING = "rising",
  STABLE = "stable",
  DECLINING = "declining",
}

// === Cost Predictor Enums ===

export enum CostRange {
  FREE = "free",
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum TutorialFormat {
  CLOUDFORMATION = "cloudformation",
  TERRAFORM = "terraform",
  AWS_CLI = "aws_cli",
  INSTRUCTIONAL_TEXT = "instructional_text",
  MIXED = "mixed",
}

export enum CleanupMethod {
  AWS_CLI = "aws_cli",
  CLOUDFORMATION = "cloudformation",
  TERRAFORM = "terraform",
}

export enum SessionStatus {
  ACTIVE = "active",
  PARTIALLY_DELETED = "partially_deleted",
  COMPLETED = "completed",
  ABANDONED = "abandoned",
}

export enum ResourceStatus {
  RUNNING = "running",
  STOPPED = "stopped",
  DELETED = "deleted",
  UNKNOWN = "unknown",
}

export enum NotificationChannel {
  EMAIL = "email",
  IN_APP = "in_app",
  SMS = "sms",
}

export enum NotificationType {
  COST_THRESHOLD = "cost_threshold",
  TIME_THRESHOLD = "time_threshold",
  RESOURCE_STILL_RUNNING = "resource_still_running",
}

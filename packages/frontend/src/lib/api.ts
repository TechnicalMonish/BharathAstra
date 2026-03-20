import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: ApiError;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const API_TIMEOUT = 30000; // 30 seconds

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error)
    );
  }

  private handleError(error: AxiosError): Promise<never> {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
      status: error.response?.status,
    };

    if (error.response) {
      const data = error.response.data as Record<string, unknown>;
      apiError.message = (data?.message as string) || error.message;
      apiError.code = (data?.code as string) || error.code;
      apiError.details = data?.details;
    } else if (error.request) {
      apiError.message = 'Unable to connect to the server. Please check your connection.';
      apiError.code = 'NETWORK_ERROR';
    } else {
      apiError.message = error.message;
    }

    return Promise.reject(apiError);
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  async upload<T>(url: string, file: File, onProgress?: (progress: number) => void): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post<T>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return response.data;
  }
}

export const api = new ApiClient();

// Re-export typed API services for convenience
export { docsApiService } from './docsApi';
export { blogApiService } from './blogApi';
export { costApiService } from './costApi';

// Legacy API exports for backward compatibility
// These wrap the new typed services to maintain existing component compatibility

// Documentation Navigator API (legacy interface)
export const docsApi = {
  query: (question: string, docIds?: string[]) =>
    api.post<{ answer: unknown }>('/docs/query', { question, docIds }),
  
  // RAG query - uses the new RAG pipeline
  ragQuery: (question: string, docIds?: string[]) =>
    api.post<{
      question: string;
      answer: string;
      confidence: number;
      citations: Array<{
        chunkId: string;
        docId: string;
        sectionTitle: string;
        text: string;
        score: number;
      }>;
      followUpQuestions: string[];
      responseTimeMs: number;
    }>('/docs/rag/query', { question, docIds }),
  
  // RAG index - index a document for RAG
  ragIndex: (docUrl: string, docId: string, title: string, category?: string) =>
    api.post<{
      docId: string;
      title: string;
      sections: number;
      indexedAt: string;
      success: boolean;
      errors?: string[];
    }>('/docs/rag/index', { docUrl, docId, title, category }),
  
  // RAG index official - index predefined AWS documentation
  ragIndexOfficial: (docIds?: string[]) =>
    api.post<{
      indexedAt: string;
      results: Array<{
        docId: string;
        title: string;
        success: boolean;
        sections?: number;
        message?: string;
        error?: string;
        errors?: string[];
      }>;
    }>('/docs/rag/index-official', { docIds }),
  
  // RAG status - get index status for a document
  ragStatus: (docId: string) =>
    api.get<{
      docId: string;
      title: string;
      category: string;
      status: string;
      totalChunks: number;
      totalSections: number;
      lastIndexedAt: string;
      errors?: string[];
    }>(`/docs/rag/status/${docId}`),
  
  // RAG indexed - list all indexed documents
  ragIndexed: () =>
    api.get<{
      documents: Array<{
        docId: string;
        title: string;
        category: string;
        status: string;
        totalChunks: number;
        lastIndexedAt: string;
      }>;
    }>('/docs/rag/indexed'),
  
  list: (filter?: { category?: string; searchTerm?: string; type?: string }) =>
    api.get<{ documents: unknown[] }>('/docs/list', { params: filter }),
  
  select: (docIds: string[]) =>
    api.post<{ success: boolean }>('/docs/select', { docIds }),
  
  upload: (file: File, onProgress?: (progress: number) => void) =>
    api.upload<{ document: unknown }>('/docs/upload', file, onProgress),
  
  delete: (docId: string) =>
    api.delete<{ success: boolean }>(`/docs/${docId}`),
  
  getHistory: () =>
    api.get<{ history: unknown[] }>('/docs/history'),
  
  getHistoryAnswer: (questionId: string) =>
    api.get<{ answer: unknown }>(`/docs/history/${questionId}`),
};

// Blog Aggregator API (legacy interface)
export const blogApi = {
  search: (query: string, filters?: Record<string, unknown>) =>
    api.post<{ results: unknown[] }>('/blog/search', { text: query, filters }),
  
  getTrending: () =>
    api.get<{ topics: unknown[] }>('/blog/trending'),
  
  getRecommendations: (itemId: string) =>
    api.get<{ recommendations: unknown[] }>(`/blog/recommendations/${itemId}`),
  
  getConflicts: () =>
    api.get<{ conflicts: unknown[] }>('/blog/conflicts'),
};

// Cost Predictor API (legacy interface)
export const costApi = {
  listWorkshops: (filters?: Record<string, unknown>) =>
    api.get<{ workshops: unknown[] }>('/cost/workshops', { params: filters }),
  
  getWorkshop: (workshopId: string) =>
    api.get<{ workshop: unknown }>(`/cost/workshops/${workshopId}`),
  
  scan: (url: string) =>
    api.post<{ title?: string; url?: string; costAnalysis?: unknown }>('/cost/scan', { url }),
  
  getTracking: () =>
    api.get<{ sessions: unknown[] }>('/cost/tracking'),
  
  startTracking: (workshopId: string, resources?: unknown[], workshopTitle?: string) =>
    api.post<{ session: unknown }>('/cost/tracking/start', { workshopId, resources, workshopTitle }),
  
  markResourceDeleted: (sessionId: string, resourceId: string) =>
    api.put<{ success: boolean }>(`/cost/tracking/${sessionId}/resource/${resourceId}/delete`),
  
  getCleanupScript: (sessionId: string, method?: string) =>
    api.get<{ cleanupScript: unknown }>(`/cost/cleanup/${sessionId}`, { params: method ? { method } : undefined }),
  
  getNotifications: () =>
    api.get<{ notifications: unknown[] }>('/cost/notifications'),
  
  dismissNotification: (notificationId: string) =>
    api.put<{ success: boolean }>(`/cost/notifications/${notificationId}/dismiss`),
  
  configureNotifications: (config: Record<string, unknown>) =>
    api.put<{ success: boolean }>('/cost/notifications/config', config),
};

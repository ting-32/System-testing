export interface ApiClientConfig {
  endpoint: string;
  redirect?: RequestRedirect;
  headers?: HeadersInit;
  silentFail?: boolean;
}

export interface ApiClient {
  post<T, R>(action: string, data: T, config?: Partial<ApiClientConfig>): Promise<R>;
  get<R>(url: string, params?: Record<string, string>, config?: Partial<ApiClientConfig>): Promise<R>;
}

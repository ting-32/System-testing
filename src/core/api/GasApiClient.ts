import { ApiClient, ApiClientConfig } from './ApiClient';
import { GASResponse } from '../../types';

export class GasApiClient implements ApiClient {
  private baseConfig: ApiClientConfig;

  constructor(endpoint: string) {
    this.baseConfig = {
      endpoint,
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    };
  }

  setEndpoint(endpoint: string) {
    this.baseConfig.endpoint = endpoint;
  }

  getEndpoint(): string {
    return this.baseConfig.endpoint;
  }

  async post<T, R>(action: string, data: T, config?: Partial<ApiClientConfig>): Promise<R> {
    if (!this.baseConfig.endpoint) {
      throw new Error('API Endpoint is not configured');
    }

    const finalConfig = { ...this.baseConfig, ...config };
    const payload = { action, data };

    // 加入 15 秒的 Timeout（逾時中斷機制），避免 GAS 無回應導致該訂單死鎖
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let res;
    try {
      res = await fetch(finalConfig.endpoint, {
        method: 'POST',
        redirect: finalConfig.redirect,
        headers: finalConfig.headers,
        body: JSON.stringify(payload),
        signal: controller.signal // 將終止訊號掛載上來
      });
    } finally {
      clearTimeout(timeoutId); // 清除計時器
    }

    const json = await res.json() as GASResponse<any>;
    
    // Abstract the standard GAS response logic
    if (!json.success) {
      // Create a specific error that contains the errorCode for upstream handling
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      throw error;
    }

    return json.data as R;
  }

  async get<R>(url: string, params?: Record<string, string>): Promise<R> {
    if (!this.baseConfig.endpoint) {
      throw new Error('API Endpoint is not configured');
    }
    
    let finalUrl = this.baseConfig.endpoint;
    
    // In our app, get requests to GAS use query params
    if (params) {
      const qs = new URLSearchParams(params).toString();
      finalUrl += `?${qs}`;
    }

    const res = await fetch(finalUrl, { redirect: 'follow' });
    const json = await res.json() as GASResponse<any>;
    
    if (!json.success) {
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      throw error;
    }

    return json.data as unknown as R;
  }
}

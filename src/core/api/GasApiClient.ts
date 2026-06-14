import { ApiClient, ApiClientConfig } from './ApiClient';
import { GASResponse } from '../../types';
import { fetchWithRetry } from '../../utils/fetchUtils';

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
    const token = localStorage.getItem('APP_SESSION_TOKEN');
    const payload = { action, token: token || "", data };
    const timeoutToUse = finalConfig.timeoutMs ?? 25000;
    const maxLockRetries = 3;

    for (let attempt = 0; attempt <= maxLockRetries; attempt++) {
      let res;
      try {
        res = await fetchWithRetry(finalConfig.endpoint, {
          method: 'POST',
          redirect: finalConfig.redirect,
          headers: finalConfig.headers,
          body: JSON.stringify(payload),
          signal: finalConfig.signal
        }, undefined, 2, 1500, finalConfig.silentFail, timeoutToUse);
      } catch (err: any) {
        if (err.message === 'ABORTED_BY_USER' || err.message === 'ABORTED') {
           throw err;
        }
        if (err.name === 'AbortError' || err.message === 'TIMEOUT') {
          throw new Error(`API Request Timeout: 超過 ${timeoutToUse/1000} 秒未回應`);
        }
        throw err;
      }

      const json = await res.json() as GASResponse<any>;
      
      // Abstract the standard GAS response logic
      if (!json.success) {
        if (json.error === "UNAUTHORIZED_OR_EXPIRED") {
          localStorage.removeItem('nm_auth_status');
          localStorage.removeItem('APP_SESSION_TOKEN');
          localStorage.removeItem('APP_USER_ROLE');
          localStorage.removeItem('APP_USER_NAME');
          // Emit a custom event so the UI can log out gracefully without unhandled alerts in iframes
          window.dispatchEvent(new Event('app-unauthorized'));
          throw new Error("UNAUTHORIZED_OR_EXPIRED");
        }
        if (json.error && json.error.includes('Lock Timeout') && attempt < maxLockRetries) {
          console.warn(`Lock Timeout encountered, retrying... (Attempt ${attempt + 1}/${maxLockRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1) + Math.random() * 1000));
          continue;
        }
        // Create a specific error that contains the errorCode for upstream handling
        const error = new Error(json.error || 'API Request Failed');
        (error as any).errorCode = json.errorCode;
        if ((json as any).serverData) {
          (error as any).serverData = (json as any).serverData;
        } else if (json.data) {
          (error as any).serverData = json.data;
        }
        throw error;
      }

      return json.data as R;
    }
    throw new Error('Unexpected end of post loop');
  }

  async get<R>(_: string, params?: Record<string, string>, config?: Partial<ApiClientConfig>): Promise<R> {
    if (!this.baseConfig.endpoint) {
      throw new Error('API Endpoint is not configured');
    }
    
    let finalUrl = this.baseConfig.endpoint;
    
    // In our app, get requests to GAS use query params
    if (params) {
      const qs = new URLSearchParams(params).toString();
      finalUrl += `?${qs}`;
    }

    const finalConfig = { ...this.baseConfig, ...config };
    const timeoutToUse = finalConfig.timeoutMs ?? 25000;
    
    let res;
    try {
      res = await fetchWithRetry(finalUrl, { 
        redirect: finalConfig.redirect, 
        headers: finalConfig.headers, 
        signal: finalConfig.signal 
      }, undefined, 2, 1500, finalConfig.silentFail, timeoutToUse);
    } catch (err: any) {
      if (err.message === 'ABORTED_BY_USER' || err.message === 'ABORTED') {
         throw err;
      }
      throw err;
    }
    
    const json = await res.json() as GASResponse<any>;
    
    if (!json.success) {
      const error = new Error(json.error || 'API Request Failed');
      (error as any).errorCode = json.errorCode;
      if ((json as any).serverData) {
        (error as any).serverData = (json as any).serverData;
      } else if (json.data) {
        (error as any).serverData = json.data;
      }
      throw error;
    }

    return json.data as unknown as R;
  }
}

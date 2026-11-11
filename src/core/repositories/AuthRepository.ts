import { ApiClient } from '../api/ApiClient';

export interface LoginPayload {
  username?: string;
  password: string;
  deviceId?: string;
  userAgent?: string;
}

export interface IAuthRepository {
  login(
    credentialsOrPassword: string | LoginPayload,
    deviceId?: string,
    userAgent?: string
  ): Promise<any>;
  changePassword(oldPassword: string, newPassword: string, deviceId?: string, userAgent?: string): Promise<boolean>;
}

export class AuthRepository implements IAuthRepository {
  constructor(private apiClient: ApiClient) {}

  async login(
    credentialsOrPassword: string | LoginPayload,
    deviceId?: string,
    userAgent?: string
  ): Promise<any> {
    let payload: LoginPayload;
    if (typeof credentialsOrPassword === 'string') {
      payload = {
        password: credentialsOrPassword,
        deviceId,
        userAgent
      };
    } else {
      payload = credentialsOrPassword;
    }
    const data = await this.apiClient.post<any, any>('login', payload);
    // 如果後端的 result 就是 json.data
    // 如果舊版回傳 true, 我們這裡兼容一下
    if (data === true) return true;
    return data;
  }

  async changePassword(oldPassword: string, newPassword: string, deviceId?: string, userAgent?: string): Promise<boolean> {
    const data = await this.apiClient.post<any, boolean>('changePassword', { oldPassword, newPassword, deviceId, userAgent });
    return data === true;
  }
}

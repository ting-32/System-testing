import { ApiClient } from '../api/ApiClient';
import { Order } from '../../types';

export interface IOrderRepository {
  getOrder(id: string): Promise<Order>;
  createOrder(order: Partial<Order>): Promise<Order>;
  updateOrderContent(order: Partial<Order>, version?: number): Promise<Order>;
  updateOrderStatus(order: Partial<Order>, version?: number): Promise<Order>;
  deleteOrder(id: string, version?: number): Promise<boolean>;
}

export class OrderRepository implements IOrderRepository {
  constructor(private apiClient: ApiClient) {}

  async getOrder(id: string): Promise<Order> {
    return this.apiClient.post<{ id: string }, Order>('getOrder', { id });
  }

  async createOrder(order: Partial<Order>): Promise<Order> {
    return this.apiClient.post<Partial<Order>, Order>('createOrder', order);
  }

  async updateOrderContent(order: Partial<Order>, version?: number): Promise<Order> {
    const payload = { ...order, version };
    return this.apiClient.post<Partial<Order>, Order>('updateOrderContent', payload);
  }

  async updateOrderStatus(order: Partial<Order>, version?: number): Promise<Order> {
    const payload = { ...order, version };
    return this.apiClient.post<Partial<Order>, Order>('updateOrderStatus', payload);
  }

  async deleteOrder(id: string, version?: number): Promise<boolean> {
    const payload = { id, version };
    await this.apiClient.post<any, any>('deleteOrder', payload);
    return true;
  }
}

import { IOrderRepository } from '../repositories/OrderRepository';
import { Order, Product } from '../../types';
import { PromiseQueue } from '../utils/PromiseQueue';

export class OrderService {
  private queue = new PromiseQueue();

  constructor(private orderRepo: IOrderRepository) {}

  private mapOrderToDto(order: Order, products: Product[]): Partial<Order> {
    const uploadItems = order.items.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      return { 
        productId: item.productId,
        productName: item.productName || p?.name || item.productId, 
        quantity: item.quantity, 
        unit: item.unit 
      };
    });
    return { ...order, items: uploadItems };
  }

  async saveOrder(
    action: 'createOrder' | 'updateOrderContent' | 'updateOrderStatus' | 'deleteOrder',
    order: Order,
    products: Product[],
    originalLastUpdated?: number
  ): Promise<Order> {
    const doSave = async (versionToUse?: number): Promise<number | undefined> => {
      try {
        const payload = this.mapOrderToDto(order, products);
        
        let result: Order;
        switch (action) {
          case 'createOrder':
            result = await this.orderRepo.createOrder(payload);
            break;
          case 'updateOrderContent':
            result = await this.orderRepo.updateOrderContent(payload, versionToUse);
            break;
          case 'updateOrderStatus':
            result = await this.orderRepo.updateOrderStatus(payload, versionToUse);
            break;
          case 'deleteOrder':
            await this.orderRepo.deleteOrder(order.id, versionToUse);
            result = { ...order }; // return mock order on delete
            break;
        }
        
        // Return new version
        return result.lastUpdated !== undefined ? result.lastUpdated : versionToUse;

      } catch (e: any) {
        if (e.errorCode === 'ERR_VERSION_CONFLICT') {
          console.log("Auto-resolving conflict for order:", order.id);
          const latestOrder = await this.orderRepo.getOrder(order.id);
          
          if (latestOrder && latestOrder.lastUpdated !== undefined) {
             return doSave(latestOrder.lastUpdated); // Retry with new version
          }
        }
        throw e;
      }
    };

    const newVersion = await this.queue.enqueue<number | undefined>(
      order.id, 
      originalLastUpdated, 
      (prevVersion) => doSave(prevVersion)
    );

    return { ...order, lastUpdated: newVersion };
  }
}

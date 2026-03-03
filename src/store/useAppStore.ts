import { create } from 'zustand';
import { Order, Customer, Product, OrderItem } from '../types';

interface AppState {
  orders: Order[];
  customers: Customer[];
  products: Product[];
  setOrders: (orders: Order[] | ((prev: Order[]) => Order[])) => void;
  setCustomers: (customers: Customer[] | ((prev: Customer[]) => Customer[])) => void;
  setProducts: (products: Product[] | ((prev: Product[]) => Product[])) => void;

  // Global UI State
  activeTab: 'orders' | 'customers' | 'products' | 'work' | 'schedule' | 'finance';
  setActiveTab: (tab: 'orders' | 'customers' | 'products' | 'work' | 'schedule' | 'finance') => void;

  isInitialLoading: boolean;
  setIsInitialLoading: (loading: boolean) => void;

  isBackgroundSyncing: boolean;
  setIsBackgroundSyncing: (syncing: boolean) => void;

  isSaving: boolean;
  setIsSaving: (saving: boolean) => void;

  // Modals state
  isAddingOrder: boolean;
  setIsAddingOrder: (isOpen: boolean) => void;

  editingOrderId: string | null;
  setEditingOrderId: (id: string | null) => void;

  isEditingCustomer: string | null;
  setIsEditingCustomer: (id: string | null) => void;

  isEditingProduct: string | null;
  setIsEditingProduct: (id: string | null) => void;

  quickAddData: { customerName: string; items: OrderItem[] } | null;
  setQuickAddData: (data: { customerName: string; items: OrderItem[] } | null) => void;

  // Forms state
  orderForm: {
    customerType: 'existing' | 'retail';
    customerId: string;
    customerName: string;
    deliveryTime: string;
    deliveryMethod: string;
    items: OrderItem[];
    note: string;
  };
  setOrderForm: (form: any | ((prev: any) => any)) => void;
  
  customerForm: Partial<Customer>;
  setCustomerForm: (form: Partial<Customer> | ((prev: Partial<Customer>) => Partial<Customer>)) => void;

  productForm: Partial<Product>;
  setProductForm: (form: Partial<Product> | ((prev: Partial<Product>) => Partial<Product>)) => void;
}

export const useAppStore = create<AppState>((set) => ({
  orders: [],
  customers: [],
  products: [],
  setOrders: (orders) => set((state) => ({ orders: typeof orders === 'function' ? orders(state.orders) : orders })),
  setCustomers: (customers) => set((state) => ({ customers: typeof customers === 'function' ? customers(state.customers) : customers })),
  setProducts: (products) => set((state) => ({ products: typeof products === 'function' ? products(state.products) : products })),

  activeTab: 'orders',
  setActiveTab: (tab) => set({ activeTab: tab }),

  isInitialLoading: true,
  setIsInitialLoading: (loading) => set({ isInitialLoading: loading }),

  isBackgroundSyncing: false,
  setIsBackgroundSyncing: (syncing) => set({ isBackgroundSyncing: syncing }),

  isSaving: false,
  setIsSaving: (saving) => set({ isSaving: saving }),

  isAddingOrder: false,
  setIsAddingOrder: (isOpen) => set({ isAddingOrder: isOpen }),

  editingOrderId: null,
  setEditingOrderId: (id) => set({ editingOrderId: id }),

  isEditingCustomer: null,
  setIsEditingCustomer: (id) => set({ isEditingCustomer: id }),

  isEditingProduct: null,
  setIsEditingProduct: (id) => set({ isEditingProduct: id }),

  quickAddData: null,
  setQuickAddData: (data) => set({ quickAddData: data }),

  orderForm: {
    customerType: 'existing',
    customerId: '',
    customerName: '',
    deliveryTime: '08:00',
    deliveryMethod: '',
    items: [{ productId: '', quantity: 10, unit: '斤' }],
    note: ''
  },
  setOrderForm: (form) => set((state) => ({ orderForm: typeof form === 'function' ? form(state.orderForm) : form })),

  customerForm: {},
  setCustomerForm: (form) => set((state) => ({ customerForm: typeof form === 'function' ? form(state.customerForm) : form })),

  productForm: {},
  setProductForm: (form) => set((state) => ({ productForm: typeof form === 'function' ? form(state.productForm) : form })),
}));

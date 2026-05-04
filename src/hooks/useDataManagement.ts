import React from 'react';
import { Customer, Product, ToastType } from '../types';

interface UseDataManagementProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  apiEndpoint: string;
  isSaving: boolean;
  setIsSaving: (isSaving: boolean) => void;
  customerForm: any;
  productForm: any;
  isEditingCustomer: string | null;
  setIsEditingCustomer: (id: string | null) => void;
  isEditingProduct: string | null;
  setIsEditingProduct: (id: string | null) => void;
  editingVersionRef: React.MutableRefObject<number | undefined>;
  setConflictData: any;
  addToast: (msg: string, type: ToastType) => void;
  setConfirmConfig: React.Dispatch<React.SetStateAction<any>>;
}

export const useDataManagement = ({
  customers,
  setCustomers,
  products,
  setProducts,
  apiEndpoint,
  isSaving,
  setIsSaving,
  customerForm,
  productForm,
  isEditingCustomer,
  setIsEditingCustomer,
  isEditingProduct,
  setIsEditingProduct,
  editingVersionRef,
  setConflictData,
  addToast,
  setConfirmConfig
}: UseDataManagementProps) => {

  const handleSaveCustomer = async () => { 
    if (!customerForm.name || isSaving) return; 
    setIsSaving(true); 
    
    const isDuplicateName = customers.some(c => c.name.trim() === (customerForm.name || '').trim() && c.id !== (isEditingCustomer === 'new' ? null : isEditingCustomer)); 
    if (isDuplicateName) { addToast('客戶名稱不可重複！', 'error'); setIsSaving(false); return; } 
    
    // Validate coordinates
    if (customerForm.coordinates) {
      const coordPattern = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
      if (!coordPattern.test(customerForm.coordinates)) {
        addToast('請輸入正確的座標格式，例如：25.033964, 121.564468', 'error');
        setIsSaving(false);
        return;
      }
    }

    const finalCustomer: Customer = { id: isEditingCustomer === 'new' ? Date.now().toString() : (isEditingCustomer as string), name: (customerForm.name || '').trim(), phone: (customerForm.phone || '').trim(), address: (customerForm.address || '').trim(), coordinates: (customerForm.coordinates || '').trim(), deliveryTime: customerForm.deliveryTime || '08:00', deliveryMethod: customerForm.deliveryMethod || '', paymentTerm: customerForm.paymentTerm || 'regular', defaultItems: (customerForm.defaultItems || []).filter((i: any) => i.productId !== ''), priceList: (customerForm.priceList || []), offDays: customerForm.offDays || [], holidayDates: customerForm.holidayDates || [], defaultTrip: customerForm.defaultTrip || '', autoOrderEnabled: customerForm.autoOrderEnabled || false }; 
    
    // Backup old list for revert
    const previousCustomers = [...customers];

    // Optimistic Update
    if (isEditingCustomer === 'new') setCustomers([...customers, finalCustomer]); 
    else setCustomers(customers.map(c => c.id === isEditingCustomer ? finalCustomer : c)); 
    
    // Close modal UI immediately
    setIsEditingCustomer(null); 

    try { 
      if (apiEndpoint) { 
        const payload = finalCustomer;
        // 如果是編輯，加上原始版本號
        if (isEditingCustomer !== 'new') {
           (payload as any).originalLastUpdated = editingVersionRef.current;
        }

        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateCustomer', data: payload }) }); 
        const json = await res.json();
        
        if (!json.success) {
           setCustomers(previousCustomers); // Revert
           if (json.errorCode === 'ERR_VERSION_CONFLICT') {
              setConflictData({
                 action: 'updateCustomer',
                 data: payload,
                 description: `更新店家: ${finalCustomer.name}`
              });
           } else {
              addToast('店家資料儲存失敗', 'error');
           }
           setIsSaving(false);
           return;
        }
      } 
    } catch (e) { 
      console.error(e); 
      setCustomers(previousCustomers); // Revert
      addToast('店家資料儲存失敗，請檢查網路', 'error');
    } 
    
    setIsSaving(false); 
    editingVersionRef.current = undefined;
    addToast('店家資料已儲存', 'success'); 
  };

  const handleSaveProduct = async () => { 
    if (!productForm.name || isSaving) return; 
    setIsSaving(true); 
    const finalProduct = { id: isEditingProduct === 'new' ? 'p' + Date.now() : (isEditingProduct as string), name: productForm.name || '', unit: productForm.unit || '斤', price: Number(productForm.price) || 0, category: productForm.category || 'other' }; 
    
    const previousProducts = [...products];
    if (isEditingProduct === 'new') setProducts([...products, finalProduct]); 
    else setProducts(products.map(p => p.id === isEditingProduct ? finalProduct : p)); 
    
    setIsEditingProduct(null); 

    try { 
      if (apiEndpoint) { 
        const payload = finalProduct;
        if (isEditingProduct !== 'new') {
           (payload as any).originalLastUpdated = editingVersionRef.current;
        }
        const res = await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'updateProduct', data: payload }) }); 
        const json = await res.json();
        if (!json.success) {
           setProducts(previousProducts);
           if (json.errorCode === 'ERR_VERSION_CONFLICT') {
              setConflictData({
                 action: 'updateProduct',
                 data: payload,
                 description: `更新品項: ${finalProduct.name}`
              });
           } else {
              addToast('品項資料儲存失敗', 'error');
           }
           setIsSaving(false);
           return;
        }
      } 
    } catch (e) { 
      console.error(e); 
      setProducts(previousProducts);
      addToast('品項資料儲存失敗', 'error');
    } 
    
    setIsSaving(false); 
    editingVersionRef.current = undefined;
    addToast('品項資料已儲存', 'success'); 
  };

  const executeDeleteCustomer = async (customerId: string) => { 
    setConfirmConfig((prev: any) => ({ ...prev, isOpen: false })); 
    const customerBackup = customers.find(c => c.id === customerId); 
    if (!customerBackup) return; 
    setCustomers((prev: Customer[]) => prev.filter(c => c.id !== customerId)); 
    try { 
      if (apiEndpoint) { 
        await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteCustomer', data: { id: customerId, originalLastUpdated: customerBackup.lastUpdated } }) }); 
      } 
    } catch (e) { 
      console.error("刪除失敗:", e); 
      addToast("雲端同步刪除失敗，請檢查網路", 'error'); 
      setCustomers((prev: Customer[]) => [...prev, customerBackup]); 
    } 
  };

  const executeDeleteProduct = async (productId: string) => { 
    setConfirmConfig((prev: any) => ({ ...prev, isOpen: false })); 
    const productBackup = products.find(p => p.id === productId); 
    if (!productBackup) return; 
    setProducts((prev: Product[]) => prev.filter(p => p.id !== productId)); 
    try { 
      if (apiEndpoint) { 
        await fetch(apiEndpoint, { method: 'POST', body: JSON.stringify({ action: 'deleteProduct', data: { id: productId, originalLastUpdated: productBackup.lastUpdated } }) }); 
      } 
    } catch (e) { 
      console.error("刪除失敗:", e); 
      addToast("雲端同步刪除失敗，請檢查網路", 'error'); 
      setProducts((prev: Product[]) => [...prev, productBackup]); 
    } 
  };

  const handleDeleteCustomer = (customerId: string) => { setConfirmConfig({ isOpen: true, title: '刪除店家', message: '確定要刪除此店家嗎？\n這將一併刪除相關的設定。', onConfirm: () => executeDeleteCustomer(customerId) }); };
  const handleDeleteProduct = (productId: string) => { setConfirmConfig({ isOpen: true, title: '刪除品項', message: '確定要刪除此品項嗎？\n請確認該品項已無生產需求。', onConfirm: () => executeDeleteProduct(productId) }); };

  return {
    handleSaveCustomer,
    handleSaveProduct,
    handleDeleteCustomer,
    handleDeleteProduct
  };
};

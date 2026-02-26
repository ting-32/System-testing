import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Customer, Product, OrderItem, ToastType } from '../types';
import { formatDateStr, formatTimeForInput } from '../utils';

interface UseVoiceAssistantProps {
  customers: Customer[];
  products: Product[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setOrderForm: React.Dispatch<React.SetStateAction<any>>;
  setEditingOrderId: (id: string | null) => void;
  setIsAddingOrder: (isAdding: boolean) => void;
  setCustomerPickerConfig: (config: any) => void;
  handleSelectExistingCustomer: (id: string) => void;
  addToast: (msg: string, type: ToastType) => void;
}

export const useVoiceAssistant = ({
  customers,
  products,
  selectedDate,
  setSelectedDate,
  setOrderForm,
  setEditingOrderId,
  setIsAddingOrder,
  setCustomerPickerConfig,
  handleSelectExistingCustomer,
  addToast
}: UseVoiceAssistantProps) => {
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceLoadingText, setVoiceLoadingText] = useState('AI 正在解析您的訂單...');

  // Effect for dynamic loading text
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isProcessingVoice) {
      setVoiceLoadingText('AI 正在解析您的訂單...');
      timer = setTimeout(() => {
        setVoiceLoadingText('正在思考中，請稍候...');
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [isProcessingVoice]);

  const handleProcessVoiceOrder = async (transcript: string) => {
    setIsProcessingVoice(true);

    try {
      const realTodayDate = formatDateStr(new Date());
      const currentViewDate = selectedDate || realTodayDate;
      const simpleCustomers = customers.map(c => ({ id: c.id, name: c.name }));
      const simpleProducts = products.map(p => ({ id: p.id, name: p.name, category: p.category }));

      // Prompt Engineering
      const prompt = `
        你是一個專業的訂單管理 AI 助手。

        系統基準資訊：
        1. 真實今天 (Real Today): ${realTodayDate} (以此日期計算「明天」、「後天」、「下週一」等相對日期)。
        2. 使用者當前畫面 (Current View): ${currentViewDate} (如果使用者完全沒有提到日期，請將訂單歸類到此日期)。

        任務：將使用者的語音文字轉換為 JSON 格式。

        已知客戶列表：
        ${JSON.stringify(simpleCustomers)}

        已知產品列表：
        ${JSON.stringify(simpleProducts)}

        使用者說：
        "${transcript}"

        規則：
        1. 日期計算邏輯 (重要)：
           - 如果使用者說了相對時間（如「明天」、「下週一」），請務必以 [真實今天 ${realTodayDate}] 為基準進行計算。
           - 如果使用者完全沒有提到時間，請將訂單歸類到 [使用者當前畫面 ${currentViewDate}] 的日期。
        2. 客戶名稱與產品名稱請進行模糊比對，回傳對應的 ID。
        3. 如果找不到對應客戶或產品，ID 留空，將文字放入 Note。
        4. 數量請統一轉換為數字。
        
        Config: Use schema for output.
      `;

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              customerName: { type: Type.STRING },
              customerId: { type: Type.STRING },
              deliveryDate: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    productId: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING }
                  }
                }
              },
              note: { type: Type.STRING }
            }
          }
        }
      });

      const jsonText = response.text;
      if (!jsonText) throw new Error("Empty response from AI");
      const result = JSON.parse(jsonText);

      // Populate Form
      const newItems: OrderItem[] = (result.items || []).map((i: any) => ({
        productId: i.productId || '',
        quantity: i.quantity || 0,
        unit: i.unit || '斤'
      }));

      // Find Customer Delivery Method if ID matched
      let deliveryMethod = '';
      let deliveryTime = '08:00';
      
      if (result.customerId) {
        const c = customers.find(x => x.id === result.customerId);
        if (c) {
          deliveryMethod = c.deliveryMethod || '';
          deliveryTime = formatTimeForInput(c.deliveryTime);
        }
      }

      setOrderForm(prev => ({
        ...prev,
        customerType: 'existing', // Default to existing
        customerName: result.customerName || transcript.substring(0, 10), // Fallback name
        customerId: result.customerId || '',
        deliveryTime: deliveryTime,
        deliveryMethod: deliveryMethod,
        items: newItems.length > 0 ? newItems : [{ productId: '', quantity: 10, unit: '斤' }],
        note: result.note || ''
      }));

      // Update Date if AI parsed a different date
      if (result.deliveryDate && result.deliveryDate !== selectedDate) {
        setSelectedDate(result.deliveryDate);
        addToast(`已切換至 ${result.deliveryDate}`, 'info');
      }

      // Open Editor
      setEditingOrderId(null);
      setIsAddingOrder(true);
      
      // UX: If customer not found, open picker automatically after a short delay
      if (!result.customerId) {
         setTimeout(() => {
            setCustomerPickerConfig({
               isOpen: true,
               onSelect: (id: string) => handleSelectExistingCustomer(id)
            });
            addToast('AI 未能確定店家，請手動選擇', 'info');
         }, 500);
      } else {
         addToast('AI 解析成功！請確認內容', 'success');
      }

    } catch (e: any) {
      console.error("AI Error:", e);
      let errorMessage = 'AI 解析失敗，請手動輸入';
      
      const errorStr = e.toString().toLowerCase();

      // 詳細錯誤分類 logic
      if (errorStr.includes('401') || errorStr.includes('403') || errorStr.includes('key')) {
         errorMessage = '系統設定異常 (API Key)';
      } else if (errorStr.includes('empty response')) {
         errorMessage = '抱歉，沒聽清楚，請再試一次';
      } else if (errorStr.includes('fetch') || errorStr.includes('network') || errorStr.includes('offline')) {
         errorMessage = '網路連線不穩';
      }

      addToast(errorMessage, 'error');
      
      // Still open the form but empty
      setEditingOrderId(null);
      setIsAddingOrder(true);
      setOrderForm(prev => ({ ...prev, note: `語音轉錄: ${transcript}` }));
    } finally {
      setIsProcessingVoice(false);
    }
  };

  return {
    isVoiceModalOpen,
    setIsVoiceModalOpen,
    isProcessingVoice,
    voiceLoadingText,
    handleProcessVoiceOrder
  };
};
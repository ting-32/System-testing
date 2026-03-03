import React, { useState, useEffect } from 'react';
import { Customer, Product, OrderItem, ToastType } from '../types';
import { formatDateStr, formatTimeForInput } from '../utils';
import { GoogleGenAI, Type } from "@google/genai";

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

// Step 1: 同義詞字典
const PRODUCT_ALIASES: Record<string, string[]> = {
  '油麵': ['黃麵', '切仔麵', '油面', '黃面'],
  '陽春麵': ['白麵', '扁麵', '陽春面', '白面'],
  '意麵': ['鹽水意麵', '乾意麵', '意面'],
  '拉麵': ['細拉麵', '粗拉麵', '拉面'],
  '米粉': ['炊粉', '新竹米粉'],
  '冬粉': ['粉絲', '冬粉'],
  '板條': ['粿仔', '粄條', '粿仔條'],
  '水餃皮': ['餃子皮'],
  '餛飩皮': ['雲吞皮', '扁食皮'],
};

// 客戶同義詞字典 (可根據實際需求擴充)
const CUSTOMER_ALIASES: Record<string, string[]> = {
  '民雄阿碧鴨肉羹': ['阿碧', '阿碧鴨肉羹', '鴨肉羹'],
  '阿吉麵攤': ['阿吉', '阿吉仔'],
  '俗擱大碗': ['俗擱大碗', '大碗'],
  '正宗民雄鵝肉亭': ['鵝肉亭', '正宗鵝肉', '民雄鵝肉亭'],
  '崙仔頂': ['崙仔頂', '崙頂'],
  '阿蘭': ['阿蘭'],
  '西安素食館': ['西安', '西安素食'],
  '椪皮麵': ['椪皮', '碰皮麵'],
  '民雄鴨對寶烤鴨專賣店': ['鴨對寶', '烤鴨', '民雄烤鴨'],
  '阿國鱔魚麵': ['阿國', '阿國鱔魚', '鱔魚麵', 'agoda'],
  '存金': ['存金'],
  '全民素食': ['全民', '全民素食'],
  '協同高級中學附設幼稚園': ['協同', '協同幼稚園', '幼稚園'],
  '阿堂生炒鱔魚麵': ['阿堂', '阿堂鱔魚', '生炒鱔魚'],
  '韓楓館': ['韓楓', '韓楓館'],
  '鵝肉慶': ['鵝肉慶', '阿慶'],
  '鵝肉町': ['鵝肉町'],
  '民雄大慶鵝肉': ['大慶', '大慶鵝肉'],
  '廟街水餃': ['廟街', '廟街水餃'],
  '巷口素食': ['巷口', '巷口素食'],
  '天一麵館': ['天一', '天一麵'],
  '味川素食館': ['味川', '味川素食'],
  '民雄麵攤': ['民雄麵', '民雄麵攤'],
  '鐵皮屋國民小吃': ['鐵皮屋', '國民小吃'],
  '民雄阿君鵝肉': ['阿君', '阿君鵝肉'],
  '市場口': ['市場口'],
  '巷子里小館': ['巷子裡', '巷子里', '巷子內'],
  '韓山寺 平價韓式料理': ['韓山寺', '韓式料理'],
  '深海鮮土魠魚羹-民雄店': ['深海鮮', '土魠魚羹', '深海'],
  '木村火雞肉飯': ['木村', '木村火雞肉'],
  '意麵': ['意麵'],
  '麥香美': ['麥香美'],
  '民雄客家條&椰子': ['客家條', '椰子', '民雄客家'],
  '中正美食': ['中正美食', '中正'],
  '東榮早午餐': ['東榮', '東榮早餐'],
  '玉鳳河粉': ['玉鳳', '玉鳳河粉'],
  '福星藥頭排骨': ['福星', '藥頭排骨'],
  '菁埔': ['菁埔'],
  '微笑火雞肉飯': ['微笑', '微笑火雞肉'],
  '雙福涼麵': ['雙福', '雙福涼麵'],
  '林姵君': ['林姵君', '姵君'],
  '阿琴豬腳飯': ['阿琴', '阿琴豬腳'],
  '悦來食堂': ['悦來', '悅來'],
  '傻師傅（香香）': ['傻師傅', '香香'],
  '中正榕樹下': ['榕樹下', '中正榕樹'],
  '中正佳豐': ['佳豐', '中正佳豐'],
  '味芳': ['味芳'],
  '南華': ['南華'],
  '菁埔寶貝': ['寶貝', '菁埔寶貝'],
  '村長肉羹': ['村長', '村長肉羹'],
  '市口肉羹': ['市口', '市口肉羹'],
  '全面鍋燒': ['全面', '全面鍋燒'],
  '永富牛肉麵': ['永富牛肉', '永富'], 
  '鼎鼎堂素食': ['鼎鼎堂', '鼎鼎堂素食'],
  '復成小吃': ['復成', '復成小吃'],
  '慶順早餐店': ['慶順', '慶順早餐'],
};

// 產品單位換算表 (包 -> 斤)
const PRODUCT_UNIT_CONVERSION: Record<string, number> = {
  '油麵': 5,
  '陽春麵': 5,
  '意麵': 5,
  '板條': 2.5,
  '米苔目': 1,
  '水餃皮(小)': 1,
  '水餃皮(大)': 1,
  '餛飩皮(小)': 1,
  '餛飩皮(大)': 1,
};

// 中文數字轉換
const parseChineseNumber = (str: string): number => {
  const map: Record<string, number> = {
    '一': 1, '二': 2, '兩': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5
  };
  if (map[str]) return map[str];
  const num = parseFloat(str);
  return isNaN(num) ? 1 : num;
};

// 正規化 Helper
const normalize = (str: string) => str.replace(/\(.*?\)/g, '').replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();

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
  const [isAiMode, setIsAiMode] = useState(false); // 預設為極速模式

  // Effect for dynamic loading text
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isProcessingVoice) {
      setVoiceLoadingText(isAiMode ? 'AI 正在思考中 (Gemini)...' : 'AI 正在解析您的訂單...');
      timer = setTimeout(() => {
        setVoiceLoadingText(isAiMode ? '還在思考中，請稍候...' : '正在思考中，請稍候...');
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [isProcessingVoice, isAiMode]);

  const processWithGemini = async (transcript: string) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API Key not found");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        你是一個麵廠訂單助手。請分析以下語音：'${transcript}'。
        
        已知客戶列表：${JSON.stringify(customers.map(c => ({id: c.id, name: c.name})))}
        已知產品列表：${JSON.stringify(products.map(p => ({id: p.id, name: p.name})))}
        
        請回傳 JSON 格式：
        { 
          "customerId": "string (matched customer id or empty string)", 
          "items": [
            { 
              "productId": "string (matched product id)", 
              "quantity": number, 
              "unit": "string (e.g., 斤, 包)", 
              "note": "string (any extra notes)" 
            }
          ],
          "relativeDay": number, // 0=今天, 1=明天, 2=後天... (預設為 0)
          "globalNote": "string (any remaining text)"
        }
        
        規則：
        1. 如果語音中包含客戶名稱或其別名，請填入 customerId。
        2. 如果語音中包含產品名稱，請填入 items。
        3. 數量請自動解析，如果沒有單位預設為 "斤"。
        4. 如果單位是 "包" 或 "袋"，請嘗試換算成 "斤" (油麵/陽春麵/意麵=5斤, 板條=2.5斤, 皮類=1斤)。
        5. 如果語音提到時間，請解析為相對天數 (relativeDay)。例如："今天"=0, "明天"=1, "後天"=2。預設為 0。
        6. 只回傳 JSON，不要有其他文字。
      `;

      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json"
        }
      });
      
      const responseText = result.text;
      const parsed = JSON.parse(responseText || '{}');
      
      return {
          matchedCustomerId: parsed.customerId,
          matchedCustomerName: customers.find(c => c.id === parsed.customerId)?.name || '',
          items: parsed.items,
          relativeDay: parsed.relativeDay ?? 0, // Default to 0 (Today)
          globalNote: parsed.globalNote
      };

    } catch (error) {
      console.error("Gemini AI Error:", error);
      throw error;
    }
  };

  const processWithRules = async (transcript: string) => {
      // 1. 預處理：移除無意義的語助詞
      let cleanText = transcript.replace(/那個|然後|幫我|一下|麻煩|請/g, '');
      const normalizedTranscript = normalize(cleanText);
      
      console.log("Clean Transcript:", cleanText);
      console.log("Normalized Transcript:", normalizedTranscript);

      // 0. 解析相對日期 (規則模式)
      let relativeDay = 0; // 預設今天
      if (normalizedTranscript.includes('明天')) relativeDay = 1;
      if (normalizedTranscript.includes('後天')) relativeDay = 2;
      
      // 移除日期關鍵字以免干擾後續識別
      cleanText = cleanText.replace(/明天|後天|今天/g, '');

      // 2. 識別客戶 (暴力搜尋 + 最長匹配優先)
      let matchedCustomerId = '';
      let matchedCustomerName = '';
      let bestMatchLength = 0; // 改用長度作為評分標準

      customers.forEach(c => {
        const cName = normalize(c.name);
        
        // 1. 手動別名
        let aliases = (CUSTOMER_ALIASES[c.name] || []).map(a => normalize(a));

        // 2. 自動簡稱 (移除常見後綴)
        const autoShortName = cName.replace(/麵店|麵攤|小吃|餐廳|食堂|店/g, '');
        if (autoShortName.length >= 2 && autoShortName !== cName) {
            aliases.push(autoShortName);
        }

        const keywords = [cName, ...aliases];
        
        for (const keyword of keywords) {
            // 只要語音包含關鍵字，且關鍵字長度 >= 2
            if (normalizedTranscript.includes(keyword) && keyword.length >= 2) {
                // 如果這個關鍵字比目前找到的還長，就更新
                if (keyword.length > bestMatchLength) {
                    bestMatchLength = keyword.length;
                    matchedCustomerId = c.id;
                    matchedCustomerName = c.name;
                }
            }
        }
      });

      // 只要有匹配到 (bestMatchLength > 0)，就視為成功
      if (bestMatchLength > 0) {
          console.log(`Matched Customer: ${matchedCustomerName} (Length: ${bestMatchLength})`);
          // Remove matched customer name from cleanText to avoid interfering with product matching
          if (matchedCustomerName) {
              cleanText = cleanText.replace(new RegExp(matchedCustomerName, 'i'), '');
              // Also try removing aliases
              const aliases = CUSTOMER_ALIASES[matchedCustomerName] || [];
              aliases.forEach(a => {
                  cleanText = cleanText.replace(new RegExp(a, 'i'), '');
              });
          }
      } else {
          matchedCustomerId = '';
          matchedCustomerName = '';
      }

      // 3. 識別品項 (使用同義詞與模糊比對 - 針對 normalized text)
      const identifiedItems: any[] = [];
      
      // 我們使用一個 processingText 來進行後續的產品識別，以免修改原始 transcript 影響除錯
      // 這裡直接使用 normalizedTranscript，因為產品識別也需要正規化
      let processingText = normalizedTranscript;
      
      // 移除日期關鍵字
      processingText = processingText.replace(/明天|後天|今天/g, '');

      // 如果有識別到客戶，先從 processingText 中移除
      if (matchedCustomerName) {
          const cNameNorm = normalize(matchedCustomerName);
          processingText = processingText.replace(new RegExp(cNameNorm, 'g'), '');
          
          const aliases = CUSTOMER_ALIASES[matchedCustomerName] || [];
          aliases.forEach(a => {
              processingText = processingText.replace(new RegExp(normalize(a), 'g'), '');
          });
      }
      
      // 取得客戶偏好 (專屬價格)
      const matchedCustomer = customers.find(c => c.id === matchedCustomerId);
      const preferredProductIds = matchedCustomer?.priceList?.map(pa => pa.productId) || [];

      // 依產品名稱長度排序，優先匹配較長的名稱
      // 新增邏輯：優先考慮有專屬價格的品項
      const sortedProducts = [...products].sort((a, b) => {
          const aIsPreferred = preferredProductIds.includes(a.id);
          const bIsPreferred = preferredProductIds.includes(b.id);
          
          // 1. 優先權：有專屬價格者優先
          if (aIsPreferred && !bIsPreferred) return -1; // a 排前面
          if (!aIsPreferred && bIsPreferred) return 1;  // b 排前面

          // 2. 次要權：名稱長的優先 (避免 "油麵" 蓋過 "油麵(大)")
          return b.name.length - a.name.length;
      });
      
      for (const p of sortedProducts) {
         const pNameNorm = normalize(p.name);
         const aliases = (PRODUCT_ALIASES[p.name] || []).map(a => normalize(a));
         const keywords = [pNameNorm, ...aliases].filter(Boolean);
         
         // 檢查 processingText 是否包含關鍵字
         const match = keywords.find(k => processingText.includes(k));
         
         if (match) {
            console.log(`Matched Product: ${p.name} (Keyword: ${match})`);
            
            // 4. 解析數量與單位
            // Regex 升級：捕捉中間的文字作為備註 (例如 "切" 兩包)
            // Group 1: 中間雜訊/備註 (pre-number)
            // Group 2: 數字
            // Group 3: 中間雜訊/備註 (post-number)
            // Group 4: 單位 (選填，用 ? 代表)
            const qtyRegex = new RegExp(`${match}(.*?)(\\d+|半|一|二|三|四|五|六|七|八|九|十)(.*?)(斤|包|袋|公斤|kg|g|台斤|個|顆|粒)?`, 'i');
            const qtyMatch = processingText.match(qtyRegex);
            
            let quantity = 10; // 預設
            let unit = '斤';
            let itemNote = '';
            
            if (qtyMatch) {
               const preNote = qtyMatch[1];
               const numStr = qtyMatch[2];
               const postNote = qtyMatch[3];
               const unitStr = qtyMatch[4];

               quantity = parseChineseNumber(numStr); 
               unit = unitStr || '斤'; // 預設單位
               
               // 提取中間的文字作為備註 (例如 "切")
               itemNote = (preNote + postNote).trim();

               // 自動換算邏輯 (包 -> 斤)
               if (unit === '包' || unit === '袋') {
                   let rate = PRODUCT_UNIT_CONVERSION[p.name];
                   
                   // 預設規則
                   if (!rate) {
                       if (p.name.includes('麵')) rate = 5;
                       else if (p.name.includes('皮')) rate = 1;
                   }
                   
                   if (rate) {
                       console.log(`Unit Conversion: ${p.name} ${quantity}包 -> ${quantity * rate}斤`);
                       quantity = quantity * rate;
                       unit = '斤';
                       // itemNote += ` (原: ${numStr}包)`; // 可選：記錄原始單位
                   }
               }

               // 移除已識別的部分
               processingText = processingText.replace(qtyMatch[0], '');
            } else {
               // 只有品項沒有數量，移除品項名稱
               processingText = processingText.replace(match, '');
            }
            
            identifiedItems.push({ productId: p.id, quantity, unit, note: itemNote });
         }
      }

      // 5. 提取全域備註 (剩下的文字)
      // 清理剩餘文字
      let remainingNote = processingText.trim();
      
      // 如果有識別到品項，將剩餘文字合併到第一個品項的備註，或作為全域備註
      if (remainingNote.length > 0 && identifiedItems.length > 0) {
          // 如果第一個品項已經有備註，則用逗號連接
          if (identifiedItems[0].note) {
              identifiedItems[0].note += ` ${remainingNote}`;
          } else {
              identifiedItems[0].note = remainingNote;
          }
      }

      return {
          matchedCustomerId,
          matchedCustomerName,
          items: identifiedItems,
          relativeDay,
          globalNote: remainingNote
      };
  };

  const handleProcessVoiceOrder = async (transcript: string) => {
    setIsProcessingVoice(true);

    try {
      let result;
      
      if (isAiMode) {
          result = await processWithGemini(transcript);
      } else {
          result = await processWithRules(transcript);
      }

      const { matchedCustomerId, matchedCustomerName, items, relativeDay, globalNote } = result;

      // Calculate Target Date
      const today = new Date();
      today.setDate(today.getDate() + (relativeDay || 0)); // Default to today (0)
      const targetDateStr = formatDateStr(today);
      
      // Update selected date if different
      if (targetDateStr !== selectedDate) {
          setSelectedDate(targetDateStr);
          addToast(`已切換至 ${targetDateStr}`, 'info');
      }

      // Populate Form
      const newItems: OrderItem[] = items.length > 0 
        ? items.map((i: any) => ({
            productId: i.productId,
            quantity: i.quantity,
            unit: i.unit
          }))
        : [{ productId: '', quantity: 10, unit: '斤' }];

      // Find Customer Delivery Method if ID matched
      let deliveryMethod = '';
      let deliveryTime = '08:00';
      
      if (matchedCustomerId) {
        const c = customers.find(x => x.id === matchedCustomerId);
        if (c) {
          deliveryMethod = c.deliveryMethod || '';
          deliveryTime = formatTimeForInput(c.deliveryTime);
        }
      }

      setOrderForm((prev: any) => ({
        ...prev,
        customerType: 'existing',
        customerName: matchedCustomerId ? matchedCustomerName : '',
        customerId: matchedCustomerId || '',
        deliveryTime: deliveryTime,
        deliveryMethod: deliveryMethod,
        items: newItems,
        note: globalNote // 全域備註
      }));

      // Open Editor
      setEditingOrderId(null);
      setIsAddingOrder(true);
      
      // UX: If customer not found, open picker automatically
      if (!matchedCustomerId) {
         setTimeout(() => {
            setCustomerPickerConfig({
               isOpen: true,
               onSelect: (id: string) => handleSelectExistingCustomer(id)
            });
            addToast('AI 未能確定店家，請手動選擇', 'info');
         }, 500);
      } else {
         addToast('語音解析成功！請確認內容', 'success');
      }

    } catch (e: any) {
      console.error('Voice processing error:', e);
      addToast('語音解析失敗，請重試', 'error');
      
      // Still open the form but empty
      setEditingOrderId(null);
      setIsAddingOrder(true);
      setOrderForm((prev: any) => ({ ...prev, note: `語音轉錄: ${transcript}` }));
    } finally {
      setIsProcessingVoice(false);
      setIsVoiceModalOpen(false);
    }
  };

  return {
    isVoiceModalOpen,
    setIsVoiceModalOpen,
    isProcessingVoice,
    voiceLoadingText,
    handleProcessVoiceOrder,
    isAiMode,
    setIsAiMode
  };
};
export function setupMockBackend() {
  if ((import.meta as any).env?.VITE_API_URL !== 'https://mock-api.local') return;

  console.warn("啟用本地 Mock Backend (資料將儲存於 localStorage)");

  const originalFetch = window.fetch;

  const getStorage = (key: string) => {
    const data = localStorage.getItem(`mock_${key}`);
    return data ? JSON.parse(data) : [];
  };

  const setStorage = (key: string, data: any) => {
    localStorage.setItem(`mock_${key}`, JSON.stringify(data));
  };

  Object.defineProperty(window, 'fetch', {
    writable: true,
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    
    // Check if it's our mock endpoint
    if (url.includes('mock-api.local')) {
      if (url.includes('type=init')) {
        return new Response(JSON.stringify({
          success: true,
          data: {
            customers: getStorage('customers'),
            products: getStorage('products'),
            orders: getStorage('orders'),
            trips: getStorage('trips') || ['第一趟', '第二趟', '未分配'],
            globalLastUpdated: Date.now()
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (init && init.method === 'POST') {
        try {
          const body = JSON.parse(init.body as string);
          const { action, data } = body;
          const now = Date.now();

          if (action === 'login') {
            return new Response(JSON.stringify({ success: true, data: data.password === '8888' }), { status: 200 });
          }
          
          if (action === 'changePassword') {
            return new Response(JSON.stringify({ success: true, data: true }), { status: 200 });
          }

          if (action === 'checkUpdates') {
            return new Response(JSON.stringify({ success: true, data: { globalLastUpdated: now } }), { status: 200 });
          }

          if (action === 'saveTrips') {
            setStorage('trips', data.trips);
            return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
          }

          if (action === 'reorderProducts') {
            let items = getStorage('products');
            const orderedIds = data;
            items.sort((a: any, b: any) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
            setStorage('products', items);
            return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
          }

          // Handle CRUD operations
          if (action.startsWith('add') || action.startsWith('update') || action.startsWith('delete')) {
            let type = '';
            if (action.includes('Customer')) type = 'customers';
            else if (action.includes('Product')) type = 'products';
            else if (action.includes('Order')) type = 'orders';
            
            if (type) {
              let items = getStorage(type);
              
              if (action.startsWith('add')) {
                items.push({ ...data, lastUpdated: now });
              } else if (action.startsWith('update')) {
                items = items.map((item: any) => item.id === data.id ? { ...data, lastUpdated: now } : item);
              } else if (action.startsWith('delete')) {
                items = items.filter((item: any) => item.id !== data.id);
              }
              
              setStorage(type, items);
            }
            return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
          }

          return new Response(JSON.stringify({ success: true, data: { lastUpdated: now } }), { status: 200 });
        } catch (e) {
          console.error("Mock backend error:", e);
          return new Response(JSON.stringify({ success: false, error: String(e) }), { status: 500 });
        }
      }
    }

    // Fallback to original fetch for other requests
    return originalFetch(input, init);
    }
  });
}

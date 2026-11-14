import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  X,
  Search,
  Smile,
  GripVertical,
  Sparkles,
  RotateCcw,
  Check,
  AlertCircle,
  Package,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { Customer, DailyBriefingConfig } from '../../types';

interface Props {
  briefing: DailyBriefingConfig;
  onChange: (next: DailyBriefingConfig) => void;
  customers: Customer[];
}

const TOKEN_SPLIT_REGEX = /(\{\{店家:[^}]+\}\}|\{\{今日日期\}\}|\{\{總備貨小計\}\}|\{\{無單確認名單\}\})/g;
const EXACT_TOKEN_REGEX = /^(\{\{店家:[^}]+\}\}|\{\{今日日期\}\}|\{\{總備貨小計\}\}|\{\{無單確認名單\}\})$/;

export function makeCustomerToken(cust: Pick<Customer, 'id' | 'name'>): string {
  const safeName = String(cust.name || '未命名店家').replace(/[|{}]/g, '').trim();
  const safeId = String(cust.id || '').replace(/[|{}]/g, '').trim();
  return safeId ? `{{店家:${safeName}|${safeId}}}` : `{{店家:${safeName}}}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTokenDisplayMeta(token: string, customerMapById: Map<string, Customer>) {
  if (token === '{{今日日期}}') {
    return {
      label: '📅 今日日期',
      pillClass:
        'bg-sky-50 text-sky-700 border-sky-300 shadow-[0_1px_0_rgba(14,165,233,0.15)]'
    };
  }
  if (token === '{{總備貨小計}}') {
    return {
      label: '📦 總備貨小計',
      pillClass:
        'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-[0_1px_0_rgba(16,185,129,0.15)]'
    };
  }
  if (token === '{{無單確認名單}}') {
    return {
      label: '❓ 無單確認名單',
      pillClass:
        'bg-rose-50 text-rose-700 border-rose-300 shadow-[0_1px_0_rgba(244,63,94,0.15)]'
    };
  }

  const m = token.match(/^\{\{店家:([^|}]+)(?:\|([^}]+))?\}\}$/);
  const fallbackName = m ? m[1] : token;
  const custId = m?.[2];
  const custObj = custId ? customerMapById.get(custId) : undefined;
  const displayName = custObj?.name || fallbackName;
  const isWatchlist = Boolean(custObj?.isWatchlist);

  return {
    label: `${isWatchlist ? '🚨 ' : '🏪 '}${displayName}`,
    pillClass: isWatchlist
      ? 'bg-rose-50 text-rose-800 border-rose-300 shadow-[0_1px_0_rgba(244,63,94,0.15)]'
      : 'bg-amber-50 text-amber-800 border-amber-300 shadow-[0_1px_0_rgba(245,158,11,0.15)]'
  };
}

function renderTemplateToEditorHtml(template: string, customerMapById: Map<string, Customer>): string {
  const normalized = (template || '').replace(/\r\n/g, '\n');
  if (!normalized) return '';

  const renderInline = (line: string) => {
    if (!line) return '<br>';
    const parts = line.split(TOKEN_SPLIT_REGEX);
    return parts
      .map((part) => {
        if (!part) return '';
        if (EXACT_TOKEN_REGEX.test(part)) {
          const meta = getTokenDisplayMeta(part, customerMapById);
          return (
            `<span contenteditable="false" draggable="true" data-briefing-token="${escapeHtml(part)}" ` +
            `class="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 my-0.5 rounded-full text-xs font-bold border align-baseline select-none cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-indigo-300/60 transition-all ${meta.pillClass}">` +
            `<span class="pointer-events-none opacity-45 text-[10px] leading-none">⠿</span>` +
            `<span class="pointer-events-none">${escapeHtml(meta.label)}</span>` +
            `<button type="button" data-remove-pill="true" class="ml-0.5 leading-none opacity-60 hover:opacity-100 font-bold cursor-pointer" title="移除此標籤">×</button>` +
            `</span>`
          );
        }
        return escapeHtml(part);
      })
      .join('');
  };

  return normalized
    .split('\n')
    .map((line) => `<div>${renderInline(line)}</div>`)
    .join('');
}

function serializeEditorDomToTemplate(root: HTMLElement): string {
  const lines: string[] = [];
  let inlineBuf = '';

  const flushInline = () => {
    lines.push(inlineBuf);
    inlineBuf = '';
  };

  const extractInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/\u200B/g, '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const el = node as HTMLElement;
    const tokenAttr = el.getAttribute('data-briefing-token');
    if (tokenAttr) {
      return tokenAttr;
    }
    if (el.tagName === 'BR') {
      return '\n';
    }
    let s = '';
    el.childNodes.forEach((c) => {
      s += extractInline(c);
    });
    return s;
  };

  const isBlockEl = (node: Node): node is HTMLElement =>
    node.nodeType === Node.ELEMENT_NODE &&
    ((node as HTMLElement).tagName === 'DIV' || (node as HTMLElement).tagName === 'P');

  const children = Array.from(root.childNodes);
  children.forEach((child, idx) => {
    if (isBlockEl(child)) {
      if (inlineBuf !== '') {
        flushInline();
      }
      let blockStr = extractInline(child);
      if (blockStr === '\n') {
        blockStr = '';
      } else if (blockStr.endsWith('\n')) {
        // 移除瀏覽器於非空 <div> 尾端自動補入的 sentinel <br>
        blockStr = blockStr.slice(0, -1);
      }
      lines.push(blockStr);
    } else if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'BR') {
      const nextSibling = children[idx + 1];
      // 若為「非空 inline 行尾端緊接 <div>」或「整段最後一個佔位 <br>」，僅結束當前行，不額外多產空行
      const isSentinelBeforeBlock = Boolean(nextSibling && isBlockEl(nextSibling) && inlineBuf !== '');
      const isTrailingSentinelAtEnd = !nextSibling && inlineBuf !== '';
      if (isSentinelBeforeBlock || isTrailingSentinelAtEnd) {
        flushInline();
      } else {
        flushInline();
      }
    } else {
      const part = extractInline(child);
      if (part.includes('\n')) {
        const sub = part.split('\n');
        sub.forEach((seg, sIdx) => {
          inlineBuf += seg;
          if (sIdx < sub.length - 1) flushInline();
        });
      } else {
        inlineBuf += part;
      }
    }
  });

  if (inlineBuf !== '') {
    flushInline();
  }

  const joined = lines.join('\n').replace(/\r\n/g, '\n');
  if (!root.querySelector('[data-briefing-token]') && joined.trim() === '' && children.length <= 1) {
    return '';
  }
  return joined;
}

function getDropRangeFromPoint(root: HTMLElement, x: number, y: number): Range | null {
  const hitEl = document.elementFromPoint(x, y) as HTMLElement | null;
  const hitPill = hitEl?.closest('[data-briefing-token]') as HTMLElement | null;
  if (hitPill && root.contains(hitPill)) {
    const rect = hitPill.getBoundingClientRect();
    const r = document.createRange();
    if (x < rect.left + rect.width / 2) {
      r.setStartBefore(hitPill);
    } else {
      r.setStartAfter(hitPill);
    }
    r.collapse(true);
    return r;
  }

  let dropRange: Range | null = null;
  const docAny = document as any;
  if (typeof docAny.caretRangeFromPoint === 'function') {
    dropRange = docAny.caretRangeFromPoint(x, y);
  } else if (typeof docAny.caretPositionFromPoint === 'function') {
    const pos = docAny.caretPositionFromPoint(x, y);
    if (pos) {
      dropRange = document.createRange();
      dropRange.setStart(pos.offsetNode, pos.offset);
      dropRange.collapse(true);
    }
  }

  if (!dropRange || !root.contains(dropRange.commonAncestorContainer)) {
    return null;
  }

  // 若落點恰好落在某顆 contenteditable="false" 膠囊內部，自動夾擠至前後
  const ancestorEl =
    dropRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (dropRange.commonAncestorContainer as HTMLElement)
      : dropRange.commonAncestorContainer.parentElement;
  const enclosingPill = ancestorEl?.closest('[data-briefing-token]') as HTMLElement | null;
  if (enclosingPill && root.contains(enclosingPill)) {
    const rect = enclosingPill.getBoundingClientRect();
    const snapped = document.createRange();
    if (x < rect.left + rect.width / 2) {
      snapped.setStartBefore(enclosingPill);
    } else {
      snapped.setStartAfter(enclosingPill);
    }
    snapped.collapse(true);
    return snapped;
  }

  return dropRange;
}

export const BriefingTemplateEditor: React.FC<Props> = ({ briefing, onChange, customers }) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [draggingPoolCustId, setDraggingPoolCustId] = useState<string | null>(null);
  const [dragOverPoolCustId, setDragOverPoolCustId] = useState<string | null>(null);
  const [selectedTokenIdx, setSelectedTokenIdx] = useState<number | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastSavedRangeRef = useRef<Range | null>(null);
  const lastEmittedValueRef = useRef<string | null>(null);
  const draggingInternalPillRef = useRef<HTMLElement | null>(null);

  const activeCustomers = customers.filter((c) => !c.isArchived);
  const customerMapById = new Map<string, Customer>();
  activeCustomers.forEach((c) => customerMapById.set(c.id, c));

  const includedIds = briefing.includedCustomerIds || [];
  const includedCustomers = includedIds
    .map((id) => customerMapById.get(id))
    .filter((c): c is Customer => Boolean(c));
  const templateValue = briefing.customTemplate ?? '';

  const applyPillSelectionHighlight = () => {
    const el = editorRef.current;
    if (!el) return;
    const pills = Array.from(el.querySelectorAll('[data-briefing-token]')) as HTMLElement[];
    pills.forEach((p, idx) => {
      if (selectedTokenIdx !== null && idx === selectedTokenIdx) {
        p.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-1');
      } else {
        p.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-1');
      }
    });
  };

  // 僅在外部變更（切換模式、重設、雲端刷新、快捷鈕調序）時重新水合 DOM，打字過程中絕不重建 DOM 避免游標跳動
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (lastEmittedValueRef.current !== templateValue) {
      el.innerHTML = renderTemplateToEditorHtml(templateValue, customerMapById);
      lastEmittedValueRef.current = templateValue;
    }
    applyPillSelectionHighlight();
  }, [templateValue, customers]);

  useEffect(() => {
    applyPillSelectionHighlight();
  }, [selectedTokenIdx]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveCurrentSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      lastSavedRangeRef.current = range.cloneRange();
    }
  };

  const syncFromDom = () => {
    const el = editorRef.current;
    if (!el) return;
    const serialized = serializeEditorDomToTemplate(el);
    lastEmittedValueRef.current = serialized;
    onChange({ ...briefing, customTemplate: serialized });
  };

  const createPillElement = (token: string): HTMLSpanElement => {
    const meta = getTokenDisplayMeta(token, customerMapById);
    const span = document.createElement('span');
    span.setAttribute('contenteditable', 'false');
    span.setAttribute('draggable', 'true');
    span.setAttribute('data-briefing-token', token);
    span.className = `inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 my-0.5 rounded-full text-xs font-bold border align-baseline select-none cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-indigo-300/60 transition-all ${meta.pillClass}`;

    const gripSpan = document.createElement('span');
    gripSpan.className = 'pointer-events-none opacity-45 text-[10px] leading-none';
    gripSpan.textContent = '⠿';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'pointer-events-none';
    labelSpan.textContent = meta.label;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('data-remove-pill', 'true');
    removeBtn.className = 'ml-0.5 leading-none opacity-60 hover:opacity-100 font-bold cursor-pointer';
    removeBtn.title = '移除此標籤';
    removeBtn.textContent = '×';

    span.appendChild(gripSpan);
    span.appendChild(labelSpan);
    span.appendChild(removeBtn);
    return span;
  };

  const insertTokenAtRange = (token: string, explicitRange?: Range | null) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    let range: Range | null = explicitRange || null;

    if (!range && lastSavedRangeRef.current && el.contains(lastSavedRangeRef.current.commonAncestorContainer)) {
      range = lastSavedRangeRef.current.cloneRange();
    }
    if (!range && sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }

    range.deleteContents();
    const pill = createPillElement(token);
    const spacer = document.createTextNode('\u200B');

    range.insertNode(spacer);
    range.insertNode(pill);

    const afterRange = document.createRange();
    afterRange.setStartAfter(spacer);
    afterRange.collapse(true);

    if (sel) {
      sel.removeAllRanges();
      sel.addRange(afterRange);
    }
    lastSavedRangeRef.current = afterRange.cloneRange();
    setSelectedTokenIdx(null);
    syncFromDom();
  };

  const insertPlainTextAtCaret = (text: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    let range: Range | null =
      lastSavedRangeRef.current && el.contains(lastSavedRangeRef.current.commonAncestorContainer)
        ? lastSavedRangeRef.current.cloneRange()
        : null;

    if (!range && sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    }
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }

    range.deleteContents();
    const txtNode = document.createTextNode(text);
    range.insertNode(txtNode);

    const afterRange = document.createRange();
    afterRange.setStartAfter(txtNode);
    afterRange.collapse(true);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(afterRange);
    }
    lastSavedRangeRef.current = afterRange.cloneRange();
    syncFromDom();
  };

  // --- 編輯框內部膠囊拖拉排序 ---
  const handleEditorDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const pillEl = (e.target as HTMLElement)?.closest('[data-briefing-token]') as HTMLElement | null;
    if (!pillEl || !editorRef.current?.contains(pillEl)) return;

    e.stopPropagation();
    const token = pillEl.getAttribute('data-briefing-token') || '';
    draggingInternalPillRef.current = pillEl;
    setDraggingPoolCustId(null);
    e.dataTransfer.setData('application/x-briefing-token', token);
    e.dataTransfer.setData('application/x-briefing-move', '1');
    e.dataTransfer.setData('text/plain', token);
    e.dataTransfer.effectAllowed = 'move';
    pillEl.classList.add('opacity-40', 'scale-95');
  };

  const handleEditorDragEnd = () => {
    if (draggingInternalPillRef.current) {
      draggingInternalPillRef.current.classList.remove('opacity-40', 'scale-95');
      draggingInternalPillRef.current = null;
    }
    setIsDragOver(false);
  };

  const handleEditorDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingInternalPillRef.current ? 'move' : 'copy';
    if (!isDragOver) setIsDragOver(true);

    // 讓滑鼠拖移時即時移動選取游標線，清楚看見即將落下的位置
    const el = editorRef.current;
    if (el) {
      const previewRange = getDropRangeFromPoint(el, e.clientX, e.clientY);
      if (previewRange) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(previewRange);
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const el = editorRef.current;
    if (!el) return;

    const dropRange = getDropRangeFromPoint(el, e.clientX, e.clientY);
    const internalPill = draggingInternalPillRef.current;

    if (internalPill && el.contains(internalPill)) {
      internalPill.classList.remove('opacity-40', 'scale-95');
      draggingInternalPillRef.current = null;

      if (dropRange && !internalPill.contains(dropRange.commonAncestorContainer)) {
        // 先插入佔位再把原膠囊搬過去，避免 Range 在自身相鄰位置失準
        const marker = document.createTextNode('\u200B');
        dropRange.insertNode(marker);
        const parent = marker.parentNode;
        if (parent) {
          parent.insertBefore(internalPill, marker);
          const afterRange = document.createRange();
          afterRange.setStartAfter(marker);
          afterRange.collapse(true);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(afterRange);
          }
          lastSavedRangeRef.current = afterRange.cloneRange();
        }

        const allPills = Array.from(el.querySelectorAll('[data-briefing-token]'));
        const newIdx = allPills.indexOf(internalPill);
        setSelectedTokenIdx(newIdx >= 0 ? newIdx : null);
        syncFromDom();
      }
      return;
    }

    const token =
      e.dataTransfer.getData('application/x-briefing-token') ||
      e.dataTransfer.getData('text/plain');
    if (!token) return;

    if (EXACT_TOKEN_REGEX.test(token.trim())) {
      insertTokenAtRange(token.trim(), dropRange);
    } else {
      lastSavedRangeRef.current = dropRange;
      insertPlainTextAtCaret(token);
    }
  };

  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = editorRef.current;
    if (!el) return;
    const target = e.target as HTMLElement;

    if (target?.getAttribute('data-remove-pill') === 'true') {
      e.preventDefault();
      e.stopPropagation();
      const pillEl = target.closest('[data-briefing-token]');
      if (pillEl) {
        pillEl.remove();
        setSelectedTokenIdx(null);
        syncFromDom();
      }
      return;
    }

    const clickedPill = target?.closest('[data-briefing-token]') as HTMLElement | null;
    if (clickedPill && el.contains(clickedPill)) {
      const pills = Array.from(el.querySelectorAll('[data-briefing-token]'));
      const idx = pills.indexOf(clickedPill);
      setSelectedTokenIdx((prev) => (prev === idx ? null : idx));
      return;
    }

    setSelectedTokenIdx(null);
    saveCurrentSelection();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const plainText = e.clipboardData.getData('text/plain');
    if (!plainText) return;
    saveCurrentSelection();
    insertPlainTextAtCaret(plainText);
  };

  // --- 手機／快捷：針對已點選的編輯框內膠囊進行調序與移動 ---
  const parsedTokensInTemplate = (() => {
    const parts = (templateValue || '').split(TOKEN_SPLIT_REGEX);
    const items: Array<{ partIdx: number; tokenIdx: number; token: string }> = [];
    let tIdx = 0;
    parts.forEach((p, pIdx) => {
      if (EXACT_TOKEN_REGEX.test(p)) {
        items.push({ partIdx: pIdx, tokenIdx: tIdx, token: p });
        tIdx += 1;
      }
    });
    return { parts, items };
  })();

  const selectedTokenItem =
    selectedTokenIdx !== null
      ? parsedTokensInTemplate.items.find((x) => x.tokenIdx === selectedTokenIdx) || null
      : null;

  const swapSelectedTokenOrder = (dir: -1 | 1) => {
    if (selectedTokenIdx === null) return;
    const { parts, items } = parsedTokensInTemplate;
    const targetPos = selectedTokenIdx + dir;
    if (targetPos < 0 || targetPos >= items.length) return;

    const a = items[selectedTokenIdx];
    const b = items[targetPos];
    const nextParts = [...parts];
    nextParts[a.partIdx] = b.token;
    nextParts[b.partIdx] = a.token;

    lastEmittedValueRef.current = null;
    setSelectedTokenIdx(targetPos);
    onChange({ ...briefing, customTemplate: nextParts.join('') });
  };

  const moveSelectedTokenByLine = (dir: -1 | 1) => {
    if (selectedTokenIdx === null) return;
    const parts = (templateValue || '').split(TOKEN_SPLIT_REGEX);
    let currentIdx = -1;
    let charOffset = 0;
    let targetToken = '';
    let targetStart = -1;
    let targetEnd = -1;

    for (const p of parts) {
      if (EXACT_TOKEN_REGEX.test(p)) {
        currentIdx += 1;
        if (currentIdx === selectedTokenIdx) {
          targetToken = p;
          targetStart = charOffset;
          targetEnd = charOffset + p.length;
          break;
        }
      }
      charOffset += p.length;
    }
    if (targetStart < 0) return;

    const before = templateValue.slice(0, targetStart);
    const after = templateValue.slice(targetEnd);
    const linesBefore = before.split('\n');
    const lineIdx = linesBefore.length - 1;
    const allLines = templateValue.split('\n');
    const destLineIdx = lineIdx + dir;
    if (destLineIdx < 0 || destLineIdx >= allLines.length) return;

    // 移除原行內的這個 token（精確切除 targetStart~targetEnd），再加到目標行尾端
    const curLineLeft = linesBefore[linesBefore.length - 1];
    const curLineRight = after.split('\n')[0];
    allLines[lineIdx] = (curLineLeft + curLineRight).replace(/[ \t]{2,}/g, ' ').trim();
    allLines[destLineIdx] = allLines[destLineIdx]
      ? `${allLines[destLineIdx]} ${targetToken}`
      : targetToken;

    const nextTpl = allLines.join('\n');
    let newTokenIdx = 0;
    let matchedIdx = 0;
    let scanned = 0;
    const nextParts = nextTpl.split(TOKEN_SPLIT_REGEX);
    for (const np of nextParts) {
      if (EXACT_TOKEN_REGEX.test(np)) {
        const linesSoFar = nextTpl.slice(0, scanned).split('\n').length - 1;
        if (np === targetToken && linesSoFar === destLineIdx) {
          matchedIdx = newTokenIdx;
        }
        newTokenIdx += 1;
      }
      scanned += np.length;
    }

    lastEmittedValueRef.current = null;
    setSelectedTokenIdx(matchedIdx);
    onChange({ ...briefing, customTemplate: nextTpl });
  };

  const removeSelectedToken = () => {
    if (!selectedTokenItem) return;
    const nextParts = [...parsedTokensInTemplate.parts];
    nextParts[selectedTokenItem.partIdx] = '';
    const nextTpl = nextParts.join('').replace(/\n{3,}/g, '\n\n');
    lastEmittedValueRef.current = null;
    setSelectedTokenIdx(null);
    onChange({ ...briefing, customTemplate: nextTpl });
  };

  // --- 上方標籤池拖拉調序 ---
  const handlePoolChipDrop = (targetCustId: string) => {
    if (!draggingPoolCustId || draggingPoolCustId === targetCustId) {
      setDraggingPoolCustId(null);
      setDragOverPoolCustId(null);
      return;
    }
    const nextIds = [...includedIds];
    const fromIdx = nextIds.indexOf(draggingPoolCustId);
    const toIdx = nextIds.indexOf(targetCustId);
    if (fromIdx >= 0 && toIdx >= 0) {
      const [moved] = nextIds.splice(fromIdx, 1);
      nextIds.splice(toIdx, 0, moved);
      onChange({ ...briefing, includedCustomerIds: nextIds });
    }
    setDraggingPoolCustId(null);
    setDragOverPoolCustId(null);
  };

  const toggleIncludeCustomer = (custId: string) => {
    const exists = includedIds.includes(custId);
    const nextIds = exists
      ? includedIds.filter((id) => id !== custId)
      : [...includedIds, custId];

    let nextTemplate = templateValue;
    if (exists) {
      const cust = customerMapById.get(custId);
      const tokenEscapedId = custId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const byIdRegex = new RegExp(`\\{\\{店家:[^|}]+\\|${tokenEscapedId}\\}\\}`, 'g');
      nextTemplate = nextTemplate.replace(byIdRegex, '');
      if (cust?.name) {
        const escapedName = cust.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        nextTemplate = nextTemplate.replace(new RegExp(`\\{\\{店家:${escapedName}\\}\\}`, 'g'), '');
      }
      nextTemplate = nextTemplate.replace(/\n{3,}/g, '\n\n');
    }

    lastEmittedValueRef.current = null;
    setSelectedTokenIdx(null);
    onChange({
      ...briefing,
      includedCustomerIds: nextIds,
      customTemplate: nextTemplate
    });
  };

  const importAllWatchlistStores = () => {
    const watchIds = activeCustomers.filter((c) => c.isWatchlist).map((c) => c.id);
    const merged = Array.from(new Set([...includedIds, ...watchIds]));
    onChange({ ...briefing, includedCustomerIds: merged });
  };

  const applySampleTemplate = () => {
    const lines = includedCustomers.map((c) => makeCustomerToken(c));
    const body = lines.length > 0 ? lines.join('\n') : '（請點上方店家標籤插入到此處）';
    const nextTpl = `🚚【今日重點出車】{{今日日期}}\n早安！請協助確認以下店家貨量：\n━━━━━━━━━━━━━━\n${body}`;
    lastEmittedValueRef.current = null;
    setSelectedTokenIdx(null);
    onChange({ ...briefing, customTemplate: nextTpl });
  };

  const clearTemplate = () => {
    lastEmittedValueRef.current = null;
    setSelectedTokenIdx(null);
    onChange({ ...briefing, customTemplate: '' });
  };

  const tokensUsedCount = includedCustomers.filter((c) => {
    const token = makeCustomerToken(c);
    return (
      templateValue.includes(token) ||
      templateValue.includes(`|${c.id}}}`) ||
      templateValue.includes(`{{店家:${c.name}}}`)
    );
  }).length;

  const systemTags = [
    { token: '{{今日日期}}', label: '📅 今日日期', cls: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100' },
    { token: '{{總備貨小計}}', label: '📦 總備貨小計 (選配)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
    { token: '{{無單確認名單}}', label: '❓ 無單確認名單 (選配)', cls: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' }
  ];

  const filteredPickerCustomers = activeCustomers.filter((c) =>
    String(c.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* 區塊 A：白名單店家標籤池 */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest">
              ① 添加要通知的店家（僅會傳送名單內的店）
            </label>
            <p className="text-[11px] text-slate-400 mt-0.5">
              拖拉標籤互相調序或拖進下方編輯框；手機點一下標籤即可插入游標位置。
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsPickerOpen(!isPickerOpen);
              setSearchTerm('');
            }}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加店家
          </button>
        </div>

        {/* 挑選店家抽屜 */}
        {isPickerOpen && (
          <div className="bg-slate-50 rounded-xl p-3 border border-amber-200 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜尋店家名稱..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
              <button
                type="button"
                onClick={importAllWatchlistStores}
                className="shrink-0 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold"
              >
                + 匯入盯哨店
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
              {filteredPickerCustomers.map((c) => {
                const selected = includedIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleIncludeCustomer(c.id)}
                    className={`text-left px-2.5 py-2 rounded-lg text-xs border transition-all flex items-center justify-between gap-1 ${
                      selected
                        ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <span className="truncate">
                      {c.isWatchlist ? '🚨 ' : ''}
                      {c.name}
                    </span>
                    {selected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-slate-200/70">
              <span className="text-[11px] text-slate-500">已選 {includedIds.length} 家</span>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 px-2 py-1"
              >
                完成收合
              </button>
            </div>
          </div>
        )}

        {/* 已添加的店家標籤列（支援互拖調序＋拖進編輯框） */}
        {includedCustomers.length === 0 ? (
          <div className="text-xs text-amber-800 bg-amber-50/70 border border-dashed border-amber-300 rounded-xl px-3 py-3 text-center">
            尚未添加任何店家，請點擊右上角「＋ 添加店家」建立標籤。
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {includedCustomers.map((c) => {
              const token = makeCustomerToken(c);
              const isPlaced =
                templateValue.includes(token) ||
                templateValue.includes(`|${c.id}}}`) ||
                templateValue.includes(`{{店家:${c.name}}}`);
              const isDragTarget = dragOverPoolCustId === c.id && draggingPoolCustId !== c.id;

              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    draggingInternalPillRef.current = null;
                    setDraggingPoolCustId(c.id);
                    e.dataTransfer.setData('application/x-briefing-token', token);
                    e.dataTransfer.setData('text/plain', token);
                    e.dataTransfer.effectAllowed = 'copyMove';
                  }}
                  onDragOver={(e) => {
                    if (draggingPoolCustId && draggingPoolCustId !== c.id) {
                      e.preventDefault();
                      setDragOverPoolCustId(c.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverPoolCustId === c.id) setDragOverPoolCustId(null);
                  }}
                  onDrop={(e) => {
                    if (draggingPoolCustId) {
                      e.preventDefault();
                      handlePoolChipDrop(c.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingPoolCustId(null);
                    setDragOverPoolCustId(null);
                  }}
                  className={`group inline-flex items-center gap-1 rounded-full border pl-2 pr-1.5 py-1 text-xs font-bold cursor-grab active:cursor-grabbing select-none transition-all ${
                    c.isWatchlist
                      ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                  } ${isDragTarget ? 'ring-2 ring-indigo-500 scale-105' : ''}`}
                >
                  <GripVertical className="w-3 h-3 opacity-45 shrink-0" />
                  <button
                    type="button"
                    onClick={() => insertTokenAtRange(token)}
                    className="flex items-center gap-1 text-left"
                    title="點擊插入游標處，或拖進下方編輯框"
                  >
                    <span>
                      {c.isWatchlist ? '🚨 ' : ''}
                      {c.name}
                    </span>
                    {isPlaced && (
                      <span className="text-[10px] text-emerald-600 font-extrabold" title="已放入模板">
                        ✓
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleIncludeCustomer(c.id)}
                    className="p-0.5 rounded-full opacity-50 hover:opacity-100 hover:bg-black/10 transition-opacity"
                    title="從白名單移除此店家"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 系統變數標籤（選配插入） */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-[11px] font-bold text-slate-400 mb-1.5">
            可用動態變數標籤（全為選配，可拖拉或點擊插入）：
          </div>
          <div className="flex flex-wrap gap-1.5">
            {systemTags.map((st) => (
              <button
                key={st.token}
                type="button"
                draggable
                onDragStart={(e) => {
                  draggingInternalPillRef.current = null;
                  setDraggingPoolCustId(null);
                  e.dataTransfer.setData('application/x-briefing-token', st.token);
                  e.dataTransfer.setData('text/plain', st.token);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => insertTokenAtRange(st.token)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors cursor-grab active:cursor-grabbing ${st.cls}`}
              >
                <GripVertical className="w-2.5 h-2.5 opacity-45" />
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 區塊 B：進階 contentEditable 膠囊編輯框（支援內部拖拉排序） */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-widest">
            ② 客製化通知訊息編輯框
          </label>
          <div className="flex items-center gap-1.5 relative">
            <button
              type="button"
              onClick={applySampleTemplate}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              自動排入全部標籤
            </button>
            <button
              type="button"
              onClick={clearTemplate}
              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              清空
            </button>
            <button
              type="button"
              onClick={() => setShowEmojiPicker((v) => !v)}
              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-slate-200"
              title="插入表情符號"
            >
              <Smile className="w-4 h-4" />
            </button>
            {showEmojiPicker && (
              <div className="absolute right-0 bottom-full mb-2 z-50 shadow-2xl rounded-xl" ref={emojiPickerRef}>
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    insertPlainTextAtCaret(emojiData.emoji);
                    setShowEmojiPicker(false);
                  }}
                  width={290}
                  height={360}
                />
              </div>
            )}
          </div>
        </div>

        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              if (!isComposingRef.current) {
                syncFromDom();
              }
            }}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
              syncFromDom();
            }}
            onKeyUp={saveCurrentSelection}
            onMouseUp={saveCurrentSelection}
            onBlur={() => {
              saveCurrentSelection();
              syncFromDom();
            }}
            onClick={handleEditorClick}
            onPaste={handlePaste}
            onDragStart={handleEditorDragStart}
            onDragEnd={handleEditorDragEnd}
            onDragOver={handleEditorDragOver}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`min-h-[150px] max-h-[280px] overflow-y-auto w-full p-3 rounded-xl border text-sm leading-7 outline-none whitespace-pre-wrap break-words transition-all ${
              isDragOver
                ? 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-400/50'
                : 'border-slate-200 bg-slate-50/60 focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-200/50'
            }`}
          />
          {!templateValue && (
            <div className="pointer-events-none absolute top-3 left-3 text-xs text-slate-400 leading-relaxed">
              在這裡自由輸入想告訴司機／自己的話，並把上方的店家標籤拖拉或點選進來...
            </div>
          )}
        </div>

        {/* 選取膠囊後的觸控／快捷排序工具列 */}
        {selectedTokenItem && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-indigo-800 truncate">
              調整「{getTokenDisplayMeta(selectedTokenItem.token, customerMapById).label}」位置：
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => swapSelectedTokenOrder(-1)}
                disabled={selectedTokenIdx === 0}
                className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100 disabled:opacity-40 flex items-center gap-0.5"
                title="與前一個標籤互換順序"
              >
                <ArrowLeft className="w-3 h-3" />
                前調
              </button>
              <button
                type="button"
                onClick={() => swapSelectedTokenOrder(1)}
                disabled={selectedTokenIdx === parsedTokensInTemplate.items.length - 1}
                className="px-2 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-[11px] font-bold hover:bg-indigo-100 disabled:opacity-40 flex items-center gap-0.5"
                title="與後一個標籤互換順序"
              >
                後調
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => moveSelectedTokenByLine(-1)}
                className="p-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                title="上移一行"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => moveSelectedTokenByLine(1)}
                className="p-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                title="下移一行"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={removeSelectedToken}
                className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-[11px] font-bold hover:bg-rose-100"
              >
                移除
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-1">
          <span>
            已嵌入模板：{tokensUsedCount} / {includedCustomers.length} 家標籤
          </span>
          <span>框內膠囊可直接「拖拉換位」或「點選調序」</span>
        </div>

        {includedCustomers.length > 0 && tokensUsedCount === 0 && (
          <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
            <span>
              你已添加店家但尚未放入編輯框：請點上方店家標籤插入，或點「自動排入全部標籤」。
            </span>
          </div>
        )}
      </div>

      {/* 區塊 C：選配開關（總備貨小計 & 無單處理） */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest">
          ③ 標籤細節與選配選項
        </label>

        <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-700 bg-emerald-50/60 px-3 py-2.5 rounded-xl border border-emerald-200/80 cursor-pointer">
          <input
            type="checkbox"
            checked={briefing.customIncludeItemTotals === true}
            onChange={(e) => onChange({ ...briefing, customIncludeItemTotals: e.target.checked })}
            className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              <span>附上「已添加標籤店家的總備貨小計」（選配，非必選）</span>
            </div>
            <div className="text-[11px] font-normal text-slate-500 mt-0.5">
              勾選後會於訊息最底部自動統計白名單店家的總貨量；若你已在上方手動插入「📦 總備貨小計」標籤，則會依你擺放的位置輸出且不重複顯示。
            </div>
          </div>
        </label>

        <div className="bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200/80 space-y-2">
          <div className="text-[11px] font-bold text-slate-500">
            店家明細附加欄位（選填，預設不顯示）：
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-2.5 py-2 rounded-lg border border-slate-200 cursor-pointer hover:border-amber-300 transition-colors">
              <input
                type="checkbox"
                checked={briefing.includeTripInfo === true}
                onChange={(e) => onChange({ ...briefing, includeTripInfo: e.target.checked })}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span>顯示趟數資訊</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white px-2.5 py-2 rounded-lg border border-slate-200 cursor-pointer hover:border-amber-300 transition-colors">
              <input
                type="checkbox"
                checked={briefing.includeDeliveryTime === true}
                onChange={(e) => onChange({ ...briefing, includeDeliveryTime: e.target.checked })}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
              <span>顯示配送時間</span>
            </label>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-bold text-slate-500 mb-1.5">
            當標籤內的店家「今日沒有訂單」時如何處理：
          </div>
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => onChange({ ...briefing, emptyStoreBehavior: 'HIDE_LINE' })}
              className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                (briefing.emptyStoreBehavior || 'HIDE_LINE') === 'HIDE_LINE'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              自動隱藏（不留空行）
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...briefing, emptyStoreBehavior: 'SHOW_NO_ORDER' })}
              className={`py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                briefing.emptyStoreBehavior === 'SHOW_NO_ORDER'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              保留並顯示「⭕ 今日無單」
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

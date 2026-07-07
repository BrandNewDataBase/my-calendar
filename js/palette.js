// 색상 팔레트 키 — 실제 색값은 CSS 커스텀 프로퍼티(--cat-*, --memo-*)가 테마별로 정의
import { getCategory } from './store.js';

export const CATEGORY_COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
export const MEMO_COLORS = ['butter', 'peach', 'pink', 'sage', 'sky', 'lilac', 'sand', 'coral'];

// 이벤트의 최종 색상 키: 개별 지정 > 카테고리 색 > 기본
export function eventColorKey(ev) {
  return ev.color || getCategory(ev.categoryId)?.color || 'orange';
}

export const catColorCss = key => `var(--cat-${key})`;

// 아주 작은 DOM 생성 헬퍼
export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// 요일 색상 클래스: 일요일 빨강, 토요일 파랑
export const wdClass = wd => (wd === 0 ? 'wd-sun' : wd === 6 ? 'wd-sat' : '');

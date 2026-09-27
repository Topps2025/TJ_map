// 后端请求与查询参数约定。
export async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '请求失败');
  return data.data;
}

// 拼接点位接口地址：l1/l2/l3/tag 均可选（标签页、搜索直达页可缺层级）
export function pointsApiUrl(st) {
  const params = new URLSearchParams({ status: 'approved' });
  if (st.l1) params.set('l1', st.l1);
  if (st.l2) params.set('l2', st.l2);
  if (st.l3) params.set('l3', st.l3);
  if (st.tag) params.set('tag', st.tag);
  return '/api/points?' + params.toString();
}


// 投稿接口保留业务错误响应，由表单显示具体提示。
export async function submitPoint(formData) {
  const response = await fetch('/api/submit', { method: 'POST', body: formData });
  return response.json();
}

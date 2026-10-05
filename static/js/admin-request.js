// 后台接口共用会话失效与业务错误处理。
export async function adminRequest(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    location.href = '/admin';
    return null;
  }
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || '操作失败');
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return result;
}

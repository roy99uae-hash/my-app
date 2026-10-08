/**
 * Small data-loading hook: runs an async loader and exposes state + reload.
 */
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

export function useAsync(loader, deps = []) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loader();
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      setError(err);
      notify(err.message, 'error');
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

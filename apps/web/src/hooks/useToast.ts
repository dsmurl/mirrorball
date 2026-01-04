import { useState, useEffect, useCallback } from "react";

export const useToast = (duration = 1000) => {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      // Add a small buffer (200ms) to ensure the CSS fade-out animation finishes
      const timer = setTimeout(() => setToast(null), duration + 200);
      return () => clearTimeout(timer);
    }
  }, [toast, duration]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  return { toast, showToast };
};

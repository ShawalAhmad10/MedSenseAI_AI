// src/hooks/useToast.js
// Simple toast system — dispatches a custom DOM event that the ToastContainer listens to.

export function useToast() {
  const showToast = ({ type = 'info', message = '' }) => {
    console.log(`[Toast ${type}]: ${message}`);
    // Fire a custom event so any mounted ToastContainer can display it
    window.dispatchEvent(
      new CustomEvent('medsense:toast', { detail: { type, message } })
    );
  };

  return { showToast };
}

// src/hooks/useCart.js
import { useState, useEffect, useCallback } from 'react';
import cartService from '../services/cartService';
import { useToast } from './useToast';

export function useCart(branchId = null) {
  const { showToast } = useToast();

  const [cart, setCart]         = useState({ id: null, items: [], totalItems: 0, totalPrice: 0, branch: null });
  const [history, setHistory]   = useState([]);
  const [isLoading, setLoading] = useState(false);
  const [isHistoryLoading, setHistLoading] = useState(false);

  // ── Fetch active cart ──────────────────────────────────────────────────────
  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cartService.getCart(branchId);
      // API: { success, data: { id, items, totalItems, totalPrice, branch } }
      const d = res?.data ?? { id: null, items: [], totalItems: 0, totalPrice: 0 };
      setCart(d);
    } catch (err) {
      console.error('[useCart:fetchCart]', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  // ── Fetch history ──────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await cartService.getHistory({ limit: 50 });
      // API: { success, data: { carts: [], pagination: {} } }
      setHistory(res?.data?.carts ?? res?.data ?? []);
    } catch (err) {
      console.error('[useCart:fetchHistory]', err.response?.data || err.message);
    } finally {
      setHistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCart();
    fetchHistory();
  }, [fetchCart]); // eslint-disable-line

  // ── Add item ───────────────────────────────────────────────────────────────
  const addItem = useCallback(async (inventoryId, targetBranchId, quantity = 1) => {
    try {
      await cartService.addItem(inventoryId, targetBranchId ?? branchId, quantity);
      showToast({ type: 'success', message: 'Item added to cart.' });
      await fetchCart();
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.message ?? 'Failed to add item.' });
      throw err;
    }
  }, [fetchCart, branchId, showToast]);

  // ── Update quantity ────────────────────────────────────────────────────────
  const updateItem = useCallback(async (cartItemId, quantity) => {
    try {
      await cartService.updateItem(cartItemId, quantity);
      await fetchCart();
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.message ?? 'Failed to update quantity.' });
      throw err;
    }
  }, [fetchCart, showToast]);

  // ── Remove item ────────────────────────────────────────────────────────────
  const removeItem = useCallback(async (cartItemId) => {
    try {
      await cartService.removeItem(cartItemId);
      showToast({ type: 'success', message: 'Item removed.' });
      await fetchCart();
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.message ?? 'Failed to remove item.' });
      throw err;
    }
  }, [fetchCart, showToast]);

  // ── Clear cart ─────────────────────────────────────────────────────────────
  const clearCart = useCallback(async () => {
    try {
      await cartService.clearCart(branchId);
      showToast({ type: 'success', message: 'Cart cleared.' });
      await fetchCart();
    } catch (err) {
      showToast({ type: 'error', message: err.response?.data?.message ?? 'Failed to clear cart.' });
      throw err;
    }
  }, [fetchCart, branchId, showToast]);

  // Convenience computed values
  const itemCount = cart.items?.length ?? cart.totalItems ?? 0;
  const cartTotal = cart.totalPrice ?? 0;

  return {
    cart, history,
    isLoading, isHistoryLoading,
    itemCount, cartTotal,
    addItem, updateItem, removeItem, clearCart,
    refetch:        fetchCart,
    refetchHistory: fetchHistory,
  };
}

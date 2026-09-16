import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { checkCartDDI, extractDdiWarnings } from '../services/storefrontDdiService';
import { trackFunnelEvent } from '../services/storefrontFunnelService';
import { useAuth } from './AuthContext';

const CartContext = createContext(null);

const CART_KEY_PREFIX = 'medsense_storefront_cart_v3_';
const API_URL = 'http://localhost:5005/api/products';

function getStoredCart(userId) {
  try {
    const key = userId ? `${CART_KEY_PREFIX}${userId}` : `${CART_KEY_PREFIX}guest`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(userId, items) {
  try {
    const key = userId ? `${CART_KEY_PREFIX}${userId}` : `${CART_KEY_PREFIX}guest`;
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save cart:', err);
  }
}

function clearOldGuestCarts() {
  try {
    // Remove old cart keys
    ['medsense_storefront_cart_v2', 'medsense_storefront_account_cart_v2'].forEach(key => {
      localStorage.removeItem(key);
    });
  } catch {}
}

export function CartProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;
  
  const [items, setItems] = useState(() => {
    clearOldGuestCarts();
    return getStoredCart(userId);
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ddiResult, setDdiResult] = useState(null);
  const [ddiLoading, setDdiLoading] = useState(false);
  const [ddiError, setDdiError] = useState(null);

  // Load cart when user changes (login/logout)
  useEffect(() => {
    const newCart = getStoredCart(userId);
    setItems(newCart);
  }, [userId]);

  // Save cart whenever items change
  useEffect(() => {
    saveCart(userId, items);
  }, [userId, items]);

  // Authoritative DDI review whenever cart identity changes.
  // Product salts/status are reloaded by Express from PostgreSQL.
  useEffect(() => {
    let cancelled = false;

    if (items.length === 0) {
      setDdiResult(null);
      setDdiError(null);
      setDdiLoading(false);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setDdiLoading(true);
      setDdiError(null);

      try {
        const result = await checkCartDDI(items);

        if (!cancelled) {
          setDdiResult(result);
          setDdiError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const upstreamResult = error.response?.data?.data ?? null;
          const message =
            error.response?.data?.message ||
            error.message ||
            'Drug interaction review could not be completed.';

          setDdiResult(upstreamResult);
          setDdiError(message);
        }
      } finally {
        if (!cancelled) {
          setDdiLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [items]);

  // ── Live stock fetch ──────────────────────────────────────────
  const fetchLiveStock = async (productId) => {
    try {
      // Use public stock-check endpoint — no auth needed
      const id = typeof productId === 'string' ? productId.replace(/^prod-/, '') : productId;
      const res = await axios.get(`${API_URL}/stock-check/${id}`);
      return Number(res.data?.stockQty ?? 0);
    } catch {
      return null; // null = could not fetch, use cached value
    }
  };

  const addItem = async (item) => {
    try {
      // Fetch live stock before adding
      const liveStock = await fetchLiveStock(item.id);
      const currentStock = liveStock !== null ? liveStock : (item.stockQty ?? 0);

      if (currentStock <= 0) {
        alert(`${item.name || item.title} is out of stock.`);
        return;
      }

      const existing = items.find((entry) => entry.id === item.id);
      const currentCartQty = existing ? existing.quantity : 0;
      const newCartQty = currentCartQty + 1;

      if (newCartQty > currentStock) {
        alert(`Cannot add more of ${item.name || item.title}. Only ${currentStock} units available.`);
        return;
      }

      // Update item with fresh stockQty so cart badge is accurate
      setItems((current) => {
        const existingItem = current.find((entry) => entry.id === item.id);
        if (existingItem) {
          return current.map((entry) =>
            entry.id === item.id
              ? { ...entry, quantity: entry.quantity + 1, stockQty: currentStock }
              : entry,
          );
        }
        return [...current, { ...item, quantity: 1, stockQty: currentStock }];
      });

      setDrawerOpen(true);

      // Best-effort analytics only.
      void trackFunnelEvent(
        'cart_item_added',
        [item.id],
        1
      );
    } catch (error) {
      console.error('Error adding item to cart:', error);
      alert('Failed to add item to cart. Please try again.');
    }
  };

  const removeItem = async (id) => {
    try {
      // Remove from cart state
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error removing item from cart:', error);
    }
  };

  const updateQuantity = async (id, newQuantity) => {
    if (newQuantity <= 0) {
      removeItem(id);
      return;
    }

    try {
      const currentItem = items.find((item) => item.id === id);
      if (!currentItem) return;

      // If increasing, fetch live stock to validate
      if (newQuantity > currentItem.quantity) {
        const liveStock = await fetchLiveStock(id);
        const currentStock = liveStock !== null ? liveStock : (currentItem.stockQty ?? 0);

        if (newQuantity > currentStock) {
          alert(`Cannot increase quantity. Only ${currentStock} units available.`);
          return;
        }
        // Update stockQty in cart item with fresh value
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, quantity: newQuantity, stockQty: currentStock } : item,
          ),
        );
        return;
      }

      // Decreasing — no stock check needed
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item)),
      );
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const clearCart = () => {
    setItems([]);
    saveCart(userId, []);
  };

  // Merge guest cart to account cart when user logs in
  const mergeGuestCartToAccount = () => {
    try {
      if (!userId) return; // Only merge if user is logged in
      
      const guestCart = getStoredCart(null); // Get guest cart
      const accountCart = getStoredCart(userId); // Get account cart
      
      if (guestCart.length === 0) return; // Nothing to merge
      
      // Merge carts - combine quantities for duplicate items
      const mergedCart = [...accountCart];
      guestCart.forEach(guestItem => {
        const existingIndex = mergedCart.findIndex(item => item.id === guestItem.id);
        if (existingIndex >= 0) {
          // Item exists, add quantities (respecting stock limits)
          const newQty = mergedCart[existingIndex].quantity + guestItem.quantity;
          const maxQty = guestItem.stockQty || 999;
          mergedCart[existingIndex].quantity = Math.min(newQty, maxQty);
        } else {
          // New item, add to cart
          mergedCart.push(guestItem);
        }
      });
      
      // Save merged cart and update state
      setItems(mergedCart);
      saveCart(userId, mergedCart);
      
      // Clear guest cart
      localStorage.removeItem(`${CART_KEY_PREFIX}guest`);
    } catch (error) {
      console.error('Error merging guest cart:', error);
    }
  };

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const prescriptionItems = items.filter((item) => item.requiresPrescription);

  const ddiWarnings = useMemo(
    () => extractDdiWarnings(ddiResult, ddiError || ''),
    [ddiResult, ddiError],
  );

  const ddiCheckoutAllowed =
    items.length > 0 &&
    !ddiLoading &&
    !ddiError &&
    ddiResult?.checkout_allowed === true;

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      mergeGuestCartToAccount,
      subtotal,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      prescriptionItems,
      ddiResult,
      ddiLoading,
      ddiError,
      ddiWarnings,
      ddiCheckoutAllowed,
      drawerOpen,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
    }),
    [ddiCheckoutAllowed, ddiError, ddiLoading, ddiResult, ddiWarnings, drawerOpen, items, prescriptionItems, subtotal, userId],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within CartProvider');
  }
  return context;
}

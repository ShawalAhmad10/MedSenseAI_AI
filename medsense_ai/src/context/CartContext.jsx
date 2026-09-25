import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { checkCartDDI, extractDdiWarnings } from '../services/storefrontDdiService';
import {
  resetFunnelCartId,
  trackFunnelEvent,
} from '../services/storefrontFunnelService';
import { useAuth } from './AuthContext';
import {
  cartInstanceStorageKey,
  cartStorageKey,
  clearStoredCartInstanceId,
  ensureStoredCartInstanceId,
  mergeGuestCartIntoAccount,
  readStoredCart,
  readStoredCartInstanceId,
  startFreshCartInstanceId,
  writeStoredCart,
} from '../services/storefrontCartStorage';

const CartContext = createContext(null);

const API_URL = '/api/products';

function clearOldGuestCarts() {
  try {
    // Remove old cart keys
    ['medsense_storefront_cart_v2', 'medsense_storefront_account_cart_v2'].forEach(key => {
      localStorage.removeItem(key);
    });
  } catch {}
}

function buildCartIdentity(items, userId) {
  return JSON.stringify({
    owner: userId ? String(userId) : 'guest',
    items: items
      .map((item) => ({
        id: String(item.id ?? '').replace(/^prod-/, ''),
        quantity: Math.max(1, Number(item.quantity) || 1),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function CartProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;

  const cartOwner =
    userId
      ? String(userId)
      : 'guest';

  const [loadedOwner, setLoadedOwner] =
    useState(cartOwner);

  const [items, setItems] = useState(() => {
    clearOldGuestCarts();
    return readStoredCart(userId);
  });

  const [
    cartInstanceId,
    setCartInstanceId,
  ] = useState(() =>
    items.length > 0
      ? ensureStoredCartInstanceId(
          userId
        )
      : null
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ddiResult, setDdiResult] = useState(null);
  const [ddiLoading, setDdiLoading] = useState(false);
  const [ddiError, setDdiError] = useState(null);
  const [ddiIdentity, setDdiIdentity] = useState(null);

  const cartIdentity = useMemo(
    () => buildCartIdentity(items, userId),
    [items, userId]
  );

  // Swap account carts before the new account is painted.
  // Never write the previous owner's in-memory cart under the new owner.
  useLayoutEffect(() => {
    if (loadedOwner === cartOwner) {
      return;
    }

    const nextItems =
      readStoredCart(
        userId
      );

    setItems(
      nextItems
    );

    setCartInstanceId(
      nextItems.length > 0
        ? ensureStoredCartInstanceId(
            userId
          )
        : null
    );

    setLoadedOwner(
      cartOwner
    );
  }, [
    cartOwner,
    loadedOwner,
    userId,
  ]);

  // Persist only when the rendered state belongs to the current owner.
  useEffect(() => {
    if (loadedOwner !== cartOwner) {
      return;
    }

    writeStoredCart(
      userId,
      items
    );
  }, [
    cartOwner,
    loadedOwner,
    userId,
    items,
  ]);

  // localStorage is shared across tabs. Keep an already-open tab aligned
  // with cart changes made by another tab for the same customer.
  useEffect(() => {
    const cartKey =
      cartStorageKey(
        userId
      );

    const lifecycleKey =
      cartInstanceStorageKey(
        userId
      );

    const handleStorage =
      (event) => {
        if (
          event.storageArea !== localStorage ||
          (
            event.key !== cartKey &&
            event.key !== lifecycleKey
          )
        ) {
          return;
        }

        const storedItems =
          readStoredCart(
            userId
          );

        setItems(
          storedItems
        );

        setCartInstanceId(
          storedItems.length > 0
            ? readStoredCartInstanceId(
                userId
              )
            : null
        );
      };

    window.addEventListener(
      'storage',
      handleStorage
    );

    return () => {
      window.removeEventListener(
        'storage',
        handleStorage
      );
    };
  }, [userId]);

  // Authoritative DDI review whenever cart identity changes.
  // Product salts/status are reloaded by Express from PostgreSQL.
  useEffect(() => {
    let cancelled = false;

    if (items.length === 0) {
      setDdiResult(null);
      setDdiError(null);
      setDdiIdentity(null);
      setDdiLoading(false);
      return undefined;
    }

    const requestIdentity = cartIdentity;

    // Invalidate the previous clearance immediately when cart identity changes.
    // ddiCheckoutAllowed also requires the committed result identity to match
    // the currently rendered cart, so an old result cannot authorize new items.
    setDdiResult(null);
    setDdiError(null);
    setDdiIdentity(null);
    setDdiLoading(true);

    const timer = window.setTimeout(async () => {
      setDdiLoading(true);
      setDdiError(null);

      try {
        const result = await checkCartDDI(items);

        if (!cancelled) {
          setDdiResult(result);
          setDdiError(null);
          setDdiIdentity(requestIdentity);
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
          setDdiIdentity(requestIdentity);
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
  }, [items, cartIdentity]);

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

      // Only after the add has passed validation should an empty cart
      // begin a new safety lifecycle.
      if (items.length === 0) {
        const freshCartInstanceId =
          startFreshCartInstanceId(
            userId
          );

        setCartInstanceId(
          freshCartInstanceId
        );

        // Funnel telemetry may also begin a fresh observational cart,
        // but it is not used as the safety lifecycle identity.
        resetFunnelCartId();
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
      const currentItem =
        items.find((item) => item.id === id);

      if (!currentItem) {
        return;
      }

      const removedQuantity =
        Math.max(
          1,
          Number(currentItem.quantity) || 1
        );

      if (items.length === 1) {
        clearStoredCartInstanceId(
          userId
        );

        setCartInstanceId(
          null
        );
      }

      setItems(
        (current) =>
          current.filter(
            (item) => item.id !== id
          )
      );

      void trackFunnelEvent(
        'cart_item_removed',
        [id],
        removedQuantity
      );
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

        const addedQuantity =
          newQuantity - currentItem.quantity;

        if (addedQuantity > 0) {
          void trackFunnelEvent(
            'cart_item_added',
            [id],
            addedQuantity
          );
        }

        return;
      }

      // Decreasing — no stock check needed
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item)),
      );

      const removedQuantity =
        currentItem.quantity - newQuantity;

      if (removedQuantity > 0) {
        void trackFunnelEvent(
          'cart_item_removed',
          [id],
          removedQuantity
        );
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const clearCart = () => {
    setItems([]);

    writeStoredCart(
      userId,
      []
    );

    clearStoredCartInstanceId(
      userId
    );

    setCartInstanceId(
      null
    );

    resetFunnelCartId();
  };

  // Merge into the identity returned by the successful auth response.
  // Do not depend on this render's possibly-stale userId closure.
  const mergeGuestCartToAccount = (
    targetUserId = userId
  ) => {
    try {
      if (!targetUserId) {
        return null;
      }

      const mergedCart =
        mergeGuestCartIntoAccount(
          targetUserId
        );

      if (!mergedCart) {
        return null;
      }

      // The merged medicine set starts a fresh safety lifecycle
      // owned by the authenticated account.
      clearStoredCartInstanceId(
        null
      );

      const mergedCartInstanceId =
        startFreshCartInstanceId(
          targetUserId
        );

      // Funnel telemetry is observational and rotates independently.
      resetFunnelCartId();

      // Usually the owner switch effect will load the merged cart.
      // If context is already on that owner, update immediately.
      if (
        userId &&
        String(userId) ===
          String(targetUserId)
      ) {
        setItems(
          mergedCart
        );

        setCartInstanceId(
          mergedCartInstanceId
        );
      }

      return mergedCart;
    } catch (error) {
      console.error(
        'Error merging guest cart:',
        error
      );

      return null;
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
    ddiIdentity === cartIdentity &&
    !ddiLoading &&
    !ddiError &&
    ddiResult?.checkout_allowed === true;

  const value = useMemo(
    () => ({
      items,
      cartInstanceId,
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
    [cartInstanceId, ddiCheckoutAllowed, ddiError, ddiLoading, ddiResult, ddiWarnings, drawerOpen, items, prescriptionItems, subtotal, userId],
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

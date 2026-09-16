// src/contexts/CartContext.jsx
// Shared cart state — one source of truth for cart count across all pages
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import cartService from '../services/cartService';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cartCount, setCartCount] = useState(0);
  const [cartId,    setCartId]    = useState(null);
  const fetchingRef = useRef(false);

  const refreshCart = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await cartService.getCart();
      const data = res?.data;
      if (data) {
        // Use items.length as most accurate count (number of distinct medicines)
        const count = data.items?.length ?? data.totalItems ?? 0;
        setCartCount(count);
        setCartId(data.id);
      }
    } catch {
      // silent — user might not be logged in
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // Load on mount
  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  return (
    <CartContext.Provider value={{ cartCount, cartId, refreshCart, setCartCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCartContext() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCartContext must be used inside CartProvider');
  return ctx;
}

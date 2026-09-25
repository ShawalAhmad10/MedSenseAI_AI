// src/services/cartService.js
import api from './api';

/**
 * Cart Service
 * Base: /api/cart
 *
 * New API response shape:
 *   GET  /         → { success, data: { id, items:[], totalItems, totalPrice, branch } }
 *   POST /         → { success, message, data: { cartId } }
 *   PUT  /item/:id → { success, message, data: { id, quantity, unitPrice, totalPrice } }
 *   DELETE /item/:id → { success, message }
 *   DELETE /clear    → { success, message }
 *   GET  /history  → { success, data: { carts:[], pagination:{} } }
 */
const cartService = {

  /** Get active cart. Pass branchId to scope to a specific branch. */
  getCart: (branchId = null) =>
    api.get('/cart', { params: branchId ? { branchId } : {} }).then(r => r.data),

  /**
   * Add item to cart.
   * @param {string} inventoryId — UUID of the inventory row
   * @param {string} branchId    — UUID of the branch
   * @param {number} quantity
   */
  addItem: (inventoryId, branchId, quantity = 1) =>
    api.post('/cart', { inventoryId, branchId, quantity }).then(r => r.data),

  /** Update item quantity */
  updateItem: (itemId, quantity) =>
    api.put(`/cart/item/${itemId}`, { quantity }).then(r => r.data),

  /** Remove item from cart */
  removeItem: (itemId) =>
    api.delete(`/cart/item/${itemId}`).then(r => r.data),

  /** Clear entire cart */
  clearCart: (branchId = null) =>
    api.delete('/cart/clear', { params: branchId ? { branchId } : {} }).then(r => r.data),

  /** Past carts (checked out / abandoned) */
  getHistory: (params = {}) =>
    api.get('/cart/history', { params }).then(r => r.data),
};

export default cartService;

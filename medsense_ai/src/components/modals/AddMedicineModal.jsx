import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Plus, Edit2 } from 'lucide-react';

/**
 * Add/Edit Medicine Modal
 * Handles creating new medicines and editing existing ones
 */
export default function AddMedicineModal({ 
  isOpen, 
  onClose, 
  medicine, 
  onSave, 
  categories = [],
  brands = [],
  suppliers = [],
  productProfile = {}
}) {
  const [formData, setFormData] = useState({
    // Core fields
    product_title: '',
    product_generic_name: '',
    product_category: '',
    brand_name: '',
    selling_price: '',
    purchase_price: '',
    quantity: '',
    min_threshold: 10,
    expiry_date: '',
    requires_prescription: false,
    
    // Extended fields (product profile)
    productDesign: '',
    productSalt: '',
    productSupplierName: '',
    activeStatus: true
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (medicine) {
      // Editing existing medicine
      setFormData({
        product_title: medicine.name || '',
        product_generic_name: medicine.genericName || '',
        product_category: medicine.category || '',
        brand_name: medicine.brand || '',
        selling_price: medicine.unitPrice?.toString() || '',
        purchase_price: medicine.purchasePrice?.toString() || '',
        quantity: medicine.stockQty?.toString() || '',
        min_threshold: medicine.minThreshold || 10,
        expiry_date: medicine.expiryDate || '',
        requires_prescription: medicine.requiresRx || false,
        productDesign: productProfile.productDesign || medicine.productDesign || '',
        productSalt: productProfile.productSalt || medicine.productSalt || '',
        productSupplierName: productProfile.productSupplierName || medicine.productSupplierName || '',
        activeStatus: productProfile.activeStatus ?? medicine.activeStatus ?? true
      });
    } else {
      // Creating new medicine - reset form
      setFormData({
        product_title: '',
        product_generic_name: '',
        product_category: '',
        brand_name: '',
        selling_price: '',
        purchase_price: '',
        quantity: '',
        min_threshold: 10,
        expiry_date: '',
        requires_prescription: false,
        productDesign: '',
        productSalt: '',
        productSupplierName: '',
        activeStatus: true
      });
    }
    setErrors({});
  }, [medicine, productProfile, isOpen]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};
    
    // Product name validation
    if (!formData.product_title.trim()) {
      newErrors.product_title = 'Product name is required';
    } else if (formData.product_title.trim().length < 3) {
      newErrors.product_title = 'Product name must be at least 3 characters';
    }
    
    // Category validation
    if (!formData.product_category.trim()) {
      newErrors.product_category = 'Category is required';
    }
    
    // Price validations
    if (!formData.selling_price || parseFloat(formData.selling_price) <= 0) {
      newErrors.selling_price = 'Selling price must be greater than 0';
    }
    
    if (!formData.purchase_price || parseFloat(formData.purchase_price) <= 0) {
      newErrors.purchase_price = 'Purchase price must be greater than 0';
    }
    
    // Check if selling price is less than purchase price
    if (formData.selling_price && formData.purchase_price) {
      const selling = parseFloat(formData.selling_price);
      const purchase = parseFloat(formData.purchase_price);
      if (selling < purchase) {
        newErrors.selling_price = `Selling price (${selling}) should not be less than purchase price (${purchase})`;
      }
    }
    
    // Quantity validation
    if (formData.quantity && parseInt(formData.quantity) < 0) {
      newErrors.quantity = 'Quantity cannot be negative';
    }
    
    // Expiry date validation
    if (formData.expiry_date) {
      const expiryDate = new Date(formData.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiryDate < today) {
        newErrors.expiry_date = 'Expiry date cannot be in the past';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    try {
      const coreFields = {
        product_title: formData.product_title.trim(),
        product_generic_name: formData.product_generic_name.trim(),
        product_category: formData.product_category.trim(),
        brand_name: formData.brand_name.trim(),
        selling_price: parseFloat(formData.selling_price),
        purchase_price: parseFloat(formData.purchase_price),
        quantity: parseInt(formData.quantity) || 0,
        min_threshold: parseInt(formData.min_threshold) || 10,
        expiry_date: formData.expiry_date || null,
        requires_prescription: formData.requires_prescription
      };

      const extendedFields = {
        brand: formData.brand_name.trim(),
        productDesign: formData.productDesign.trim(),
        productSalt: formData.productSalt.trim(),
        productSupplierName: formData.productSupplierName.trim(),
        activeStatus: formData.activeStatus
      };

      await onSave({ coreFields, extendedFields });
      onClose();
    } catch (error) {
      console.error('Failed to save product:', error);
      setErrors({ submit: 'Failed to save product. Please try again.' });
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '1rem',
          overflowY: 'auto'
        }}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(13, 17, 23, 0.4)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative', width: '100%', maxWidth: 700,
              background: 'var(--dash-card)', borderRadius: 'var(--dash-radius)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.15)', overflow: 'hidden',
              maxHeight: '90vh', display: 'flex', flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--dash-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {medicine ? <Edit2 size={20} color="#2563eb" /> : <Plus size={20} color="#2563eb" />}
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.25rem', color: 'var(--navy)', margin: 0 }}>
                  {medicine ? 'Edit Medicine' : 'Add New Medicine'}
                </h3>
              </div>
              <motion.button 
                whileHover={{ background: 'var(--dash-bg)', scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose} 
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}
              >
                <X size={20} />
              </motion.button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ padding: '1.5rem' }}>
                {/* Error Banner */}
                {errors.submit && (
                  <div style={{ padding: '1rem', background: '#fee2e2', borderRadius: 10, marginBottom: '1rem', color: '#dc2626', fontSize: '0.85rem' }}>
                    {errors.submit}
                  </div>
                )}

                {/* Basic Information */}
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>Basic Information</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Medicine Name <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="product_title"
                      value={formData.product_title}
                      onChange={handleChange}
                      placeholder="e.g., Panadol"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: `1px solid ${errors.product_title ? '#dc2626' : 'var(--dash-border)'}`, fontSize: '0.85rem', outline: 'none' }}
                    />
                    {errors.product_title && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{errors.product_title}</span>}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Generic Name
                    </label>
                    <input
                      type="text"
                      name="product_generic_name"
                      value={formData.product_generic_name}
                      onChange={handleChange}
                      placeholder="e.g., Paracetamol"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Category <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="product_category"
                      value={formData.product_category}
                      onChange={handleChange}
                      list="categories-list"
                      placeholder="e.g., Pain Relief"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: `1px solid ${errors.product_category ? '#dc2626' : 'var(--dash-border)'}`, fontSize: '0.85rem', outline: 'none' }}
                    />
                    <datalist id="categories-list">
                      {categories.map(cat => <option key={cat} value={cat} />)}
                    </datalist>
                    {errors.product_category && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{errors.product_category}</span>}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Brand
                    </label>
                    <input
                      type="text"
                      name="brand_name"
                      value={formData.brand_name}
                      onChange={handleChange}
                      list="brands-list"
                      placeholder="Select or enter brand"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                    <datalist id="brands-list">
                      {brands.map(brand => <option key={brand.id} value={brand.name} />)}
                    </datalist>
                  </div>
                </div>

                {/* Pricing & Stock */}
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>Pricing & Stock</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Purchase Price (PKR) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      name="purchase_price"
                      value={formData.purchase_price}
                      onChange={handleChange}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: `1px solid ${errors.purchase_price ? '#dc2626' : 'var(--dash-border)'}`, fontSize: '0.85rem', outline: 'none' }}
                    />
                    {errors.purchase_price && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{errors.purchase_price}</span>}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Selling Price (PKR) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      name="selling_price"
                      value={formData.selling_price}
                      onChange={handleChange}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: `1px solid ${errors.selling_price ? '#dc2626' : 'var(--dash-border)'}`, fontSize: '0.85rem', outline: 'none' }}
                    />
                    {errors.selling_price && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{errors.selling_price}</span>}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Current Stock
                    </label>
                    <input
                      type="number"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleChange}
                      placeholder="0"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: `1px solid ${errors.quantity ? '#dc2626' : 'var(--dash-border)'}`, fontSize: '0.85rem', outline: 'none' }}
                    />
                    {errors.quantity && <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>{errors.quantity}</span>}
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Min Threshold
                    </label>
                    <input
                      type="number"
                      name="min_threshold"
                      value={formData.min_threshold}
                      onChange={handleChange}
                      placeholder="10"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      name="expiry_date"
                      value={formData.expiry_date}
                      onChange={handleChange}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.75rem' }}>
                    <input
                      type="checkbox"
                      id="requires_prescription"
                      name="requires_prescription"
                      checked={formData.requires_prescription}
                      onChange={handleChange}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <label htmlFor="requires_prescription" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', cursor: 'pointer' }}>
                      Requires Prescription
                    </label>
                  </div>
                </div>

                {/* Extended Information */}
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>Additional Details</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Product Design
                    </label>
                    <input
                      type="text"
                      name="productDesign"
                      value={formData.productDesign}
                      onChange={handleChange}
                      placeholder="e.g., Tablet, Syrup"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Salt/Composition
                    </label>
                    <input
                      type="text"
                      name="productSalt"
                      value={formData.productSalt}
                      onChange={handleChange}
                      placeholder="e.g., 500mg"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                      Supplier
                    </label>
                    <input
                      type="text"
                      name="productSupplierName"
                      value={formData.productSupplierName}
                      onChange={handleChange}
                      list="suppliers-list"
                      placeholder="Select or enter supplier"
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--dash-border)', fontSize: '0.85rem', outline: 'none' }}
                    />
                    <datalist id="suppliers-list">
                      {suppliers.map(supplier => <option key={supplier.id} value={supplier.name} />)}
                    </datalist>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      id="activeStatus"
                      name="activeStatus"
                      checked={formData.activeStatus}
                      onChange={handleChange}
                      style={{ marginRight: '0.5rem' }}
                    />
                    <label htmlFor="activeStatus" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--gray-600)', cursor: 'pointer' }}>
                      Active Status
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '1.25rem 1.5rem', background: 'var(--dash-bg)', borderTop: '1px solid var(--dash-border)', display: 'flex', gap: '0.75rem' }}>
                <motion.button 
                  type="button"
                  whileHover={{ background: 'white' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: 100, border: '1px solid var(--dash-border)', background: 'transparent', color: 'var(--gray-600)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                >
                  Cancel
                </motion.button>
                <motion.button 
                  type="submit"
                  whileHover={{ scale: 1.02, background: '#1e40af' }}
                  whileTap={{ scale: 0.98 }}
                  style={{ flex: 1, padding: '0.75rem', borderRadius: 100, border: 'none', background: '#2563eb', color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <Package size={16} />
                  {medicine ? 'Update Medicine' : 'Add Medicine'}
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PackagePlus, Plus, Trash2, X } from 'lucide-react';

const fieldStyle = {
  width: '100%',
  padding: '0.72rem 0.9rem',
  borderRadius: 10,
  border: '1px solid var(--dash-border)',
  background: 'white',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
};

function emptyLine() {
  return {
    batchNumber: '',
    productId: '',
    name: '',
    bale: '',
    baleSize: '',
    qty: 1,
    bonus: 0,
    discount: 0,
    discountPercent: 0, // Percentage-based discount
    purchasePrice: 0,
    salePrice: 0,
    salesTax: 0,
    advanceTax: 0,
    salesTaxPercent: 0, // For real-time calculation
    advanceTaxPercent: 0, // For real-time calculation
    productExpiry: '',
  };
}

export default function StockIntakeModal({ isOpen, onClose, catalog, currentUserName, onSubmit }) {
  const [form, setForm] = useState({
    supplierId: '',
    stockPrice: 0,
    billNo: '',
    builtyNo: '',
    creationDate: new Date().toISOString().split('T')[0],
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const suppliers = catalog?.suppliers || [];
    setForm({
      supplierId: suppliers[0]?.id ?? '',
      stockPrice: 0,
      billNo: '',
      builtyNo: '',
      creationDate: '2026-08-09',
    });
    setLines([emptyLine()]);
    setError('');
    setIsSaving(false);
    setProductSearches({});
    setShowDropdowns({});
  }, [catalog, isOpen]);

  // Product search state
  // Product search state  
  const [productSearches, setProductSearches] = useState({});
  const [showDropdowns, setShowDropdowns] = useState({});
  
  // Global hover style for dropdowns
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .product-autocomplete-item:hover {
        background: #f1f5f9 !important;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.product-autocomplete-wrapper')) {
        setShowDropdowns({});
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Filter products based on selected supplier
  const filteredProducts = useMemo(() => {
    if (!form.supplierId) return catalog?.products || [];
    
    // Special case: "Open Market" (sup-0) shows ALL products
    if (form.supplierId === 'sup-0') {
      return catalog?.products || [];
    }
    
    // Extract numeric ID from supplier ID (format: "sup-5" -> 5)
    const selectedSupplierId = form.supplierId.includes('sup-') 
      ? Number(form.supplierId.replace('sup-', ''))
      : Number(form.supplierId);
    
    const filtered = (catalog?.products || []).filter(product => {
      // Product.supplierId is a plain number (e.g., 5)
      return product.supplierId === selectedSupplierId;
    });
    
    return filtered;
  }, [catalog?.products, form.supplierId]);
  
  // Get filtered products for a specific line based on search
  const getSearchedProducts = (lineIndex) => {
    const searchTerm = productSearches[lineIndex] || '';
    if (!searchTerm.trim()) return filteredProducts;
    
    const lowerSearch = searchTerm.toLowerCase();
    return filteredProducts.filter(p => 
      p.title?.toLowerCase().includes(lowerSearch) ||
      p.genericName?.toLowerCase().includes(lowerSearch) ||
      p.salt?.toLowerCase().includes(lowerSearch)
    );
  };

  const updateLine = (index, patch) => {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };
        
        // Auto-fill product details when product is selected
        if (patch.productId) {
          const product = filteredProducts.find((entry) => entry.id === patch.productId);
          if (product) {
            next.name = product.title;
            next.salePrice = product.price || product.defaultSalePrice || 0;
            next.purchasePrice = product.price || 0;
            next.baleSize = product.packSize || 0; // Auto-fill pack size from product
            // Expiry is now entered manually per batch, not from product
            
            // Clear search after selection
            setProductSearches(prev => ({ ...prev, [index]: '' }));
          }
        }
        
        // Real-time calculations based on changes
        const qty = Number((patch.qty !== undefined ? patch.qty : next.qty) || 0);
        const purchasePrice = Number((patch.purchasePrice !== undefined ? patch.purchasePrice : next.purchasePrice) || 0);
        const discountPercent = Number((patch.discountPercent !== undefined ? patch.discountPercent : next.discountPercent) || 0);
        const salesTaxPercent = Number((patch.salesTaxPercent !== undefined ? patch.salesTaxPercent : next.salesTaxPercent) || 0);
        const advanceTaxPercent = Number((patch.advanceTaxPercent !== undefined ? patch.advanceTaxPercent : next.advanceTaxPercent) || 0);
        
        // Auto-calculate Discount = (qty × purchasePrice) × (discountPercent / 100)
        if (patch.qty !== undefined || patch.purchasePrice !== undefined || patch.discountPercent !== undefined) {
          next.discount = (qty * purchasePrice * discountPercent) / 100;
        }
        
        // Auto-calculate Sales Tax = (qty × purchasePrice) × (salesTaxPercent / 100)
        if (patch.qty !== undefined || patch.purchasePrice !== undefined || patch.salesTaxPercent !== undefined) {
          next.salesTax = (qty * purchasePrice * salesTaxPercent) / 100;
        }
        
        // Auto-calculate Advance Tax = (qty × purchasePrice) × (advanceTaxPercent / 100)
        if (patch.qty !== undefined || patch.purchasePrice !== undefined || patch.advanceTaxPercent !== undefined) {
          next.advanceTax = (qty * purchasePrice * advanceTaxPercent) / 100;
        }
        
        return next;
      }),
    );
  };

  const totals = useMemo(() => {
    let grossTotal = 0;
    let totalSalesTax = 0;
    let totalAdvanceTax = 0;
    let totalDiscount = 0;
    let totalUnits = 0;
    
    lines.forEach((line) => {
      const qty = Number(line.qty || 0);
      const packSize = Number(line.baleSize || 0);
      const purchasePrice = Number(line.purchasePrice || 0);
      const salesTax = Number(line.salesTax || 0);
      const advanceTax = Number(line.advanceTax || 0);
      const discount = Number(line.discount || 0);
      
      const lineSubtotal = qty * purchasePrice;
      grossTotal += lineSubtotal;
      totalSalesTax += salesTax;
      totalAdvanceTax += advanceTax;
      totalDiscount += discount;
      
      // Total stock units (no bonus anymore)
      totalUnits += qty * packSize;
    });
    
    const subTotal = grossTotal + totalSalesTax + totalAdvanceTax - totalDiscount;
    
    return { 
      grossTotal,
      totalSalesTax,
      totalAdvanceTax,
      totalDiscount,
      subTotal,
      units: totalUnits,
      lineTotal: subTotal // Keep for compatibility
    };
  }, [lines]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Clear previous errors
    setError('');
    
    const suppliers = catalog?.suppliers || [];
    
    // Validation 1: Check if supplier is selected
    if (!form.supplierId) {
      setError('⚠️ Please select a supplier first');
      return;
    }
    
    const validLines = lines.filter((line) => line.productId && Number(line.qty) > 0 && Number(line.purchasePrice) > 0);
    
    // Validation 2: Check if at least one product is added
    if (validLines.length === 0) {
      setError('⚠️ Please add at least one product with valid quantity and price');
      return;
    }
    
    // Validation 3: Check individual line items for complete data
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip empty lines
      if (!line.productId && !line.qty && !line.purchasePrice) {
        continue;
      }
      
      // If line has any data, validate all required fields
      if (!line.productId) {
        setError(`⚠️ Row ${i + 1}: Please select a product`);
        return;
      }
      
      if (!line.qty || Number(line.qty) <= 0) {
        setError(`⚠️ Row ${i + 1} (${line.name}): Quantity must be greater than 0`);
        return;
      }
      
      if (!line.purchasePrice || Number(line.purchasePrice) <= 0) {
        setError(`⚠️ Row ${i + 1} (${line.name}): Purchase price must be greater than 0`);
        return;
      }
      
      if (line.salePrice && Number(line.salePrice) < Number(line.purchasePrice)) {
        setError(`⚠️ Row ${i + 1} (${line.name}): Sale price (${line.salePrice}) should not be less than purchase price (${line.purchasePrice})`);
        return;
      }
      
      // Check expiry date if provided
      if (line.productExpiry) {
        const expiryDate = new Date(line.productExpiry);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (expiryDate < today) {
          setError(`⚠️ Row ${i + 1} (${line.name}): Expiry date cannot be in the past`);
          return;
        }
      }
    }
    
    // Allow Open Market (sup-0) or valid supplier selection
    const isOpenMarket = form.supplierId === 'sup-0';
    const supplier = isOpenMarket ? { name: 'Open Market' } : suppliers.find((entry) => entry.id === form.supplierId);

    if (!isOpenMarket && !supplier) {
      setError('⚠️ Invalid supplier selected');
      return;
    }

    // Extract numeric supplier ID from string format "sup-3" -> 3
    // Special case: "sup-0" (Open Market) -> 0
    const numericSupplierId = form.supplierId === 'sup-0' 
      ? 0 
      : form.supplierId.includes('sup-') 
        ? Number(form.supplierId.replace('sup-', ''))
        : Number(form.supplierId);

    // Extract numeric product IDs from "prod-1" -> 1
    const formattedLines = validLines.map(line => ({
      ...line,
      // productId is stored as UUID in DB — strip the "prod-" prefix but keep as string
      productId: line.productId.startsWith('prod-')
        ? line.productId.replace('prod-', '')
        : line.productId,
      bale:     line.bale     ? Number(line.bale)     : null,
      baleSize: line.baleSize ? Number(line.baleSize) : null,
      bonus:    Number(line.bonus || 0),   // ← bonus in payload
    }));

    setIsSaving(true);
    try {
      await onSubmit({
        ...form,
        supplierId: numericSupplierId,
        supplierName: numericSupplierId === 0 ? 'Open Market' : supplier.name,
        createdBy: currentUserName,
        stockPrice: Number(form.stockPrice || totals.lineTotal),
        items: formattedLines,
      });
      onClose();
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save stock intake.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            style={{
              position: 'relative',
              width: 'min(95vw, 1400px)',
              maxHeight: '95vh',
              overflowY: 'auto',
              background: 'white',
              borderRadius: 'var(--dash-radius)',
              border: '1px solid var(--dash-border)',
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
            }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--dash-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PackagePlus size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>Receive Stock Batch</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                      Procurement intake with purchase, tax, bale, expiry, and bonus fields.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--gray-400)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '1.5rem', display: 'grid', gap: '1.5rem' }}>
                {(!catalog?.suppliers || catalog.suppliers.length === 0) && (
                  <div style={{ borderRadius: 12, border: '1px solid #fbbf24', background: '#fffbeb', color: '#92400e', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                    ⚠️ No suppliers found. Please add suppliers first from the Suppliers tab.
                  </div>
                )}
                {(!catalog?.products || catalog.products.length === 0) && (
                  <div style={{ borderRadius: 12, border: '1px solid #fbbf24', background: '#fffbeb', color: '#92400e', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                    ⚠️ No products found. Please add products first from the Inventory or Products tab.
                  </div>
                )}
                {form.supplierId && form.supplierId !== 'sup-0' && filteredProducts.length === 0 && (
                  <div style={{ borderRadius: 12, border: '1px solid #3b82f6', background: '#eff6ff', color: '#1e40af', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                    ℹ️ No products found for selected supplier. Add products linked to this supplier from Product Management.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Supplier Name</label>
                    <select value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))} style={fieldStyle}>
                      <option value="">Select supplier</option>
                      <option value="sup-0" style={{ fontWeight: 'bold', background: '#f0fdf4' }}>🌐 Open Market (All Products)</option>
                      {(catalog?.suppliers || []).map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Bill Number (Optional)</label>
                    <input value={form.billNo} onChange={(event) => setForm((current) => ({ ...current, billNo: event.target.value }))} placeholder="Leave empty for auto (BILL-0001, BILL-0002...)" style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: 'var(--gray-600)', marginBottom: '0.35rem' }}>Entry Date</label>
                    <input type="date" value={form.creationDate} onChange={(event) => setForm((current) => ({ ...current, creationDate: event.target.value }))} style={fieldStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: 'var(--dash-bg)', border: '1px solid var(--dash-border)' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--gray-400)', fontWeight: 700 }}>Gross Total</div>
                    <div style={{ fontSize: '0.92rem', color: 'var(--navy)', fontWeight: 700, marginTop: 4 }}>PKR {totals.grossTotal.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: '#fef3c7', border: '1px solid #fbbf24' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#92400e', fontWeight: 700 }}>Sales Tax</div>
                    <div style={{ fontSize: '0.92rem', color: '#92400e', fontWeight: 700, marginTop: 4 }}>PKR {totals.totalSalesTax.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: '#fce7f3', border: '1px solid #f472b6' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#9f1239', fontWeight: 700 }}>Adv. Tax</div>
                    <div style={{ fontSize: '0.92rem', color: '#9f1239', fontWeight: 700, marginTop: 4 }}>PKR {totals.totalAdvanceTax.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: '#dcfce7', border: '1px solid #22c55e' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#166534', fontWeight: 700 }}>Total Discount</div>
                    <div style={{ fontSize: '0.92rem', color: '#166534', fontWeight: 700, marginTop: 4 }}>PKR {totals.totalDiscount.toLocaleString()}</div>
                  </div>
                  <div style={{ padding: '0.9rem 1rem', borderRadius: 14, background: '#eff6ff', border: '1px solid #3b82f6' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#1e40af', fontWeight: 700 }}>Sub Total</div>
                    <div style={{ fontSize: '0.92rem', color: '#1e40af', fontWeight: 700, marginTop: 4 }}>PKR {totals.subTotal.toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--dash-border)', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.95rem 1rem', borderBottom: '1px solid var(--dash-border)', background: 'var(--dash-bg)' }}>
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--navy)' }}>Batch Line Items</strong>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: 'var(--gray-400)' }}>
                        Full stock report fields: batch, bale, bonus, prices, tax, total, and expiry.
                      </p>
                    </div>
                    <button type="button" onClick={() => setLines((current) => [...current, emptyLine()])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--navy)', color: 'white', borderRadius: 999, padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                      <Plus size={14} /> Add Line
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1600 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--dash-border)' }}>
                          {['Product Name', 'Batch#', 'Brand', 'Qty', 'Bonus', 'Pack Size', 'Expiry', 'Discount%', 'Price', 'VAT%', 'Adv.Tax%', 'Total Qty', 'Total Price', ''].map((heading) => (
                            <th key={heading} style={{ padding: '0.8rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--gray-400)' }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
                          const qty = Number(line.qty || 0);
                          const bonus = Number(line.bonus || 0);
                          const packSize = Number(line.baleSize || 0);
                          const purchasePrice = Number(line.purchasePrice || 0);
                          const salesTax = Number(line.salesTax || 0);
                          const advanceTax = Number(line.advanceTax || 0);
                          const discount = Number(line.discount || 0);
                          
                          // Total Qty = (qty + bonus) × pack size
                          const totalQty = (qty + bonus) * (packSize || 1);
                          
                          // Total Price = Gross + VAT + Tax - Discount
                          const totalPrice = Math.max((qty * purchasePrice) + salesTax + advanceTax - discount, 0);
                          
                          // Get product for brand name
                          const product = filteredProducts.find(p => p.id === line.productId);
                          const brandName = product?.brandName || '';
                          
                          return (
                            <tr key={`stock-line-${index}`} style={{ borderTop: '1px solid var(--dash-border)' }}>
                              {/* Product Name - Autocomplete like Brand/Supplier */}
                              <td style={{ padding: '0.75rem' }}>
                                <div className="product-autocomplete-wrapper" style={{ position: 'relative' }}>
                                  <input
                                    type="text"
                                    value={productSearches[index] || ''}
                                    onChange={(e) => {
                                      setProductSearches(prev => ({ ...prev, [index]: e.target.value }));
                                      setShowDropdowns(prev => ({ ...prev, [index]: true }));
                                      // Clear selection when typing
                                      if (line.productId) {
                                        updateLine(index, { productId: '', name: '' });
                                      }
                                    }}
                                    onFocus={() => setShowDropdowns(prev => ({ ...prev, [index]: true }))}
                                    placeholder="Type to search product..."
                                    style={{ ...fieldStyle, minWidth: 180 }}
                                    autoComplete="off"
                                  />
                                  {/* Dropdown - same style as Brand/Supplier */}
                                  {showDropdowns[index] && productSearches[index]?.trim().length > 0 && getSearchedProducts(index).length > 0 && (
                                    <div style={{
                                      position: 'absolute',
                                      top: 'calc(100% + 4px)',
                                      left: 0,
                                      right: 0,
                                      background: 'white',
                                      border: '1px solid var(--dash-border)',
                                      borderRadius: 8,
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                      maxHeight: 200,
                                      overflowY: 'auto',
                                      zIndex: 1000
                                    }}>
                                      {getSearchedProducts(index).map((product) => (
                                        <div
                                          key={product.id}
                                          onClick={() => {
                                            updateLine(index, { productId: product.id });
                                            setProductSearches(prev => ({ ...prev, [index]: product.title }));
                                            setShowDropdowns(prev => ({ ...prev, [index]: false }));
                                          }}
                                          className="product-autocomplete-item"
                                          style={{
                                            padding: '0.65rem 0.75rem',
                                            fontSize: '0.84rem',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid var(--dash-border)',
                                            transition: 'background 0.15s'
                                          }}
                                        >
                                          {product.title}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {showDropdowns[index] && productSearches[index]?.trim().length > 0 && getSearchedProducts(index).length === 0 && (
                                    <div style={{
                                      position: 'absolute',
                                      top: 'calc(100% + 4px)',
                                      left: 0,
                                      right: 0,
                                      background: 'white',
                                      border: '1px solid var(--dash-border)',
                                      borderRadius: 8,
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                      maxHeight: 200,
                                      overflowY: 'auto',
                                      zIndex: 1000
                                    }}>
                                      <div style={{
                                        padding: '0.65rem 0.75rem',
                                        fontSize: '0.84rem',
                                        color: 'var(--gray-400)',
                                        cursor: 'default',
                                        borderBottom: '1px solid var(--dash-border)'
                                      }}>
                                        No product found
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                              {/* Batch */}
                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ ...fieldStyle, minWidth: 100, background: '#f0f9ff', color: '#0369a1', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  AUTO
                                </div>
                              </td>
                              {/* Brand */}
                              <td style={{ padding: '0.75rem', fontSize: '0.82rem', color: 'var(--gray-600)' }}>
                                {brandName || '-'}
                              </td>
                              {/* Quantity */}
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="1" value={line.qty} onChange={(event) => updateLine(index, { qty: event.target.value })} style={{ ...fieldStyle, width: 80 }} />
                              </td>
                              {/* Bonus */}
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="0" value={line.bonus || ''} onChange={(event) => updateLine(index, { bonus: event.target.value })} placeholder="0" style={{ ...fieldStyle, width: 70 }} />
                              </td>
                              {/* Pack Size */}
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="0" value={line.baleSize || ''} onChange={(event) => updateLine(index, { baleSize: event.target.value })} placeholder="10" style={{ ...fieldStyle, width: 80 }} />
                              </td>
                              {/* Expiry */}
                              <td style={{ padding: '0.75rem' }}>
                                <input type="date" value={line.productExpiry} onChange={(event) => updateLine(index, { productExpiry: event.target.value })} style={{ ...fieldStyle, width: 150 }} />
                              </td>

                              {/* Discount % */}
                              <td style={{ padding: '0.75rem' }}>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100" 
                                  step="0.1"
                                  value={line.discountPercent || ''} 
                                  onChange={(event) => updateLine(index, { discountPercent: event.target.value })} 
                                  placeholder="%" 
                                  style={{ ...fieldStyle, width: 70 }} 
                                />
                              </td>
                              {/* Price */}
                              <td style={{ padding: '0.75rem' }}>
                                <input type="number" min="0" step="0.01" value={line.purchasePrice} onChange={(event) => updateLine(index, { purchasePrice: event.target.value })} style={{ ...fieldStyle, width: 100 }} />
                              </td>
                              {/* VAT (Sales Tax %) */}
                              <td style={{ padding: '0.75rem' }}>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100" 
                                  step="0.1"
                                  value={line.salesTaxPercent || ''} 
                                  onChange={(event) => updateLine(index, { salesTaxPercent: event.target.value })} 
                                  placeholder="%" 
                                  style={{ ...fieldStyle, width: 70 }} 
                                />
                              </td>
                              {/* Adv.Tax % */}
                              <td style={{ padding: '0.75rem' }}>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100" 
                                  step="0.1"
                                  value={line.advanceTaxPercent || ''} 
                                  onChange={(event) => updateLine(index, { advanceTaxPercent: event.target.value })} 
                                  placeholder="%" 
                                  style={{ ...fieldStyle, width: 70 }} 
                                />
                              </td>
                              {/* Total Quantity */}
                              <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>
                                {totalQty}
                              </td>
                              {/* Total Price */}
                              <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>
                                PKR {totalPrice.toLocaleString()}
                              </td>
                              {/* Delete Button */}
                              <td style={{ padding: '0.75rem' }}>
                                <button type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1} style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--dash-border)', background: 'white', color: '#ef4444', cursor: 'pointer' }}>
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {error && (
                  <div style={{ borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', padding: '0.85rem 1rem', fontSize: '0.82rem' }}>
                    {error}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem 1.5rem', borderTop: '1px solid var(--dash-border)' }}>
                <button type="button" onClick={onClose} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: 'white', color: 'var(--navy)', cursor: 'pointer', fontWeight: 700 }}>
                  Cancel
                </button>
                <button type="submit" disabled={isSaving} style={{ padding: '0.72rem 1.2rem', borderRadius: 999, border: 'none', background: 'var(--navy)', color: 'white', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: isSaving ? 0.7 : 1 }}>
                  {isSaving ? 'Saving Batch...' : 'Save Stock Batch'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

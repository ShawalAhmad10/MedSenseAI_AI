import { useEffect, useMemo, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { Edit3, Package, Plus, Power, Search, Trash2 } from 'lucide-react';
import { listProducts, createProduct, updateProduct, deleteProduct, toggleProductStatus } from '../../services/productService';
import { listBrands } from '../../services/brandService';
import { listSuppliers } from '../../services/supplierService';
import { MEDICINE_CATEGORIES } from '../../constants/categories';

const emptyProduct = { title: '',  salt: '', category: '', brandId: '', supplierId: '', price: '', purchasePrice: '', packPrice: '', packSize: '1', packDescription: '', minThreshold: '', discount: 0, requiresRx: false, description: '', status: 'active' };
// Note: Stock quantity and expiry date are NOT managed here - they're managed in Inventory > Stock Receive (batch level)
const categories = MEDICINE_CATEGORIES;

export default function ProductManagement() {
  const [products, setProducts] = useState([]); 
  const [brands, setBrands] = useState([]); 
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState(''); 
  const [status, setStatus] = useState('all'); 
  const [editing, setEditing] = useState(null); 
  const [form, setForm] = useState(emptyProduct); 
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [brandSearch, setBrandSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Add global style for autocomplete hover
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .autocomplete-item:hover {
        background: #f1f5f9 !important;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('label')) {
        setShowBrandDropdown(false);
        setShowSupplierDropdown(false);
        setShowCategoryDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const refresh = async (quiet = false) => { 
    if (!quiet) setIsLoading(true);
    try {
      const [productList, brandList, supplierList] = await Promise.all([
        listProducts(), 
        listBrands(), 
        listSuppliers()
      ]); 
      setProducts(productList); 
      setBrands(brandList); 
      setSuppliers(supplierList); 
    } catch (error) {
      showMessage('error', 'Failed to load data: ' + (error.response?.data?.message || error.message));
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  useLiveDataRefresh(() => refresh(true));
  const filtered = useMemo(() => products.filter((product) => 
    [product.title, product.salt, product.category, product.brandName, product.supplierName].join(' ').toLowerCase().includes(search.toLowerCase()) && 
    (status === 'all' || product.status === status)
  ), [products, search, status]);

  const openEditor = (product = null) => { 
    setEditing(product); 
    setBrandSearch('');
    setSupplierSearch('');
    setCategorySearch('');
    if (product) {
      // Use the actual stored packPrice from database
      // Only calculate if packPrice is missing (for legacy products)
      const packSize = Number(product.packSize) || 1;
      const price = Number(product.price) || 0;
      const packPrice = Number(product.packPrice) || (price * packSize);
      
      setForm({ 
        title: product.title,
        salt: product.salt,
        category: product.category || '',
        brandId: product.brandId,
        supplierId: product.supplierId,
        price: product.price,
        purchasePrice: product.purchasePrice ?? '',
        packPrice: packPrice,
        packSize: product.packSize || '1',
        packDescription: product.packDescription || '',
        minThreshold: product.minThreshold || '',
        discount: product.discount || 0,
        requiresRx: product.requiresRx || false,
        description: product.description || '',
        status: product.status
      });
      setBrandSearch(product.brandName || '');
      setSupplierSearch(product.supplierName || '');
      setCategorySearch(product.category || '');
    } else {
      setForm({ ...emptyProduct });
      setBrandSearch('');
      setSupplierSearch('');
      setCategorySearch('');
    }
    setIsOpen(true); 
  };

  const filteredBrands = useMemo(() => 
    brands.filter(b => 
      b.status === 'active' && 
      b.name.toLowerCase().includes(brandSearch.toLowerCase())
    ), 
    [brands, brandSearch]
  );

  const filteredSuppliers = useMemo(() => 
    suppliers.filter(s => 
      s.status === 'active' && 
      s.name.toLowerCase().includes(supplierSearch.toLowerCase())
    ), 
    [suppliers, supplierSearch]
  );

  const filteredCategories = useMemo(() => 
    categories.filter(c => 
      c.toLowerCase().includes(categorySearch.toLowerCase())
    ), 
    [categorySearch]
  );

  const selectBrand = (brand) => {
    setForm(prev => ({ ...prev, brandId: parseInt(brand.id.replace('brand-', '')) }));
    setBrandSearch(brand.name);
    setShowBrandDropdown(false);
  };

  const selectSupplier = (supplier) => {
    setForm(prev => ({ ...prev, supplierId: parseInt(supplier.id.replace('sup-', '')) }));
    setSupplierSearch(supplier.name);
    setShowSupplierDropdown(false);
  };

  const selectCategory = (categoryObj) => {
    const categoryValue = typeof categoryObj === 'string' ? categoryObj : categoryObj.name;
    setForm(prev => ({ ...prev, category: categoryValue }));
    setCategorySearch(categoryValue);
    setShowCategoryDropdown(false);
  };
  
  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    
    setForm((current) => {
      const updated = { ...current, [field]: value };
      
      // Auto-calculate unit price when pack price or pack size changes
      if (field === 'packPrice' || field === 'packSize') {
        const packPrice = Number(field === 'packPrice' ? value : current.packPrice) || 0;
        const packSize = Number(field === 'packSize' ? value : current.packSize) || 1;
        
        if (packSize > 0 && packPrice > 0) {
          updated.price = (packPrice / packSize).toFixed(2);
        } else {
          updated.price = '';
        }
      }
      
      return updated;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      showMessage('error', 'Product title is required');
      return;
    }
    if (!form.category) {
      showMessage('error', 'Category is required');
      return;
    }
    if (!form.brandId) {
      showMessage('error', 'Brand is required');
      return;
    }
    if (!form.supplierId) {
      showMessage('error', 'Supplier is required');
      return;
    }
    if (!form.packPrice || form.packPrice <= 0) {
      showMessage('error', 'Valid pack price is required');
      return;
    }
    if (!form.packSize || form.packSize <= 0) {
      showMessage('error', 'Valid pack size is required');
      return;
    }
    if (!form.price || form.price <= 0) {
      showMessage('error', 'Product price could not be calculated. Please check pack price and pack size.');
      return;
    }
    if (form.minThreshold === '' || form.minThreshold < 0) {
      showMessage('error', 'Valid minimum threshold is required');
      return;
    }
    // Expiry date removed - it's managed at batch level in Stock Receive

    if (!editing && (!Number.isFinite(Number(form.purchasePrice)) || Number(form.purchasePrice) <= 0 ||
        Number(form.purchasePrice) > Number(form.price))) {
      showMessage('error', 'Enter a valid purchase cost per unit, at or below the sale price.');
      return;
    }

    try {
      const payload = { 
        sourceProductId: form.sourceProductId,
        title: form.title.trim(),
        genericName: form.salt?.trim() || form.title.trim(), // Use salt as genericName (they're same)
        salt: form.salt?.trim() || '',
        category: form.category,
        brandId: parseInt(form.brandId),
        supplierId: parseInt(form.supplierId),
        price: Number(form.price),
        ...(!editing && form.purchasePrice !== '' ? { purchasePrice: Number(form.purchasePrice) } : {}),
        packPrice: Number(form.packPrice || 0),
        packSize: Number(form.packSize || 0),
        packDescription: form.packDescription?.trim() || '',
        minThreshold: Number(form.minThreshold),
        discount: Number(form.discount || 0),
        requiresRx: form.requiresRx,
        status: form.status
      };

      if (editing) {
        await updateProduct(editing.id, payload);
        showMessage('success', `Product "${form.title}" updated successfully!`);
      } else {
        await createProduct(payload);
        showMessage('success', `Product "${form.title}" created successfully!`);
      }

      setIsOpen(false);
      setEditing(null);
      setBrandSearch('');
      setSupplierSearch('');
      await refresh();
    } catch (error) {
      showMessage('error', error.response?.data?.message || error.message);
    }
  };

  const toggle = async (product) => {
    try {
      await toggleProductStatus(product.id);
      showMessage('success', `Product "${product.title}" status toggled!`);
      await refresh();
    } catch (error) {
      showMessage('error', 'Failed to toggle status: ' + (error.response?.data?.message || error.message));
    }
  };

  const remove = async (product) => { 
    if (window.confirm(`Delete ${product.title}?`)) { 
      try {
        await deleteProduct(product.id); 
        showMessage('success', `Product "${product.title}" deleted successfully!`);
        await refresh(); 
      } catch (error) {
        showMessage('error', 'Failed to delete product: ' + (error.response?.data?.message || error.message));
      }
    } 
  };
  return <div style={{ maxWidth: 1250, margin: '0 auto', padding: '1.5rem' }}>
    {/* Success/Error Message Toast */}
    {message && (
      <div style={{
        position: 'fixed',
        top: '1.5rem',
        right: '1.5rem',
        zIndex: 10000,
        minWidth: 320,
        maxWidth: 480,
        background: 'white',
        borderRadius: 12,
        border: `2px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        animation: 'slideIn 0.3s ease-out'
      }}>
        <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500, color: 'var(--navy)' }}>
          {message.text}
        </span>
        <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--gray-400)', fontSize: '1.5rem' }}>×</button>
      </div>
    )}

    <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}><div><h1 style={{ margin: 0, color: 'var(--navy)' }}>Product Management</h1><p style={{ color: 'var(--gray-400)', margin: '0.35rem 0 0' }}>Manage products from database - {products.length} total products. Brand & Supplier required.</p></div><button onClick={() => openEditor()} style={buttonStyle}><Plus size={16} /> Add Product</button></header>
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}><div style={{ position: 'relative', flex: 1, minWidth: 240 }}><Search size={16} style={iconStyle} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" style={inputStyle} /></div><select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...inputStyle, width: 150 }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
    <div style={tableStyle}>
      <div style={rowStyle(true)}>
        <span>Product</span>
        <span>Brand</span>
        <span>Supplier</span>
        <span>Price</span>
        <span>Status</span>
        <span>Actions</span>
      </div>
      {isLoading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
          <div style={{ fontSize: '0.9rem' }}>Loading products...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
          <Package size={28} />
          <p>No products match this view.</p>
        </div>
      ) : (
        filtered.map((product) => (
          <div key={product.id} style={rowStyle(false)}>
            <div>
              <strong>{product.title}</strong>
              <small style={{ display: 'block', color: 'var(--gray-400)' }}>{product.salt || '-'}</small>
            </div>
            <span>{product.brandName || '-'}</span>
            <span>{product.supplierName || '-'}</span>
            <span>Sale: PKR {Number(product.price || 0).toLocaleString()}
              <small style={{ display: 'block' }}>Cost: {product.purchasePrice == null ? 'Set on first receipt' : `PKR ${product.purchasePrice}`}</small>
            </span>
            <span style={badgeStyle(product.status === 'active')}>{product.status}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button title="Add product with new prices" onClick={() => {
                openEditor(product);
                setEditing(null);
                setForm(current => ({ ...current, price: '', packPrice: '', purchasePrice: '', sourceProductId: product.id }));
              }} style={iconButtonStyle}>
                <Plus size={15} />
              </button>
              <button title="Edit product" onClick={() => openEditor(product)} style={iconButtonStyle}>
                <Edit3 size={15} />
              </button>
              <button title={product.status === 'active' ? 'Deactivate product' : 'Activate product'} onClick={() => toggle(product)} style={iconButtonStyle}>
                <Power size={15} />
              </button>
              <button title="Delete product" onClick={() => remove(product)}
                style={{ ...iconButtonStyle, color: '#dc2626', opacity: 1 }}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
    {isOpen && (
      <div style={overlayStyle}>
        <form onSubmit={submit} style={formStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, color: 'var(--navy)' }}>
              {editing ? 'Edit Product' : 'Add Product'}
            </h2>
            <button type="button" onClick={() => setIsOpen(false)} style={closeStyle}>×</button>
          </div>
          
          {/* Stock Info Message */}
          <div style={{ margin: '1rem 0', padding: '0.85rem 1rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <Package size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.82rem', color: '#1e40af', lineHeight: 1.5 }}>
              <strong>Note:</strong> Stock quantity is managed separately in <strong>Inventory → Stock Receive</strong> section. First add the product here, then add stock batches from inventory.
            </div>
          </div>

          <div style={formGrid}>
            <Field label="Product title" value={form.title} onChange={set('title')} readOnly={Boolean(editing)} required />
            <Field label="Salt / composition" value={form.salt} onChange={set('salt')} />
            <AutocompleteField 
              label="Category" 
              value={categorySearch}
              onChange={(e) => {
                setCategorySearch(e.target.value);
                setForm(prev => ({ ...prev, category: '' })); // Clear selection when typing
              }}
              onFocus={() => setShowCategoryDropdown(true)}
              options={filteredCategories.map(c => ({ id: c, name: c }))}
              onSelect={selectCategory}
              show={showCategoryDropdown}
              onClose={() => setShowCategoryDropdown(false)}
              required
            />
            <AutocompleteField 
              label="Brand" 
              value={brandSearch} 
              onChange={(e) => {
                setBrandSearch(e.target.value);
                setForm(prev => ({ ...prev, brandId: '' }));
                setShowBrandDropdown(true);
              }}
              options={filteredBrands} 
              onSelect={selectBrand} 
              show={showBrandDropdown} 
              onClose={() => setShowBrandDropdown(false)} 
              required 
            />
            <AutocompleteField 
              label="Supplier" 
              value={supplierSearch} 
              onChange={(e) => {
                setSupplierSearch(e.target.value);
                setForm(prev => ({ ...prev, supplierId: '' }));
                setShowSupplierDropdown(true);
              }}
              options={filteredSuppliers} 
              onSelect={selectSupplier} 
              show={showSupplierDropdown} 
              onClose={() => setShowSupplierDropdown(false)} 
              required 
            />
            <Field 
              label="Sale Pack Price (PKR)"
              type="number" 
              step="0.01" 
              value={form.packPrice} 
              onChange={set('packPrice')} 
              readOnly={Boolean(editing)}
              placeholder="e.g., 4000"
              required 
            />
            <Field 
              label="Product Pack Size" 
              type="number" 
              min="1"
              value={form.packSize} 
              onChange={set('packSize')} 
              readOnly={Boolean(editing)}
              placeholder="e.g., 10"
              required 
            />
            <Field 
              label="Sale Price (Per Unit)"
              type="number" 
              step="0.01" 
              value={form.price} 
              placeholder="Auto-calculated"
              readOnly
              style={{ ...inputStyle, background: '#f8fafc', cursor: 'not-allowed' }}
            />
            <Field label="Min threshold" type="number" value={form.minThreshold} onChange={set('minThreshold')} required />
            <Field label="Purchase Price (Per Unit)" type="number" min="0.01" step="0.01"
              value={form.purchasePrice} onChange={set('purchasePrice')} readOnly={Boolean(editing)}
              required={!editing} placeholder="e.g., 5" />
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.84rem', color: 'var(--gray-600)' }}>
              Receive each arrival in Inventory with its own name, purchase cost and sale price. Previous arrivals stay unchanged. Customers buy the oldest available stock first; mixed batches use their own prices. Status updates automatically from available stock.
            </p>
            <Field label="Pack description" value={form.packDescription} onChange={set('packDescription')} />
            <Field label="Discount (%)" type="number" value={form.discount} onChange={set('discount')} />
            <SelectField label="Status (automatic from stock)" value={form.status} disabled options={['active', 'inactive']} />
            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--dash-bg)', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--navy)' }}>Requires Prescription</span>
              </div>
              <input type="checkbox" checked={form.requiresRx} onChange={set('requiresRx')} style={{ width: 20, height: 20, cursor: 'pointer' }} />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Description
              <textarea value={form.description} onChange={set('description')} rows={3} style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setIsOpen(false)} style={secondaryButton}>Cancel</button>
            <button type="submit" style={buttonStyle}>Save Product</button>
          </div>
        </form>
      </div>
    )}
  </div>;
}
function Field({ label, style, ...props }) {
  const mergedStyle = style ? { ...inputStyle, ...style } : inputStyle;
  return <label>{label}{props.required && <span style={{color: '#ef4444'}}>*</span>}<input {...props} style={mergedStyle} /></label>;
}
function SelectField({ label, options, labels = {}, required, ...props }) { 
  return <label>
    {label}{required && <span style={{color: '#ef4444'}}>*</span>}
    <select {...props} style={inputStyle} required={required}>
      <option value="">Select {label.toLowerCase()}</option>
      {options.map((option) => <option key={option} value={option}>{labels[option] || option}</option>)}
    </select>
  </label>; 
}

function AutocompleteField({ label, value, onChange, onFocus, options, onSelect, show, onClose, required }) {
  // Only show dropdown if user has typed something
  const shouldShowDropdown = show && value.trim().length > 0;
  
  return (
    <label style={{ position: 'relative' }}>
      {label}{required && <span style={{color: '#ef4444'}}>*</span>}
      <input
        type="text"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        placeholder={`Type to search ${label.toLowerCase()}...`}
        style={inputStyle}
        autoComplete="off"
      />
      {shouldShowDropdown && options.length > 0 && (
        <div style={autocompleteDropdownStyle}>
          {options.map((option) => (
            <div
              key={option.id}
              onClick={() => onSelect(option)}
              style={autocompleteItemStyle}
              className="autocomplete-item"
            >
              {option.name}
            </div>
          ))}
        </div>
      )}
      {shouldShowDropdown && options.length === 0 && (
        <div style={autocompleteDropdownStyle}>
          <div style={{ ...autocompleteItemStyle, color: 'var(--gray-400)', cursor: 'default' }}>
            No {label.toLowerCase()} found
          </div>
        </div>
      )}
    </label>
  );
}
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem', border: '1px solid var(--dash-border)', borderRadius: 8, background: 'white', fontSize: '0.84rem', marginTop: 4 };
const formGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', margin: '1.25rem 0' };
const tableStyle = { background: 'white', border: '1px solid var(--dash-border)', borderRadius: 12, overflow: 'hidden' };
const rowStyle = (header) => ({ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1fr 0.8fr 0.8fr 1.2fr', gap: '0.8rem', alignItems: 'center', padding: '0.9rem 1rem', borderBottom: '1px solid var(--dash-border)', color: header ? 'var(--gray-400)' : 'var(--gray-600)', fontSize: '0.82rem', textTransform: header ? 'uppercase' : 'none', fontWeight: header ? 700 : 400 });
const buttonStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 9, padding: '0.65rem 1rem', background: '#1e3a8a', color: 'white', fontWeight: 700, cursor: 'pointer' };
const secondaryButton = { ...buttonStyle, background: 'white', color: 'var(--navy)', border: '1px solid var(--dash-border)' };
const iconButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid var(--dash-border)', borderRadius: 7, background: 'white', color: 'var(--navy)', cursor: 'pointer' };
const iconStyle = { position: 'absolute', left: 10, top: 11, color: 'var(--gray-400)' };
const badgeStyle = (active) => ({ color: active ? '#047857' : '#b91c1c', background: active ? '#d1fae5' : '#fee2e2', borderRadius: 99, padding: '0.25rem 0.55rem', width: 'fit-content', fontSize: '0.72rem', fontWeight: 700 });
const overlayStyle = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' };
const formStyle = { width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: 14, padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' };
const closeStyle = { border: 0, background: 'transparent', fontSize: '1.8rem', color: 'var(--gray-400)', cursor: 'pointer' };
const autocompleteDropdownStyle = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'white', border: '1px solid var(--dash-border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', zIndex: 1000 };
const autocompleteItemStyle = { padding: '0.65rem 0.75rem', fontSize: '0.84rem', cursor: 'pointer', borderBottom: '1px solid var(--dash-border)', transition: 'background 0.15s' };

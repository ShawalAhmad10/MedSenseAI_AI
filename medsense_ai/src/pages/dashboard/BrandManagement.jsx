import { useEffect, useMemo, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { AlertCircle, CheckCircle, Edit3, Plus, Power, Search, Tags, Trash2, X } from 'lucide-react';
import BrandMasterModal from '../../components/modals/BrandMasterModal';
import {
  createBrand,
  deleteBrand,
  listBrands,
  toggleBrandStatus,
  updateBrand,
} from '../../services/brandService';
import { listProducts } from '../../services/productService';

export default function BrandManagement() {
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }
  const [isLoading, setIsLoading] = useState(false);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const refresh = async (quiet = false) => {
    if (!quiet) setIsLoading(true);
    try {
      const [brandList, productList] = await Promise.all([listBrands(), listProducts()]);
      setBrands(brandList);
      setProducts(productList);
    } catch (error) {
      showMessage('error', 'Failed to load brands: ' + (error.response?.data?.message || error.message));
    } finally {
      if (!quiet) setIsLoading(false);
    }
  };
  
  useEffect(() => { refresh(); }, []);
  useLiveDataRefresh(() => refresh(true));

  const filtered = useMemo(() => brands.filter((brand) => {
    const matchesSearch = brand.name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === 'all' || brand.status === status);
  }), [brands, search, status]);

  const save = async (payload) => {
    try {
      if (editing) {
        await updateBrand(editing.id, payload);
        showMessage('success', `Brand "${payload.name}" updated successfully!`);
      } else {
        await createBrand(payload);
        showMessage('success', `Brand "${payload.name}" created successfully!`);
      }
      setEditing(null);
      await refresh();
    } catch (error) {
      showMessage('error', error.response?.data?.message || error.message);
      throw error; // Re-throw to show error in modal
    }
  };

  const toggle = async (brand) => { 
    try {
      await toggleBrandStatus(brand.id); 
      showMessage('success', `Brand "${brand.name}" status toggled successfully!`);
      await refresh(); 
    } catch (error) {
      showMessage('error', 'Failed to toggle status: ' + (error.response?.data?.message || error.message));
    }
  };
  
  const remove = async (brand) => {
    if (window.confirm(`Delete ${brand.name}?`)) { 
      try {
        await deleteBrand(brand.id); 
        showMessage('success', `Brand "${brand.name}" deleted successfully!`);
        await refresh(); 
      } catch (error) {
        showMessage('error', 'Failed to delete brand: ' + (error.response?.data?.message || error.message));
      }
    }
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '1.5rem' }}>
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
          {message.type === 'success' ? (
            <CheckCircle size={22} color="#10b981" />
          ) : (
            <AlertCircle size={22} color="#ef4444" />
          )}
          <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500, color: 'var(--navy)' }}>
            {message.text}
          </span>
          <button 
            onClick={() => setMessage(null)} 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              padding: 4,
              color: 'var(--gray-400)',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--navy)' }}>Brand Management</h1>
          <p style={{ color: 'var(--gray-400)', margin: '0.35rem 0 0' }}>
            Manage brands from database - {brands.length} total brands
          </p>
        </div>
        <button onClick={() => { setEditing(null); setIsOpen(true); }} style={buttonStyle('#1e3a8a')}>
          <Plus size={16} /> Add Brand
        </button>
      </header>
      <div style={toolbarStyle}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}><Search size={16} style={iconStyle} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search brands" style={inputStyle} /></div>
        <select value={status} onChange={(event) => setStatus(event.target.value)} style={{ ...inputStyle, width: 150 }}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
      </div>
      <div style={tableStyle}>
        <div style={rowStyle(true)}><span>Brand</span><span>Products</span><span>Status</span><span>Created</span><span>Actions</span></div>
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
            <div style={{ fontSize: '0.9rem' }}>Loading brands...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
            <Tags size={28} />
            <p>No brands match this view.</p>
          </div>
        ) : (
          filtered.map((brand) => {
            // Count products for this brand using brandId
            const brandIdNumber = parseInt(brand.id.replace('brand-', ''));
            const productCount = products.filter((product) => product.brandId === brandIdNumber).length;
            return (
              <div key={brand.id} style={rowStyle(false)}>
                <strong>{brand.name}</strong>
                <span>{productCount}</span>
                <span style={badgeStyle(brand.status)}>{brand.status}</span>
                <span>{new Date(brand.createdAt).toLocaleDateString()}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button title="Edit brand" onClick={() => { setEditing(brand); setIsOpen(true); }} style={iconButtonStyle}>
                    <Edit3 size={15} />
                  </button>
                  <button title="Toggle status" onClick={() => toggle(brand)} style={iconButtonStyle}>
                    <Power size={15} />
                  </button>
                  <button title="Delete brand" onClick={() => remove(brand)} style={{ ...iconButtonStyle, color: '#dc2626' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <BrandMasterModal isOpen={isOpen} brand={editing} onClose={() => { setIsOpen(false); setEditing(null); }} onSubmit={save} />
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const inputStyle = { padding: '0.65rem 0.8rem', border: '1px solid var(--dash-border)', borderRadius: 9, background: 'white', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' };
const toolbarStyle = { display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' };
const tableStyle = { background: 'white', border: '1px solid var(--dash-border)', borderRadius: 12, overflow: 'hidden' };
const rowStyle = (header) => ({ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1fr 1fr 1.2fr', gap: '1rem', alignItems: 'center', padding: '0.9rem 1rem', borderBottom: '1px solid var(--dash-border)', color: header ? 'var(--gray-400)' : 'var(--gray-600)', fontSize: '0.82rem', textTransform: header ? 'uppercase' : 'none', fontWeight: header ? 700 : 400 });
const buttonStyle = (background) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 9, padding: '0.65rem 1rem', background, color: 'white', fontWeight: 700, cursor: 'pointer' });
const iconButtonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid var(--dash-border)', borderRadius: 7, background: 'white', color: 'var(--navy)', cursor: 'pointer' };
const iconStyle = { position: 'absolute', left: 10, top: 11, color: 'var(--gray-400)' };
const badgeStyle = (value) => ({ color: value === 'active' ? '#047857' : '#b91c1c', background: value === 'active' ? '#d1fae5' : '#fee2e2', borderRadius: 99, padding: '0.25rem 0.55rem', width: 'fit-content', fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize' });

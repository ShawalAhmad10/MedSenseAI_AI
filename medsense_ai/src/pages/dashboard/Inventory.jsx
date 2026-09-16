import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Edit2,
  Eye,
  FileDown,
  Loader2,
  Package,
  PackagePlus,
  PackageX,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Tags,
  ToggleLeft,
  Trash2,
  TrendingUp,
  Truck,
} from 'lucide-react';
import DeleteMedicineModal from '../../components/modals/DeleteMedicineModal';
import BulkImportModal from '../../components/modals/BulkImportModal';
import StockIntakeModal from '../../components/modals/StockIntakeModal';
import StockOpeningModal from '../../components/modals/StockOpeningModal';
import StockReturnModal from '../../components/modals/StockReturnModal';
import StockDetailModal from '../../components/modals/StockDetailModal';
import BrandMasterModal from '../../components/modals/BrandMasterModal';
import SupplierMasterModal from '../../components/modals/SupplierMasterModal';
import api from '../../services/api';
import {
  createStockEntry,
  createStockOpening,
  createStockReturn,
  getStockCatalog,
  listStockBatches,
  listStockOpenings,
  listStockReturns,
} from '../../services/pharmacistStockService';
import {
  listBrands,
  createBrand,
  updateBrand,
  toggleBrandStatus,
} from '../../services/brandService';
import {
  listSuppliers,
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
} from '../../services/supplierService';
import {
  listProducts,
  deleteProduct,
  toggleProductStatus,
  bulkUpdateProductStock,
} from '../../services/productService';

const AUTH_KEY = 'medsense_auth_user';

function getStoredUser() {
  try {
    const sessionValue = sessionStorage.getItem(AUTH_KEY);
    if (sessionValue) {
      const parsed = JSON.parse(sessionValue);
      if (parsed?.token) return parsed;
    }
    const localValue = localStorage.getItem(AUTH_KEY);
    if (localValue) {
      const parsed = JSON.parse(localValue);
      if (parsed?.token) return parsed;
    }
  } catch {}
  return null;
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--dash-border)', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--navy)' }}>{value}</div>
        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{label}</div>
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, color, onClick, title }) {
  return (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      title={title}
      style={{
        background: `${color}10`,
        border: `1px solid ${color}25`,
        color,
        width: 30,
        height: 30,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <Icon size={14} />
    </motion.button>
  );
}

function ViewBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '0.48rem 0.8rem',
        borderRadius: 999,
        border: '1px solid var(--dash-border)',
        background: 'white',
        color: 'var(--navy)',
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      <Eye size={14} />
      View
    </button>
  );
}

function StatusBadge({ value }) {
  const active = value === 'active' || value === true;
  return (
    <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', color: active ? '#059669' : '#dc2626', textTransform: 'capitalize' }}>
      {typeof value === 'boolean' ? (value ? 'active' : 'disabled') : value}
    </span>
  );
}

export default function Inventory() {
  const user = getStoredUser();
  const currentUserName = user?.fullName || user?.full_name || user?.name || 'Pharmacist';
  
  // State for products (medicine inventory)
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState(null); // Supplier filter for products

  const [surface, setSurface] = useState('inventory');
  const [activeTab, setActiveTab] = useState('all');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [brands, setBrands] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [catalog, setCatalog] = useState({ branches: [], suppliers: [], products: [] });
  const [stockBatches,    setStockBatches]    = useState([]);
  const [stockOpenings,   setStockOpenings]   = useState([]);
  const [stockReturns,    setStockReturns]    = useState([]);
  const [stockReport,       setStockReport]       = useState([]);
  const [stockReturnReport, setStockReturnReport] = useState([]);
  const [reportLoading,     setReportLoading]     = useState(true);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  const [isStockIntakeOpen, setIsStockIntakeOpen] = useState(false);
  const [isStockOpeningOpen, setIsStockOpeningOpen] = useState(false);
  const [isStockReturnOpen, setIsStockReturnOpen] = useState(false);
  const [selectedStockDetail, setSelectedStockDetail] = useState(null);

  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState(null);

  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  // Reports state removed (Profit/Loss moved to Invoices page)

  const refreshPhaseThreeData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [productList, brandList, supplierList] = await Promise.all([
        listProducts(),
        listBrands(),
        listSuppliers(),
      ]);
      setProducts(productList);
      setBrands(brandList);
      setSuppliers(supplierList);
      return { supplierList, productList };
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStockWorkspace = useCallback(async () => {
    setIsStockLoading(true);
    try {
      const phaseData = await refreshPhaseThreeData();
      const { supplierList = [], productList = [] } = phaseData || {};
      const [batches, openings, returns] = await Promise.all([
        listStockBatches(),
        listStockOpenings(),
        listStockReturns(),
      ]);
      try {
        const catalogData = await getStockCatalog({ inventoryItems: productList || [], suppliers: supplierList || [] });
        setCatalog(catalogData);
      } catch (catErr) {
        console.error('Catalog fetch error:', catErr.message);
      }
      setStockBatches(batches);
      setStockOpenings(openings);
      setStockReturns(returns);
    } catch (err) {
      console.error('Error loading stock data:', err);
    } finally {
      setIsStockLoading(false);
    }

    // Fetch stock report + return report — INDEPENDENT (always runs)
    setReportLoading(true);
    try {
      const [stockRep, returnRep] = await Promise.all([
        api.get('/stock/reports/stock-report?limit=300'),
        api.get('/stock/reports/return-report?limit=300')
      ]);
      setStockReport(stockRep.data?.data || []);
      setStockReturnReport(returnRep.data?.data || []);
    } catch (repErr) {
      console.error('Report fetch error:', repErr.message);
    } finally {
      setReportLoading(false);
    }
  }, [refreshPhaseThreeData]);

  // refreshReports removed — Profit/Loss report is on Invoices page

  useEffect(() => {
    refreshStockWorkspace();
  }, [refreshStockWorkspace]);



  useEffect(() => {
    if (surface !== 'inventory') {
      setActiveTab('all');
      setStatusFilter('');
    }
  }, [surface]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setStatusFilter(tabId === 'all' ? '' : tabId);
  };

  const handleDeleteProduct = async (id) => {
    try {
      await deleteProduct(id);
      setIsDeleteModalOpen(false);
      setSelectedProduct(null);
      await refreshStockWorkspace();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Product', 'Salt', 'Category', 'Brand', 'Supplier', 'Unit Price', 'Pack Price', 'Pack Size', 'Stock', 'Expired Stock', 'Min', 'Expiry'];
    const rows = filteredProducts.map((product) => [
      product.title,
      product.salt || '-',
      product.category,
      product.brandName || '-',
      product.supplierName || '-',
      Number(product.price || 0).toFixed(2),
      Number(product.packPrice || 0).toFixed(2),
      product.packSize || '-',
      product.stockQty || 0,
      product.expiredStock || 0,
      product.minThreshold || 0,
      product.expiryDate || '-',
    ]);
    const csv = `data:text/csv;charset=utf-8,${[headers, ...rows].map((row) => row.join(',')).join('\n')}`;
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCreateStockEntry = async (payload) => {
    try {
      // Create stock batch directly (NO purchase bill needed)
      await createStockEntry(payload);
      console.log('✅ Stock batch created and product quantities updated');
      
      // Refresh the workspace data
      await refreshStockWorkspace();
    } catch (error) {
      console.error('Error in stock batch creation:', error);
      throw error;
    }
  };

  const handleCreateStockOpening = async (payload) => {
    await createStockOpening(payload);
    await refreshStockWorkspace();
  };

  const handleCreateStockReturn = async (payload) => {
    await createStockReturn(payload);
    await refreshStockWorkspace();
  };

  const handleSaveBrand = async (payload) => {
    if (selectedBrand) {
      await updateBrand(selectedBrand.id, payload);
    } else {
      await createBrand(payload);
    }
    setSelectedBrand(null);
    await refreshStockWorkspace();
  };

  const handleSaveSupplier = async (payload) => {
    if (selectedSupplier) {
      await updateSupplier(selectedSupplier.id, payload);
    } else {
      await createSupplier(payload);
    }
    setSelectedSupplier(null);
    await refreshStockWorkspace();
  };

  const stockColor = (qty, min) => {
    if (qty === 0) return '#dc2626';
    if (qty <= min) return '#ef4444';
    if (qty <= min * 1.5) return '#f59e0b';
    return '#16a34a';
  };

  // Filter products based on search and status
  const filteredProducts = useMemo(() => {
    let filtered = products.filter((product) => {
      const matchesSearch = search.trim() === '' || 
        [product.title, product.salt, product.category, product.brandName, product.supplierName]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase());
      
      if (!matchesSearch) return false;

      // Apply supplier filter (from Supplier tab click)
      if (selectedSupplierFilter) {
        // Extract numeric ID from supplier.id format "sup-5" -> 5
        const filterSupplierId = selectedSupplierFilter.id.includes('sup-') 
          ? Number(selectedSupplierFilter.id.replace('sup-', ''))
          : Number(selectedSupplierFilter.id);
        
        // product.supplierId is already a number
        if (product.supplierId !== filterSupplierId) {
          return false;
        }
      }

      // Apply status filter
      if (statusFilter === 'low_stock') {
        return product.stockQty > 0 && product.stockQty <= product.minThreshold;
      } else if (statusFilter === 'out_of_stock') {
        return product.stockQty === 0;
      } else if (statusFilter === 'expiring') {
        if (!product.expiryDate) return false;
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
        return new Date(product.expiryDate) <= threeMonthsFromNow;
      }
      
      return true;
    });

    return filtered;
  }, [products, search, statusFilter, selectedSupplierFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = products.length;
    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;
    let expiredStock = 0;
    let productsWithExpired = 0;

    products.forEach((product) => {
      const qty = product.stockQty || 0;
      const min = product.minThreshold || 10;
      const price = parseFloat(product.price || 0);
      const expired = product.expiredStock || 0;

      if (qty === 0) {
        outOfStock++;
      } else if (qty <= min) {
        lowStock++;
      }

      totalValue += qty * price;
      
      // Track expired stock
      if (expired > 0) {
        expiredStock += expired;
        productsWithExpired++;
      }
    });

    return {
      totalProducts,
      lowStock,
      outOfStock,
      totalValue,
      expiredStock,
      productsWithExpired
    };
  }, [products]);

  const filteredStockBatches = useMemo(() => {
    return stockBatches.filter((batch) => {
      if (stockSearch.trim()) {
        const query = stockSearch.toLowerCase();
        return [batch.stockNumber, batch.supplierName, batch.billNo, batch.builtyNo].join(' ').toLowerCase().includes(query);
      }
      return true;
    });
  }, [stockBatches, stockSearch]);

  const filteredOpenings = useMemo(() => {
    return stockOpenings.filter((entry) => {
      if (stockSearch.trim()) {
        const query = stockSearch.toLowerCase();
        return [entry.stockNumber, entry.batchNumber, entry.productName, entry.user, entry.adjustmentType].join(' ').toLowerCase().includes(query);
      }
      return true;
    });
  }, [stockOpenings, stockSearch]);

  const filteredReturns = useMemo(() => {
    return stockReturns.filter((entry) => {
      if (stockSearch.trim()) {
        const query = stockSearch.toLowerCase();
        return [entry.returnNumber, entry.stockNumber, entry.supplierName, entry.returnType].join(' ').toLowerCase().includes(query);
      }
      return true;
    });
  }, [stockReturns, stockSearch]);

  const filteredBrands = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();
    return brands.filter((brand) => !query || brand.name.toLowerCase().includes(query));
  }, [brands, stockSearch]);

  const filteredSuppliers = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      if (!query) return true;
      return [supplier.name, supplier.city, supplier.contact].join(' ').toLowerCase().includes(query);
    });
  }, [stockSearch, suppliers]);

  const statCards = useMemo(() => {
    if (surface === 'procurement') {
      const value = filteredStockBatches.reduce((sum, batch) => sum + Number(batch.stockPrice || 0), 0);
      return [
        { label: 'Stock Batches', value: filteredStockBatches.length, icon: PackagePlus, color: '#2563eb' },
        { label: 'Procurement Value', value: `PKR ${value.toLocaleString()}`, icon: TrendingUp, color: '#16a34a' },
        { label: 'Distinct Suppliers', value: new Set(filteredStockBatches.map((batch) => batch.supplierId)).size, icon: Truck, color: '#7c3aed' },
        { label: 'Near Expiry Lines', value: filteredStockBatches.reduce((sum, batch) => sum + (batch.items?.filter((item) => item.productExpiry && new Date(item.productExpiry) < new Date('2027-01-01')).length || 0), 0), icon: AlertTriangle, color: '#d97706' },
      ];
    }
    if (surface === 'opening') {
      const value = filteredOpenings.reduce((sum, entry) => sum + Number(entry.totalPrice || 0), 0);
      return [
        { label: 'Opening Entries', value: filteredOpenings.length, icon: ClipboardList, color: '#d97706' },
        { label: 'Adjusted Entries', value: filteredOpenings.filter((entry) => entry.adjustmentType === 'adjusted').length, icon: Edit2, color: '#7c3aed' },
        { label: 'Opening Value', value: `PKR ${value.toLocaleString()}`, icon: TrendingUp, color: '#16a34a' },
        { label: 'Users Logging Stock', value: new Set(filteredOpenings.map((entry) => entry.user)).size, icon: Building2, color: '#2563eb' },
      ];
    }
    if (surface === 'returns') {
      const value = filteredReturns.reduce((sum, entry) => sum + Number(entry.returnTotal || 0), 0);
      return [
        { label: 'Stock Returns', value: filteredReturns.length, icon: RotateCcw, color: '#d97706' },
        { label: 'Return Value', value: `PKR ${value.toLocaleString()}`, icon: TrendingUp, color: '#dc2626' },
        { label: 'Normal Returns', value: filteredReturns.filter((entry) => entry.returnType === 'normal').length, icon: PackageX, color: '#2563eb' },
        { label: 'Open Returns', value: filteredReturns.filter((entry) => entry.returnType === 'open').length, icon: ClipboardList, color: '#7c3aed' },
      ];
    }
    if (surface === 'stockReport') {
      const purchases = stockReport.filter(r => r.transactionType === 'PURCHASE');
      const sales     = stockReport.filter(r => r.transactionType === 'SALE');
      const returns_  = stockReport.filter(r => r.transactionType === 'RETURN');
      return [
        { label: 'Total Transactions', value: stockReport.length,  icon: ClipboardList, color: '#1d4ed8' },
        { label: 'Purchases (IN)',      value: purchases.length,    icon: PackagePlus,   color: '#059669' },
        { label: 'Sales (OUT)',         value: sales.length,        icon: TrendingUp,    color: '#d97706' },
        { label: 'Returns',             value: returns_.length,     icon: RotateCcw,     color: '#dc2626' },
      ];
    }
    if (surface === 'returnReport') {
      const totalQty   = stockReturnReport.reduce((s, r) => s + Number(r.productQuantity || 0), 0);
      const totalValue = stockReturnReport.reduce((s, r) => s + Number(r.totalPrice     || 0), 0);
      return [
        { label: 'Return Items',  value: stockReturnReport.length,               icon: RotateCcw,  color: '#d97706' },
        { label: 'Total Qty',     value: totalQty,                               icon: Package,    color: '#7c3aed' },
        { label: 'Total Value',   value: `PKR ${totalValue.toLocaleString()}`,   icon: TrendingUp, color: '#dc2626' },
        { label: 'Suppliers',     value: new Set(stockReturnReport.map(r => r.supplierName)).size, icon: Truck, color: '#2563eb' },
      ];
    }
    if (surface === 'brands') {
      return [
        { label: 'Brands', value: filteredBrands.length, icon: Tags, color: '#2563eb' },
        { label: 'Active', value: filteredBrands.filter((brand) => brand.status === 'active').length, icon: ToggleLeft, color: '#16a34a' },
        { label: 'Disabled', value: filteredBrands.filter((brand) => brand.status === 'disabled').length, icon: PackageX, color: '#dc2626' },
        { label: 'Linked Products', value: products.filter((p) => p.brandId).length, icon: Package, color: '#7c3aed' },
      ];
    }
    if (surface === 'suppliers') {
      return [
        { label: 'Suppliers', value: filteredSuppliers.length, icon: Truck, color: '#2563eb' },
        { label: 'Active', value: filteredSuppliers.filter((supplier) => supplier.status === 'active').length, icon: ToggleLeft, color: '#16a34a' },
        { label: 'Cities Covered', value: new Set(filteredSuppliers.map((supplier) => supplier.city)).size, icon: Building2, color: '#7c3aed' },
        { label: 'Procurement Linked', value: new Set(filteredStockBatches.map((batch) => batch.supplierId)).size, icon: PackagePlus, color: '#d97706' },
      ];
    }
    return [
      { label: 'Total Products', value: stats?.totalProducts ?? 0, icon: Package, color: '#2563eb' },
      { label: 'Low Stock', value: stats?.lowStock ?? 0, icon: AlertTriangle, color: '#f59e0b' },
      { label: 'Out of Stock', value: stats?.outOfStock ?? 0, icon: PackageX, color: '#dc2626' },
      { label: 'Expired Stock', value: stats?.expiredStock ?? 0, icon: ShieldAlert, color: '#dc2626' },
      { label: 'Total Value', value: `PKR ${(stats?.totalValue ?? 0).toLocaleString()}`, icon: TrendingUp, color: '#16a34a' },
    ];
  }, [filteredBrands, filteredOpenings, filteredReturns, filteredStockBatches, filteredSuppliers, products, stats, surface, stockReport, stockReturnReport]);

  const surfaceButtons = [
    { id: 'inventory',    label: 'Products' },
    { id: 'brands',       label: 'Brands' },
    { id: 'suppliers',    label: 'Suppliers' },
    { id: 'procurement',  label: 'Stock Batches' },
    { id: 'opening',      label: 'Opening / Adjusted Stock' },
    { id: 'stockReport',  label: 'Stock Report' },
    { id: 'returns',      label: 'Stock Returns' },
    { id: 'returnReport', label: 'Stock Return Report' },
  ];

  const tabs = [
    { id: 'all', label: 'All Items' },
    { id: 'low_stock', label: 'Low Stock' },
    { id: 'expiring', label: 'Expiring Soon' },
    { id: 'out_of_stock', label: 'Out of Stock' },
  ];

  const noBranch = false; // Single pharmacy - no branch warning needed
  const subtitle =
    surface === 'inventory'
      ? selectedSupplierFilter
        ? `${filteredProducts.length} products from ${selectedSupplierFilter.name} | ${stats.lowStock ?? 0} low stock | ${stats.outOfStock ?? 0} out of stock`
        : `${filteredProducts.length} products total | ${stats.lowStock ?? 0} low stock | ${stats.outOfStock ?? 0} out of stock`
      : surface === 'brands'
      ? `${filteredBrands.length} brand master records feeding the product form`
      : surface === 'suppliers'
      ? `${filteredSuppliers.length} supplier master records linked to products and stock intake`
      : surface === 'procurement'
      ? `${filteredStockBatches.length} received stock batches with full batch-level reporting`
      : surface === 'opening'
      ? `${filteredOpenings.length} explicit opening or adjusted stock entries`
      : surface === 'stockReport'
      ? `${stockReport.length} stock transactions (PURCHASE / SALE / RETURN)`
      : surface === 'returnReport'
      ? `${stockReturnReport.length} stock return line items`
      : `${filteredReturns.length} supplier return records linked to stock batches`;

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--navy)' }}>Inventory</h1>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
          {surface === 'inventory' && (
            <>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setIsImportModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, border: '1px solid var(--dash-border)', background: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={15} /> Import CSV
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, border: '1px solid var(--dash-border)', background: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                <FileDown size={15} /> Export
              </motion.button>
            </>
          )}
          {surface === 'brands' && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => { setSelectedBrand(null); setIsBrandModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, background: '#1e3a8a', color: 'white', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={15} /> Add Brand
            </motion.button>
          )}
          {surface === 'suppliers' && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => { setSelectedSupplier(null); setIsSupplierModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, background: '#1e3a8a', color: 'white', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={15} /> Add Supplier
            </motion.button>
          )}
          {surface === 'procurement' && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setIsStockIntakeOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, background: '#1e3a8a', color: 'white', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <PackagePlus size={15} /> Receive Stock
            </motion.button>
          )}
          {surface === 'opening' && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setIsStockOpeningOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, background: '#d97706', color: 'white', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <ClipboardList size={15} /> Add Opening Entry
            </motion.button>
          )}
          {surface === 'returns' && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={() => setIsStockReturnOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0.5rem 1.1rem', borderRadius: 9, background: '#d97706', color: 'white', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              <RotateCcw size={15} /> Return Stock
            </motion.button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {surfaceButtons.map((button) => (
          <button key={button.id} onClick={() => setSurface(button.id)} style={{ padding: '0.56rem 1rem', borderRadius: 999, border: '1px solid var(--dash-border)', background: surface === button.id ? 'var(--navy)' : 'white', color: surface === button.id ? 'white' : 'var(--gray-600)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
            {button.label}
          </button>
        ))}
      </div>

      {noBranch && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} color="#d97706" />
          <span style={{ fontSize: '0.82rem', color: '#92400e', fontWeight: 500 }}>Select a branch above so stock and supplier entries save under the correct pharmacy branch.</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {statCards.map((card) => <StatCard key={card.label} {...card} />)}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {surface === 'inventory' ? (
          <div style={{ display: 'flex', gap: '0.25rem', background: 'white', border: '1px solid var(--dash-border)', borderRadius: 10, padding: 3 }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)} style={{ padding: '0.4rem 0.875rem', borderRadius: 7, border: 'none', background: activeTab === tab.id ? '#1e3a8a' : 'transparent', color: activeTab === tab.id ? 'white' : '#64748b', fontWeight: activeTab === tab.id ? 600 : 400, fontSize: '0.8rem', cursor: 'pointer' }}>
                {tab.label}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>
            {surface === 'brands'
              ? 'Brand master powers the medicine form brand dropdown.'
              : surface === 'suppliers'
              ? 'Supplier master feeds stock intake and product linking.'
              : surface === 'procurement'
              ? 'Batch view lists received procurement history with stock report fields.'
              : surface === 'opening'
              ? 'Opening screen exposes stock history open or adjusted entries explicitly.'
              : 'Returns screen tracks stock sent back to suppliers.'}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={surface === 'inventory' ? search : stockSearch}
              onChange={(event) => (surface === 'inventory' ? setSearch(event.target.value) : setStockSearch(event.target.value))}
              placeholder={surface === 'inventory' ? 'Search products...' : 'Search records...'}
              style={{ paddingLeft: 30, paddingRight: 12, height: 36, borderRadius: 9, border: '1px solid var(--dash-border)', fontSize: '0.82rem', outline: 'none', width: 240 }}
            />
          </div>
          <button onClick={surface === 'inventory' ? refreshPhaseThreeData : refreshStockWorkspace} style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid var(--dash-border)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {(surface === 'inventory' ? isLoading : isStockLoading)
              ? <Loader2 size={15} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={15} color="#374151" />}
          </button>
        </div>
      </div>

      {error && surface === 'inventory' && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '0.75rem 1rem', color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid var(--dash-border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          {surface === 'inventory' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Brand</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Unit Price</th>
                  <th style={thStyle}>Pack Price</th>
                  <th style={thStyle}>Pack Size</th>
                  <th style={thStyle}>Stock</th>
                  <th style={thStyle}>Expiry</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                      <div>Loading products...</div>
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Package size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>No products found</div>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{product.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)' }}>{product.salt || '-'}</div>
                      </td>
                      <td style={tdStyle}>{product.category}</td>
                      <td style={tdStyle}>{product.brandName || '-'}</td>
                      <td style={tdStyle}>{product.supplierName || '-'}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#059669' }}>PKR {Number(product.price || 0).toFixed(2)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>per unit</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#2563eb' }}>
                          PKR {Number(product.packPrice || 0).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>pack total</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--navy)' }}>
                          {product.packSize || '-'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)' }}>units</div>
                      </td>
                      <td style={tdStyle}>
                        <div>
                          <span style={{ color: stockColor(product.stockQty, product.minThreshold), fontWeight: 700 }}>
                            {product.stockQty || 0}
                          </span>
                          {product.expiredStock > 0 && (
                            <div style={{ 
                              marginTop: '0.25rem',
                              fontSize: '0.7rem', 
                              color: '#dc2626',
                              background: '#fee2e2',
                              padding: '0.15rem 0.4rem',
                              borderRadius: 4,
                              display: 'inline-block',
                              fontWeight: 600
                            }}>
                              ⚠️ {product.expiredStock} expired
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={tdStyle}>{product.expiryDate && product.expiryDate !== '' ? new Date(product.expiryDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') : '-'}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <ActionBtn icon={ToggleLeft} color="#f59e0b" onClick={() => toggleProductStatus(product.id).then(refreshPhaseThreeData)} title="Toggle Status" />
                          <ActionBtn icon={Trash2} color="#dc2626" onClick={() => { setSelectedProduct(product); setIsDeleteModalOpen(true); }} title="Delete" />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {surface === 'brands' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={thStyle}>Brand Name</th>
                  <th style={thStyle}>Products</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isStockLoading ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                      <div>Loading brands...</div>
                    </td>
                  </tr>
                ) : filteredBrands.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Tags size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>No brands found</div>
                    </td>
                  </tr>
                ) : (
                  filteredBrands.map((brand) => {
                    // Extract numeric ID from brand.id format "brand-5" -> 5
                    const brandIdNumber = parseInt(brand.id.replace('brand-', ''));
                    const productCount = products.filter(p => p.brandId === brandIdNumber).length;
                    return (
                      <tr key={brand.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{brand.name}</div>
                        </td>
                        <td style={tdStyle}>{productCount} products</td>
                        <td style={tdStyle}>
                          <StatusBadge value={brand.status} />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <ActionBtn icon={Edit2} color="#2563eb" onClick={() => { setSelectedBrand(brand); setIsBrandModalOpen(true); }} title="Edit Brand" />
                            <ActionBtn icon={ToggleLeft} color="#f59e0b" onClick={() => toggleBrandStatus(brand.id).then(refreshStockWorkspace)} title="Toggle Status" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          {surface === 'suppliers' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={thStyle}>Supplier Name</th>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>City</th>
                  <th style={thStyle}>Products</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isStockLoading ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                      <div>Loading suppliers...</div>
                    </td>
                  </tr>
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Truck size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>No suppliers found</div>
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((supplier) => {
                    // Extract numeric ID from supplier.id format "sup-5" -> 5
                    const supplierIdNumber = parseInt(supplier.id.replace('sup-', ''));
                    const productCount = products.filter(p => p.supplierId === supplierIdNumber).length;
                    return (
                      <tr key={supplier.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{supplier.name}</div>
                        </td>
                        <td style={tdStyle}>{supplier.contact || '-'}</td>
                        <td style={tdStyle}>{supplier.city || '-'}</td>
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 600, color: productCount > 0 ? '#2563eb' : 'var(--gray-400)' }}>
                            {productCount} products
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge value={supplier.status} />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {productCount > 0 && (
                              <ViewBtn onClick={() => { 
                                setSelectedSupplierFilter(supplier); 
                                setSurface('inventory'); 
                              }} />
                            )}
                            <ActionBtn icon={Edit2} color="#2563eb" onClick={() => { setSelectedSupplier(supplier); setIsSupplierModalOpen(true); }} title="Edit Supplier" />
                            <ActionBtn icon={ToggleLeft} color="#f59e0b" onClick={() => toggleSupplierStatus(supplier.id).then(refreshStockWorkspace)} title="Toggle Status" />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          {surface === 'procurement' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={thStyle}>Stock #</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Bill No</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Products & Quantities</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Paid</th>
                  <th style={thStyle}>Due</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isStockLoading ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                      <div>Loading stock batches...</div>
                    </td>
                  </tr>
                ) : filteredStockBatches.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <PackagePlus size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>No stock batches found</div>
                    </td>
                  </tr>
                ) : (
                  filteredStockBatches.map((batch) => (
                    <tr key={batch.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{batch.stockNumber}</div>
                      </td>
                      <td style={tdStyle}>{batch.supplierName}</td>
                      <td style={tdStyle}>
                        <span style={{ 
                          fontWeight: 600, 
                          color: batch.billNo ? '#2563eb' : 'var(--gray-400)',
                          background: batch.billNo ? '#eff6ff' : 'transparent',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: '0.78rem'
                        }}>
                          {batch.billNo || 'No Bill'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {batch.creationDate 
                          ? new Date(batch.creationDate).toLocaleDateString() 
                          : batch.createdAt 
                            ? new Date(batch.createdAt).toLocaleDateString()
                            : '-'}
                      </td>
                      <td style={tdStyle}>
                        {batch.items && batch.items.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {batch.items.map((item, idx) => (
                              <div key={idx} style={{ 
                                fontSize: '0.78rem', 
                                padding: '0.3rem 0.5rem', 
                                background: '#f8fafc', 
                                borderRadius: 6,
                                border: '1px solid #e2e8f0'
                              }}>
                                <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: '0.15rem' }}>
                                  {item.name || item.productName || item.productTitle || 'Unknown Product'}
                                </div>
                                <div style={{ color: '#64748b', display: 'flex', gap: '0.5rem', fontSize: '0.72rem' }}>
                                  <span>Qty: <strong style={{ color: '#2563eb' }}>{item.qty || item.quantity || 0}</strong></span>
                                  {(item.bonus > 0) && <span>Bonus: <strong style={{ color: '#059669' }}>+{item.bonus}</strong></span>}
                                  <span>Price: <strong>PKR {Number(item.purchasePrice || item.price || item.productPrice || 0).toFixed(2)}</strong></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--gray-400)', fontSize: '0.78rem' }}>No items</span>
                        )}
                      </td>
                      <td style={tdStyle}>PKR {Number(batch.stockPrice || 0).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.82rem' }}>
                          PKR {Number(batch.paidAmount || 0).toLocaleString()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 700, color: Number(batch.dueAmount ?? batch.stockPrice ?? 0) > 0 ? '#f59e0b' : '#10b981', fontSize: '0.82rem' }}>
                          PKR {Number(batch.dueAmount ?? batch.stockPrice ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {(() => {
                          const due  = Number(batch.dueAmount  ?? batch.stockPrice ?? 0);
                          const paid = Number(batch.paidAmount ?? 0);
                          const isPaid = due <= 0 || paid >= Number(batch.totalAmount ?? batch.stockPrice ?? 0);
                          return (
                            <span style={{
                              padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                              background: !isPaid ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                              color:      !isPaid ? '#dc2626'               : '#059669'
                            }}>
                              {!isPaid ? '🔴 Unpaid' : '✅ Paid'}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={tdStyle}>
                        <ViewBtn onClick={() => setSelectedStockDetail(batch)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          {surface === 'opening' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={thStyle}>Stock #</th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Batch #</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Quantity</th>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {isStockLoading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                      <div>Loading opening stock...</div>
                    </td>
                  </tr>
                ) : filteredOpenings.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <ClipboardList size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>No opening stock entries found</div>
                    </td>
                  </tr>
                ) : (
                  filteredOpenings.map((entry, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={tdStyle}>{entry.id || entry.stockNumber || '-'}</td>
                      <td style={tdStyle}>{entry.productName || '-'}</td>
                      <td style={tdStyle}>{entry.batchNumber || '-'}</td>
                      <td style={tdStyle}>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: 999, 
                          fontSize: '0.7rem', 
                          fontWeight: 600,
                          background: entry.adjustmentType === 'opening' ? '#dbeafe' : '#fef3c7',
                          color: entry.adjustmentType === 'opening' ? '#1e40af' : '#92400e'
                        }}>
                          {entry.adjustmentType || 'opening'}
                        </span>
                      </td>
                      <td style={tdStyle}>{entry.quantity || 0}</td>
                      <td style={tdStyle}>{entry.user || '-'}</td>
                      <td style={tdStyle}>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {surface === 'stockReport' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                <thead>
                  <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                    {['Batch#', 'Product', 'Type', 'Qty Change', 'Balance', 'Price', 'Total', 'Sales Tax', 'Adv.Tax', 'Expiry', 'Reference', 'Date', 'Supplier'].map(h => (
                      <th key={h} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(reportLoading || isStockLoading) ? (
                    <tr><td colSpan={13} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      Loading stock report...
                    </td></tr>
                  ) : stockReport.length === 0 ? (
                    <tr><td colSpan={13} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No stock transactions found</td></tr>
                  ) : stockReport.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--navy)', fontWeight: 600 }}>{r.batchNumber}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--navy)' }}>{r.productTitle}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
                          background: r.transactionType === 'PURCHASE' ? 'rgba(16,185,129,0.12)' : r.transactionType === 'SALE' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                          color: r.transactionType === 'PURCHASE' ? '#059669' : r.transactionType === 'SALE' ? '#d97706' : '#dc2626' }}>
                          {r.transactionType}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.82rem', fontWeight: 700,
                        color: r.quantityChange > 0 ? '#059669' : '#dc2626', textAlign: 'center' }}>
                        {r.quantityChange > 0 ? '+' : ''}{r.quantityChange}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.82rem', color: 'var(--gray-600)', textAlign: 'center' }}>{r.balanceAfter}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.82rem', color: 'var(--gray-600)' }}>{r.productPrice > 0 ? 'PKR ' + Number(r.productPrice).toLocaleString() : '-'}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>{r.totalPrice > 0 ? 'PKR ' + Number(r.totalPrice).toLocaleString() : '-'}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--gray-600)' }}>{r.salesTax > 0 ? 'PKR ' + Number(r.salesTax).toLocaleString() : '-'}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--gray-600)' }}>{r.advanceTax > 0 ? 'PKR ' + Number(r.advanceTax).toLocaleString() : '-'}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-600)' }}>{r.productExpiry || '-'}</td>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#2563eb' }}>{r.referenceNumber || '-'}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                        {r.creationDay ? new Date(r.creationDay).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--gray-600)' }}>{r.supplierName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {surface === 'returnReport' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                    {['Return ID', 'Product', 'Qty', 'Price', 'Total', 'Expiry', 'Type', 'Description', 'Date', 'Supplier', 'Created By'].map(h => (
                      <th key={h} style={{ padding: '0.875rem 0.75rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(reportLoading || isStockLoading) ? (
                    <tr><td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      Loading return report...
                    </td></tr>
                  ) : stockReturnReport.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No return report items found</td></tr>
                  ) : stockReturnReport.map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#d97706', fontWeight: 600 }}>SRET-{r.returnId}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--navy)', fontWeight: 600 }}>{r.productTitle}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.82rem', color: 'var(--gray-600)', textAlign: 'center' }}>{r.productQuantity}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.82rem', color: 'var(--gray-600)' }}>PKR {Number(r.productPrice).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700, color: 'var(--navy)', fontSize: '0.82rem' }}>PKR {Number(r.totalPrice).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-600)' }}>{r.productExpiry || '-'}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
                          background: r.returnType === 'Open Return' ? 'rgba(139,92,246,0.12)' : 'rgba(37,99,235,0.12)',
                          color: r.returnType === 'Open Return' ? '#7c3aed' : '#2563eb' }}>
                          {r.returnType}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--gray-600)' }}>{r.description || '-'}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                        {r.creationDay ? new Date(r.creationDay).toLocaleDateString('en-GB') : '-'}
                      </td>
                      <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--gray-600)' }}>{r.supplierName}</td>
                      <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: 'var(--gray-600)' }}>{r.createdBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {surface === 'returns' && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--dash-bg)', borderBottom: '1px solid var(--dash-border)' }}>
                  <th style={thStyle}>Return #</th>
                  <th style={thStyle}>Stock #</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Items</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Date</th>
                </tr>
              </thead>
              <tbody>
                {isStockLoading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 0.5rem' }} />
                      <div>Loading returns...</div>
                    </td>
                  </tr>
                ) : filteredReturns.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                      <RotateCcw size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                      <div>No stock returns found</div>
                    </td>
                  </tr>
                ) : (
                  filteredReturns.map((entry, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--dash-border)' }}>
                      <td style={tdStyle}>{entry.returnNumber || '-'}</td>
                      <td style={tdStyle}>{entry.stockNumber || '-'}</td>
                      <td style={tdStyle}>{entry.supplierName || '-'}</td>
                      <td style={tdStyle}>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: 999, 
                          fontSize: '0.7rem', 
                          fontWeight: 600,
                          background: entry.returnType === 'normal' ? '#dbeafe' : '#fee2e2',
                          color: entry.returnType === 'normal' ? '#1e40af' : '#991b1b'
                        }}>
                          {entry.returnType || 'normal'}
                        </span>
                      </td>
                      <td style={tdStyle}>{entry.items?.length || 0}</td>
                      <td style={tdStyle}>PKR {Number(entry.returnTotal || 0).toLocaleString()}</td>
                      <td style={tdStyle}>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <DeleteMedicineModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setSelectedProduct(null); }}
        medicine={selectedProduct}
        onDelete={handleDeleteProduct}
      />
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={async (items) => {
          // Bulk import for products would need implementation
          setIsImportModalOpen(false);
          refreshStockWorkspace();
        }}
      />
      <StockIntakeModal
        isOpen={isStockIntakeOpen}
        onClose={() => setIsStockIntakeOpen(false)}
        catalog={catalog}
        currentUserName={currentUserName}
        onSubmit={handleCreateStockEntry}
      />
      <StockOpeningModal
        isOpen={isStockOpeningOpen}
        onClose={() => setIsStockOpeningOpen(false)}
        batches={filteredStockBatches}
        currentUserName={currentUserName}
        onSubmit={handleCreateStockOpening}
      />
      <StockReturnModal
        isOpen={isStockReturnOpen}
        onClose={() => setIsStockReturnOpen(false)}
        batches={filteredStockBatches}
        currentUserName={currentUserName}
        onSubmit={handleCreateStockReturn}
      />
      <StockDetailModal isOpen={!!selectedStockDetail} onClose={() => setSelectedStockDetail(null)} entry={selectedStockDetail} />
      <BrandMasterModal
        isOpen={isBrandModalOpen}
        brand={selectedBrand}
        onClose={() => { setIsBrandModalOpen(false); setSelectedBrand(null); }}
        onSubmit={handleSaveBrand}
      />
      <SupplierMasterModal
        isOpen={isSupplierModalOpen}
        supplier={selectedSupplier}
        onClose={() => { setIsSupplierModalOpen(false); setSelectedSupplier(null); }}
        onSubmit={handleSaveSupplier}
      />
      <style>{`
        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </div>
  );
}

// Table styles
const thStyle = {
  padding: '0.85rem 1rem',
  textAlign: 'left',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: 'var(--gray-400)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const tdStyle = {
  padding: '0.85rem 1rem',
  fontSize: '0.82rem',
  color: 'var(--gray-600)'
};

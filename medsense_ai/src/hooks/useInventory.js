import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';

export function useInventory() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const fetchMedicines = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/inventory');
      const data = response.data?.data?.items || response.data?.data || [];
      setMedicines(data);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, []);

  // Extract unique categories from products
  const categories = useMemo(() => {
    const cats = new Set();
    medicines.forEach((med) => {
      const category = med.product?.category || med.category;
      if (category) cats.add(category);
    });
    return Array.from(cats);
  }, [medicines]);

  // Filter medicines based on search and status
  const filteredMedicines = useMemo(() => {
    let filtered = [...medicines];

    // Apply search filter
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter((med) => {
        const name = (med.product?.product_name || med.product_name || '').toLowerCase();
        const generic = (med.product?.generic_name || med.generic_name || '').toLowerCase();
        const category = (med.product?.category || med.category || '').toLowerCase();
        return name.includes(query) || generic.includes(query) || category.includes(query);
      });
    }

    // Apply status filter
    if (statusFilter === 'low_stock') {
      filtered = filtered.filter((med) => {
        const qty = med.quantity || 0;
        const min = med.min_threshold || 10;
        return qty > 0 && qty <= min;
      });
    } else if (statusFilter === 'out_of_stock') {
      filtered = filtered.filter((med) => (med.quantity || 0) === 0);
    } else if (statusFilter === 'expiring') {
      const threeMonthsFromNow = new Date();
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
      filtered = filtered.filter((med) => {
        if (!med.expiry_date) return false;
        const expiryDate = new Date(med.expiry_date);
        return expiryDate <= threeMonthsFromNow;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortBy) {
        case 'name':
          aVal = (a.product?.product_name || a.product_name || '').toLowerCase();
          bVal = (b.product?.product_name || b.product_name || '').toLowerCase();
          break;
        case 'category':
          aVal = (a.product?.category || a.category || '').toLowerCase();
          bVal = (b.product?.category || b.category || '').toLowerCase();
          break;
        case 'stock':
          aVal = a.quantity || 0;
          bVal = b.quantity || 0;
          break;
        case 'price':
          aVal = parseFloat(a.selling_price || 0);
          bVal = parseFloat(b.selling_price || 0);
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [medicines, search, statusFilter, sortBy, sortDir]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = medicines.length;
    let lowStock = 0;
    let outOfStock = 0;
    let totalValue = 0;

    medicines.forEach((med) => {
      const qty = med.quantity || 0;
      const min = med.min_threshold || 10;
      const price = parseFloat(med.selling_price || 0);

      if (qty === 0) {
        outOfStock++;
      } else if (qty <= min) {
        lowStock++;
      }

      totalValue += qty * price;
    });

    return {
      totalProducts,
      lowStock,
      outOfStock,
      totalValue,
    };
  }, [medicines]);

  // Pagination
  const totalPages = Math.ceil(filteredMedicines.length / itemsPerPage);
  const paginatedMedicines = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    return filteredMedicines.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredMedicines, page, itemsPerPage]);

  // Handlers
  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1); // Reset to first page on search
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const goToPage = (newPage) => {
    setPage(Math.max(1, Math.min(newPage, totalPages)));
  };

  const createMedicine = async (medicineData) => {
    try {
      const response = await api.post('/inventory', medicineData);
      await fetchMedicines(); // Refresh list
      return response.data;
    } catch (err) {
      console.error('Error creating medicine:', err);
      throw err;
    }
  };

  const updateMedicine = async (id, medicineData) => {
    try {
      const response = await api.put(`/inventory/${id}`, medicineData);
      await fetchMedicines(); // Refresh list
      return response.data;
    } catch (err) {
      console.error('Error updating medicine:', err);
      throw err;
    }
  };

  const deleteMedicine = async (id) => {
    try {
      await api.delete(`/inventory/${id}`);
      await fetchMedicines(); // Refresh list
    } catch (err) {
      console.error('Error deleting medicine:', err);
      throw err;
    }
  };

  const bulkImport = async (branchId, items) => {
    try {
      // branchId is ignored for single pharmacy setup
      const response = await api.post('/inventory/bulk', { items });
      await fetchMedicines(); // Refresh list
      return response.data;
    } catch (err) {
      console.error('Error bulk importing:', err);
      throw err;
    }
  };

  return {
    medicines: paginatedMedicines,
    stats,
    categories,
    isLoading: loading,
    error,
    search,
    sortBy,
    sortDir,
    handleSearchChange,
    handleSort,
    setStatusFilter,
    createMedicine,
    updateMedicine,
    deleteMedicine,
    bulkImport,
    refetch: fetchMedicines,
    total: filteredMedicines.length,
    page,
    totalPages,
    goToPage,
  };
}

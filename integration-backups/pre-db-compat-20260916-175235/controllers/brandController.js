const Brand = require('../models/Brand');

// Get all brand
exports.getAllBrands = async (req, res) => {
  try {
    const brand = await Brand.findAll({
      order: [['created_at', 'DESC']]
    });

    // Transform to match frontend format
    const formattedBrands = brand.map(brand => ({
      id: `brand-${brand.brand_id}`,
      name: brand.brand_name,
      status: brand.status === 1 ? 'active' : 'disabled',
      createdAt: brand.created_at,
      updatedAt: brand.updated_at
    }));

    res.json(formattedBrands);
  } catch (error) {
    console.error('Error fetching brand:', error);
    res.status(500).json({ message: 'Error fetching brand', error: error.message });
  }
};

// Create new brand
exports.createBrand = async (req, res) => {
  try {
    const { name, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Brand name is required' });
    }

    // Check if brand already exists
    const existing = await Brand.findOne({
      where: { brand_name: name.trim() }
    });

    if (existing) {
      return res.status(400).json({ message: 'Brand with this name already exists' });
    }

    const brand = await Brand.create({
      brand_name: name.trim(),
      status: status === 'active' ? 1 : 0
    });

    const formattedBrand = {
      id: `brand-${brand.brand_id}`,
      name: brand.brand_name,
      status: brand.status === 1 ? 'active' : 'disabled',
      createdAt: brand.created_at,
      updatedAt: brand.updated_at
    };

    res.status(201).json(formattedBrand);
  } catch (error) {
    console.error('Error creating brand:', error);
    res.status(500).json({ message: 'Error creating brand', error: error.message });
  }
};

// Update brand
exports.updateBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    // Extract numeric ID from format like "brand-123"
    const brandId = id.replace('brand-', '');

    const brand = await Brand.findByPk(brandId);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    // Check if name is being changed and if it already exists
    if (name && name.trim() !== brand.brand_name) {
      const existing = await Brand.findOne({
        where: { brand_name: name.trim() }
      });

      if (existing) {
        return res.status(400).json({ message: 'Brand with this name already exists' });
      }
    }

    await brand.update({
      brand_name: name ? name.trim() : brand.brand_name,
      status: status === 'active' ? 1 : status === 'disabled' ? 0 : brand.status,
      updated_at: new Date()
    });

    const formattedBrand = {
      id: `brand-${brand.brand_id}`,
      name: brand.brand_name,
      status: brand.status === 1 ? 'active' : 'disabled',
      createdAt: brand.created_at,
      updatedAt: brand.updated_at
    };

    res.json(formattedBrand);
  } catch (error) {
    console.error('Error updating brand:', error);
    res.status(500).json({ message: 'Error updating brand', error: error.message });
  }
};

// Delete brand
exports.deleteBrand = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = id.replace('brand-', '');

    const brand = await Brand.findByPk(brandId);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    await brand.destroy();
    res.json({ message: 'Brand deleted successfully' });
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).json({ message: 'Error deleting brand', error: error.message });
  }
};

// Toggle brand status
exports.toggleBrandStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const brandId = id.replace('brand-', '');

    const brand = await Brand.findByPk(brandId);
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    await brand.update({
      status: brand.status === 1 ? 0 : 1,
      updated_at: new Date()
    });

    const formattedBrand = {
      id: `brand-${brand.brand_id}`,
      name: brand.brand_name,
      status: brand.status === 1 ? 'active' : 'disabled',
      createdAt: brand.created_at,
      updatedAt: brand.updated_at
    };

    res.json(formattedBrand);
  } catch (error) {
    console.error('Error toggling brand status:', error);
    res.status(500).json({ message: 'Error toggling brand status', error: error.message });
  }
};

from pathlib import Path
import json

root = Path('C:/Projects/amnaMedcopy-integration')
stage = Path('artifacts/integration/partner')
def write(name, data):
    path = stage / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data, encoding='utf-8')
def read(name):
    return (root / name).read_text(encoding='utf-8-sig')

name = 'backend/src/db/init.js'
write(name, '''// Additive local schema setup. Never uses alter, force, drop or data resets.
const { sequelize } = require('../models');
const { DataTypes } = require('sequelize');
const fs = require('node:fs');
const path = require('node:path');
async function initDatabase() {
  await sequelize.authenticate();
  await sequelize.transaction(async transaction => {
    await sequelize.sync({ force: false, transaction });
    const query = sequelize.getQueryInterface();
    const columns = await query.describeTable('invoices', { transaction });
    for (const name of ['wallet_account_name', 'wallet_account_number', 'wallet_cnic']) {
      if (!columns[name]) await query.addColumn('invoices', name,
        { type: DataTypes.STRING, allowNull: true }, { transaction });
    }
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../../migrations/20260905-integration.sql'), 'utf8'), { transaction });
  });
  console.log('Additive integration schema ready');
}
if (require.main === module) initDatabase().catch(error => {
  console.error('Schema setup failed:', error.message); process.exitCode = 1;
}).finally(() => sequelize.close());
module.exports = { initDatabase };
''')
schema = json.loads(Path('artifacts/integration/schema-before.json').read_text().splitlines()[-1])
view = next(row['definition'] for row in schema['views'] if row['viewname'] == 'product_current_stock')
write('backend/migrations/20260905-integration.sql', '-- Persist the existing storefront stock view. No inventory data is altered.\nCREATE OR REPLACE VIEW product_current_stock AS\n' + view + '\n')

name = 'backend/src/seeders/seed-ddi-demo-products.js'
s = read(name).replace("'Abacavir', 'Metformin', 'Aspirin', 'Aminolevulinic acid',", "'Abacavir', 'Metformin', 'Aspirin', 'Aminolevulinic acid', null,")
s = s.replace("  const Product = require('../models/Product');", "  const Product = require('../models/Product');\n  const Batch = require('../models/Batch');\n  const StockLedger = require('../models/StockLedger');")
s = s.replace('    await transaction.commit();', '''    // One named batch per demo product. Reruns never replenish sold stock.
    let batchesInserted = 0;
    for (const product of DEMO_PRODUCTS) {
      const batch_number = `DEMO-DDI-V1-${product.product_id}`;
      const rows = await Batch.findAll({ where: { batch_number }, transaction, lock: transaction.LOCK.UPDATE });
      if (rows.length > 1 || rows.some(row => row.product_id !== product.product_id || row.initial_quantity !== 100)) {
        throw new Error(`Reserved DEMO batch collision: ${batch_number}`);
      }
      if (rows.length) continue;
      const batch = await Batch.create({ product_id: product.product_id,
        product_title: product.product_title, batch_number, initial_quantity: 100,
        remaining_quantity: 100, product_price: product.product_price,
        sale_price: product.product_price, expiry_date: '2030-12-31', batch_status: 'ACTIVE', status: 1,
      }, { transaction });
      await StockLedger.createEntry({ product_id: product.product_id, batch_id: batch.batch_id,
        transaction_type: 'PURCHASE', quantity_change: 100, balance_after: 100,
        reference_type: 'DEMO', reference_number: batch_number,
        notes: 'DEMO inventory only; no clinical product claims', performed_by: product.created_by,
      }, transaction);
      batchesInserted++;
    }
    await transaction.commit();''')
s = s.replace('return { inserted: missing.length, unchanged:', 'return { batchesInserted, inserted: missing.length, unchanged:')
s = s.replace("    });\n}\n\nmodule.exports", "    }).finally(() => require('../config/database').sequelize.close());\n}\n\nmodule.exports")
write(name, s)

name='medsense_ai/src/context/CartContext.jsx'
s=read(name).replace("import axios from 'axios';", "import api from '../services/api';")
s=s.replace("const INTERACTION_API_URL = 'http://127.0.0.1:5005/api/interactions/check';", "const INTERACTION_API_URL = '/interactions/check';")
s=s.replace('  } catch {\n    return [];', "  } catch (error) {\n    console.error('Cannot read saved cart:', error);\n    return [];")
s=s.replace('  } catch {}', "  } catch (error) { console.error('Cannot remove obsolete cart keys:', error); }")
s=s.replace('const [ddiError, setDdiError] = useState(null);', 'const [ddiError, setDdiError] = useState(null);\n  const [checkedIdentityKey, setCheckedIdentityKey] = useState(null);\n  const [ddiRetry, setDdiRetry] = useState(0);')
s=s.replace('    axios\n', '    api\n').replace('product_ids: cartProductIds,\n      })', 'product_ids: cartProductIds,\n      }, { timeout: 15000 })')
s=s.replace('        setDdiResult(result);', '        setCheckedIdentityKey(cartIdentityKey);\n        setDdiResult(result);')
s=s.replace('        setDdiError(message);\n        setDdiResult(failClosedResult(message));', "        console.error('Cart DDI request failed:', error);\n        setCheckedIdentityKey(cartIdentityKey);\n        setDdiError(message);\n        setDdiResult(failClosedResult(message));")
s=s.replace('items.length]);', 'items.length, ddiRetry]);')
s=s.replace('      !ddiLoading &&', '      checkedIdentityKey === cartIdentityKey &&\n      cartProductIds.length === items.length &&\n      !ddiLoading &&\n      ddiResult?.review_required === false &&')
s=s.replace('      ddiLoading,\n      ddiError,\n      ddiCheckoutAllowed,\n    }),', "      ddiLoading: ddiLoading || (items.length > 0 && checkedIdentityKey !== cartIdentityKey),\n      retryDdi: () => { setCheckedIdentityKey(null); setDdiRetry(value => value + 1); },\n      ddiError,\n      ddiCheckoutAllowed,\n    }),")
s=s.replace('      ddiCheckoutAllowed,\n    ],', '      ddiCheckoutAllowed,\n      checkedIdentityKey,\n      cartIdentityKey,\n    ],')
# Invalid identities must show a completed review-required state rather than an endless spinner.
s=s.replace("setDdiResult(failClosedResult(message, 'REVIEW_REQUIRED'));", "setCheckedIdentityKey(cartIdentityKey);\n      setDdiResult(failClosedResult(message, 'UNRESOLVED_REVIEW_REQUIRED'));")
write(name,s)
for name in ['medsense_ai/src/pages/storefront/CartPage.jsx','medsense_ai/src/pages/storefront/CheckoutPage.jsx','medsense_ai/src/components/storefront/CartDrawer.jsx']:
    s=read(name).replace('No model warning detected ? limitations apply', 'No model warning detected - limitations apply').replace('Interaction check unavailable ? checkout blocked','Interaction check unavailable - checkout blocked')
    if 'CartPage' in name:
        s=s.replace('    ddiCheckoutAllowed,\n  } = useCart();', '    ddiCheckoutAllowed,\n    retryDdi,\n  } = useCart();')
        s=s.replace('<h1>Your Cart</h1>', '<h1>Your Cart</h1>\n              <button className="sf-button-ghost" type="button" onClick={retryDdi} disabled={ddiLoading}>Recheck interactions</button>')
    write(name,s)
name='medsense_ai/src/services/storefrontProductService.js'
s=read(name).replace("import axios from 'axios';", "import api from './api';").replace("const API_URL = 'http://localhost:5005/api/products';", "const API_URL = '/products';").replace('axios.get', 'api.get')
s=s.replace("    warningLevel: product.requiresRx ? 'high' : 'low',", "    warningLevel: 'unknown', // Prescription status is not DDI evidence.")
write(name,s)
name='medsense_ai/src/services/storefrontOrderService.js'
s=read(name).replace("import axios from 'axios';", "import api from './api';").replace("const API_URL = 'http://localhost:5005/api/orders';", "const API_URL = '/orders';").replace('axios.', 'api.')
write(name,s)

name='backend/test/medsenseDdiService.test.js'
s=read(name).replace('DEMO_PRODUCTS.length, 14','DEMO_PRODUCTS.length, 15').replace(')).size, 14', ')).size, 15')
write(name,s)

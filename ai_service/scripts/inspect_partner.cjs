const { sequelize } = require(process.cwd() + '/src/config/database');
(async () => {
  const [tables] = await sequelize.query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  const [columns] = await sequelize.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('product','batches','invoices','invoice_items','stock_ledger','product_current_stock') ORDER BY table_name,ordinal_position");
  const [views] = await sequelize.query("SELECT viewname,definition FROM pg_views WHERE schemaname='public'");
  const [products] = await sequelize.query("SELECT product_id,product_title,product_salt,created_by FROM product WHERE product_id >=900000 ORDER BY product_id");
  console.log(JSON.stringify({tables,columns,views,products}));
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => sequelize.close());

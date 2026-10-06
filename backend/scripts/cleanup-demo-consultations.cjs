require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { sequelize } = require('../src/config/database');
sequelize.options.logging = false;
const directory = path.resolve(__dirname,'../../database/cloud-migration-demo-cleanup-2026-10-02T17-45-46-568Z');
const backup = JSON.parse(fs.readFileSync(path.join(directory,'commerce-before.json')));
const ids = backup.tables.product.filter(row => row.product_category==='DEMO ONLY' || /^DEMO /.test(row.product_title||'')).map(row=>String(row.product_id));
(async()=>{
  const transaction = await sequelize.transaction();
  const q = (sql,replacements={})=>sequelize.query(sql,{ replacements, transaction, type:sequelize.QueryTypes.SELECT });
  try {
    const rows = await q(`SELECT * FROM pharmacist_consultations c WHERE EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(jsonb_path_query_array(c.cart_snapshot::jsonb,'$.**.product_id')) x WHERE x.value IN(:ids))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(jsonb_path_query_array(c.cart_snapshot::jsonb,'$.**.productId')) x WHERE x.value IN(:ids)) FOR UPDATE`,{ids});
    const consultationIds = rows.map(row=>String(row.consultation_id));
    if (rows.length) {
      const notifications = await q(`SELECT * FROM notifications WHERE metadata->>'consultationId' IN(:consultationIds)
        OR metadata->>'consultation_id' IN(:consultationIds) FOR UPDATE`,{consultationIds});
      fs.writeFileSync(path.join(directory,'linked-consultations-before.json'),JSON.stringify({consultations:rows,notifications}));
      await q(`DELETE FROM notifications WHERE metadata->>'consultationId' IN(:consultationIds) OR metadata->>'consultation_id' IN(:consultationIds)`,{consultationIds});
      await q('DELETE FROM pharmacist_consultations WHERE consultation_id::text IN(:consultationIds)',{consultationIds});
    }
    await transaction.commit();
    console.log(JSON.stringify({demoConsultationsDeleted:rows.length,backupSaved:true}));
  } catch(error) {await transaction.rollback();throw error;}
  finally {await sequelize.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});

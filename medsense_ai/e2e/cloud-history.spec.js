import { test, expect } from '@playwright/test';
test.use({ channel: 'msedge' });
const token = payload => [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,...payload})).toString('base64url'),'test'].join('.');
test('previous cloud filter displays all pages and archived invoice details', async ({page}) => {
 const staff={id:41,role:'pharmacist',email:'history@example.test',fullName:'History verification',status:'approved'};
 const current=[1,2].map(id=>({invoice_id:id,invoice_number:`CURRENT-${id}`,customer_name:'Current record',created_at:'2026-10-02T00:00:00Z',total_amount:20,status:1,payment_status:'paid',delivery_status:'delivered',item_count:1}));
 const history=Array.from({length:112},(_,index)=>({invoice_id:900000+index,invoice_number:`CLOUD-${index+1}`,legacy_source_invoice_number:index===111?'CLOUD-LAST':`ORIGINAL-${index+1}`,legacy_source_invoice_id:index+1,legacy_source_schema:'public',customer_name:'Previous cloud record',created_at:'2026-01-01T00:00:00Z',total_amount:10,status:index<54?0:1,payment_status:'paid',delivery_status:'delivered',item_count:0}));
 const records=[...current,...history];
 await page.addInitScript(({staff,jwt})=>sessionStorage.setItem('medsense_auth_user',JSON.stringify({...staff,token:jwt})),{staff,jwt:token({id:41,role:'pharmacist'})});
 await page.route('**/api/**',async route=>{const url=new URL(route.request().url());const pathname=url.pathname.replace(/\/$/,'');
  if(pathname==='/api/auth/pharmacist/me')return route.fulfill({json:{success:true,data:staff}});
  if(pathname==='/api/orders'){const p=Number(url.searchParams.get('page')||1);return route.fulfill({json:{success:true,data:{orders:records.slice((p-1)*100,p*100),pagination:{page:p,total:114,totalPages:2}}}});}
  if(pathname==='/api/orders/stats')return route.fulfill({json:{success:true,data:{total:114}}});
  if(pathname==='/api/orders/900111')return route.fulfill({json:{success:true,data:{...history[111],items:[]}}});
  if(pathname==='/api/products'||pathname==='/api/brand'||pathname==='/api/suppliers')return route.fulfill({json:[]});
  return route.fulfill({json:{success:true,data:[]}});
 });
 await page.goto('/pharmacist/dashboard/orders');
 await expect(page.getByText('Showing 114 of 114 orders')).toBeVisible();
 await page.getByRole('combobox',{name:'Record source'}).selectOption('cloud');
 await expect(page.getByText('Showing 112 of 114 orders')).toBeVisible();
 await expect(page.getByText('CURRENT-1',{exact:true})).toHaveCount(0);
 const row=page.locator('tr').filter({hasText:'CLOUD-LAST'});
 await expect(row).toBeVisible();
 await expect(row.locator('select')).toHaveCount(0);
 await row.getByRole('button',{name:'View',exact:true}).click();
 await expect(page.getByText('Item details unavailable in original cloud record',{exact:true})).toBeVisible();
});

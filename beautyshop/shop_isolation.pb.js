onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_appointments");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_attendance");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_categories");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_commission_payouts");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_customers");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_expense_categories");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_expenses");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_insights");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_inv_movements");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_products");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_sales");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_services");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const shopId = e.record.get("shop_id");
  if (!shopId) throw new ForbiddenError("shop_id required");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_staff");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const saleId = e.record.get("sale_id");
  if (!saleId) throw new ForbiddenError("sale_id required");
  const sale = $app.findRecordById("bs_sales", saleId);
  const shopId = sale.get("shop_id");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_sale_items");

onRecordCreateRequest(function(e) {
  const auth = e.auth;
  if (!auth) throw new ForbiddenError("Not authenticated");
  const productId = e.record.get("product_id");
  if (!productId) throw new ForbiddenError("product_id required");
  const product = $app.findRecordById("bs_products", productId);
  const shopId = product.get("shop_id");
  const links = $app.findAllRecords("bs_shop_admins", $dbx.hashExp({shop_id: shopId, admin_id: auth.id}));
  if (links.length === 0) throw new ForbiddenError("Wrong shop");
  e.next();
}, "bs_product_variants");
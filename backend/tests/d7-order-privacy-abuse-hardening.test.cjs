const fs =
  require('fs');

const path =
  require('path');

const test =
  require('node:test');

const assert =
  require('node:assert/strict');


const root =
  path.resolve(
    __dirname,
    '..',
    '..'
  );


function read(relativePath) {
  return fs.readFileSync(
    path.join(
      root,
      relativePath
    ),
    'utf8'
  );
}


const routes =
  read(
    'backend/src/routes/orderRoutes.js'
  );

const controller =
  read(
    'backend/src/controllers/orderController.js'
  );

const customerAuth =
  read(
    'backend/src/middleware/customerAuth.js'
  );

const storefrontService =
  read(
    'medsense_ai/src/services/storefrontOrderService.js'
  );

const accountPage =
  read(
    'medsense_ai/src/pages/storefront/AccountPage.jsx'
  );

const ordersPage =
  read(
    'medsense_ai/src/pages/storefront/OrdersPage.jsx'
  );

const refundPage =
  read(
    'medsense_ai/src/pages/storefront/RefundPage.jsx'
  );


test(
  'customer list route requires verified customer JWT before controller',
  () => {
    const route =
      routes.match(
        /router\.get\(\s*['"]\/my-orders['"][\s\S]*?orderController\.getAllOrders\s*\)/
      )?.[0];

    assert.ok(
      route,
      'customer list route not found'
    );

    assert.match(
      route,
      /verifyCustomerToken/
    );

    assert.match(
      route,
      /bindAuthenticatedCustomerOrderRead/
    );

    assert.ok(
      route.indexOf(
        'verifyCustomerToken'
      ) <
      route.indexOf(
        'orderController.getAllOrders'
      )
    );
  }
);


test(
  'customer detail route requires verified customer JWT before controller',
  () => {
    const route =
      routes.match(
        /router\.get\(\s*['"]\/my-orders\/:id['"][\s\S]*?orderController\.getOrderById\s*\)/
      )?.[0];

    assert.ok(
      route,
      'customer detail route not found'
    );

    assert.match(
      route,
      /verifyCustomerToken/
    );

    assert.match(
      route,
      /bindAuthenticatedCustomerOrderRead/
    );
  }
);


test(
  'caller supplied customer_id cannot override authenticated list identity',
  () => {
    const start =
      controller.indexOf(
        'exports.getAllOrders = async'
      );

    const end =
      controller.indexOf(
        'exports.getOrderById = async'
      );

    const scope =
      controller.slice(
        start,
        end
      );

    assert.match(
      scope,
      /Number\(req\.customerOrderCustomerId\)/
    );

    assert.match(
      scope,
      /hasAuthenticatedCustomer[\s\S]*?\? authenticatedCustomerId[\s\S]*?: customer_id/
    );

    assert.match(
      scope,
      /i\.customer_id = :customer_id/
    );
  }
);


test(
  'direct other-customer order id is constrained by authenticated ownership',
  () => {
    const start =
      controller.indexOf(
        'exports.getOrderById = async'
      );

    const end =
      controller.indexOf(
        'exports.getOrderStats = async'
      );

    const scope =
      controller.slice(
        start,
        end
      );

    assert.match(
      scope,
      /Number\(req\.customerOrderCustomerId\)/
    );

    assert.match(
      scope,
      /AND i\.customer_id = :customer_id/
    );

    assert.match(
      scope,
      /customer_id:\s*authenticatedCustomerId/
    );

    assert.match(
      scope,
      /res\.status\(404\)/
    );
  }
);


test(
  'missing customer Authorization header fails closed',
  () => {
    const start =
      customerAuth.indexOf(
        'exports.verifyCustomerToken'
      );

    const end =
      customerAuth.indexOf(
        'exports.optionalCustomerToken'
      );

    const scope =
      customerAuth.slice(
        start,
        end
      );

    assert.match(
      scope,
      /!authHeader/
    );

    assert.match(
      scope,
      /res\.status\(401\)/
    );

    assert.match(
      scope,
      /AUTH_REQUIRED/
    );
  }
);


test(
  'non-customer JWT type cannot become customer identity',
  () => {
    const loadStart =
      customerAuth.indexOf(
        'async function loadCurrentCustomer'
      );

    const loadEnd =
      customerAuth.indexOf(
        'function handleCustomerTokenError'
      );

    const scope =
      customerAuth.slice(
        loadStart,
        loadEnd
      );

    assert.match(
      scope,
      /decoded\?\.type !== 'customer'/
    );

    assert.match(
      scope,
      /res\.status\(403\)/
    );

    assert.match(
      scope,
      /INVALID_TOKEN/
    );
  }
);


test(
  'staff order routes remain behind authentication and pharmacist-admin wall',
  () => {
    const authWall =
      routes.indexOf(
        'router.use(authenticate)'
      );

    const roleWall =
      routes.indexOf(
        'router.use(requireOrderStaffRole)'
      );

    const staffList =
      routes.indexOf(
        "router.get('/', orderController.getAllOrders);"
      );

    const staffDetail =
      routes.indexOf(
        "router.get('/:id', orderController.getOrderById);"
      );

    const statusMutation =
      routes.indexOf(
        "router.patch('/:id/status', orderController.updateOrderStatus);"
      );

    assert.ok(
      authWall >= 0
    );

    assert.ok(
      roleWall > authWall
    );

    assert.ok(
      staffList > roleWall
    );

    assert.ok(
      staffDetail > roleWall
    );

    assert.ok(
      statusMutation > roleWall
    );

    assert.match(
      routes,
      /\['pharmacist', 'admin'\]/
    );
  }
);


test(
  'customer read routes are defined before staff route wall',
  () => {
    const customerList =
      routes.indexOf(
        "'/my-orders'"
      );

    const customerDetail =
      routes.indexOf(
        "'/my-orders/:id'"
      );

    const staffWall =
      routes.indexOf(
        'router.use(authenticate)'
      );

    assert.ok(
      customerList >= 0
    );

    assert.ok(
      customerDetail > customerList
    );

    assert.ok(
      customerList < staffWall
    );

    assert.ok(
      customerDetail < staffWall
    );
  }
);


test(
  'storefront order service uses customer-owned list and detail routes only',
  () => {
    assert.match(
      storefrontService,
      /\/my-orders\?limit=100/
    );

    assert.match(
      storefrontService,
      /\/my-orders\/\$\{orderId\}/
    );

    assert.doesNotMatch(
      storefrontService,
      /axios\.get\(\s*`\$\{API_URL\}\/\$\{orderId\}`/
    );
  }
);


test(
  'storefront pages cannot directly request staff order detail endpoint',
  () => {
    const combined =
      [
        accountPage,
        ordersPage,
        refundPage
      ].join('\n');

    assert.doesNotMatch(
      combined,
      /api\.get\(\s*`\/orders\/\$\{/
    );

    assert.doesNotMatch(
      combined,
      /axios\.get\(\s*`\$\{API\}\/orders\/\$\{/
    );

    assert.match(
      combined,
      /getOrderById/
    );
  }
);


test(
  'customer-facing paths do not expose order status mutation',
  () => {
    const customerArea =
      routes.slice(
        0,
        routes.indexOf(
          'router.use(authenticate)'
        )
      );

    assert.doesNotMatch(
      customerArea,
      /router\.patch\([^)]*status/
    );

    assert.doesNotMatch(
      customerArea,
      /router\.delete\([^)]*orders/
    );
  }
);

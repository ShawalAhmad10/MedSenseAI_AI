const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root =
  path.resolve(
    __dirname,
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

test(
  'customer prescription service uses customer JWT only',
  () => {
    const source =
      read(
        'src/services/storefrontPrescriptionService.js'
      );

    assert.match(
      source,
      /medsense_customer_auth/
    );

    assert.match(
      source,
      /\/api\/prescriptions/
    );

    assert.doesNotMatch(
      source,
      /medsense_auth_user/
    );
  }
);

test(
  'prescription service exposes real analyze confirm list and detail operations',
  () => {
    const source =
      read(
        'src/services/storefrontPrescriptionService.js'
      );

    assert.match(
      source,
      /analyzePrescriptionFile/
    );

    assert.match(
      source,
      /\/analyze/
    );

    assert.match(
      source,
      /confirmPrescription/
    );

    assert.match(
      source,
      /\/confirm/
    );

    assert.match(
      source,
      /listPrescriptions/
    );

    assert.match(
      source,
      /getPrescription/
    );
  }
);

test(
  'customer upload accepts image contract only',
  () => {
    const source =
      read(
        'src/components/storefront/PrescriptionDropzone.jsx'
      );

    assert.match(
      source,
      /image\/png/
    );

    assert.match(
      source,
      /image\/jpeg/
    );

    assert.doesNotMatch(
      source,
      /application\/pdf|\.pdf/i
    );
  }
);

test(
  'active storefront OCR no longer uses fake timeout or static OCR rows',
  () => {
    const dropzone =
      read(
        'src/components/storefront/PrescriptionDropzone.jsx'
      );

    const page =
      read(
        'src/pages/storefront/PrescriptionUploadPage.jsx'
      );

    assert.doesNotMatch(
      dropzone,
      /setTimeout/
    );

    assert.doesNotMatch(
      page,
      /ocrRows/
    );

    assert.match(
      dropzone,
      /analyzePrescriptionFile/
    );

    assert.match(
      dropzone,
      /confirmPrescription/
    );
  }
);

test(
  'OCR review supports confirm correct reject and manual entry',
  () => {
    const source =
      read(
        'src/components/storefront/PrescriptionDropzone.jsx'
      );

    assert.match(
      source,
      /confirmed/
    );

    assert.match(
      source,
      /corrected/
    );

    assert.match(
      source,
      /rejected/
    );

    assert.match(
      source,
      /manual/
    );

    assert.match(
      source,
      /Original OCR text/
    );
  }
);

test(
  'OCR screen never auto adds a medicine to cart',
  () => {
    const source =
      read(
        'src/components/storefront/PrescriptionDropzone.jsx'
      );

    assert.doesNotMatch(
      source,
      /useCart/
    );

    assert.doesNotMatch(
      source,
      /addItem\s*\(/
    );

    assert.match(
      source,
      /does not add medicines to your cart/
    );
  }
);

test(
  'prescription history uses live customer API rather than storefront mock data',
  () => {
    const source =
      read(
        'src/pages/storefront/PrescriptionHistoryPage.jsx'
      );

    assert.match(
      source,
      /listPrescriptions/
    );

    assert.match(
      source,
      /getPrescription/
    );

    assert.doesNotMatch(
      source,
      /prescriptionHistory\s+from.*storefrontData/
    );

    assert.doesNotMatch(
      source,
      /Mock audit trail/
    );
  }
);

test(
  'upload page no longer imports static storefront OCR data',
  () => {
    const source =
      read(
        'src/pages/storefront/PrescriptionUploadPage.jsx'
      );

    assert.match(
      source,
      /<PrescriptionDropzone\s*\/>/
    );

    assert.doesNotMatch(
      source,
      /storefrontData/
    );
  }
);

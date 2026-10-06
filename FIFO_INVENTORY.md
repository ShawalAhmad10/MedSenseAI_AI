# Medicine arrivals and FIFO

For another arrival of the same medicine, open **Inventory → Stock Batches → Add New Batch**. Select the existing medicine, enter **Name for this arrival**, its purchase cost, sale price, quantity, arrival date and expiry, then save. Each receipt creates a separate batch. Previous names, prices and arrival dates remain unchanged.

Use this flow for a renamed arrival such as Panadol → Panadol 500mg. The selected medicine defines its FIFO queue. Independently created medicines with different names are not automatically assumed to be interchangeable.

Customers see the oldest available arrival's name and unit price. They can order across subsequent arrivals when necessary. Cart and Checkout show the batch price breakdown before purchase: 2 units at Rs. 5 plus 1 at Rs. 8 cost Rs. 18. An inventory change invalidates an outdated quote; it cannot silently increase a submitted order's price.

Every invoice allocation saves its batch, arrival name, sale price and purchase cost. Stock deductions and invoice writes happen in the same transaction. Expired and quarantined stock is excluded. Empty batches are finished/inactive, empty medicines are out of stock, and a new receipt reactivates availability. Stock corrections cannot add stock back to an old arrival; additional stock uses a new batch.

Existing receipt prices cannot be edited. The startup migration synchronizes availability and adds a FIFO index without changing historical receipt names, prices or dates. Status follows available stock automatically.

Validation includes backend and frontend regression tests, browser checks for stock intake and mixed-price checkout, and database tests for FIFO across batches and existing price versions, invoice costs, depletion, stale quotes and restock. Database verification rolls back its test records.

Product controls and price versions:
- The row + button creates a new price version linked to the selected medicine's FIFO family, even if its arrival name changes. Keep its brand, strength and pack size the same.
- Legacy (new)/(newest) price versions are linked automatically when their medicine attributes match. Names and stock/invoice history remain unchanged.
- Customer listings contain one card per family. The card keeps the original medicine URL and displays the oldest eligible receipt's name and price, advancing when it is exhausted.
- Power toggles manual availability. Activating a product with zero stock still leaves it out of stock; receive a new batch to make it available.
- Delete archives the product and removes it from product/customer listings. Historical receipts and invoice references are retained.
- The Windows launcher uses backend/.env. Cloud migration now selects the medsense_app schema; see CLOUD_MIGRATION.md. The explicit start-local-backend.cjs helper still supports the original local database.

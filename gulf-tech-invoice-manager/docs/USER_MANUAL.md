# User Manual

Gulf Tech Dubai Invoice Manager works entirely on your computer. Nothing is sent to the
internet.

## 1. First steps

1. **Set up your business profile.** Go to **Businesses → New business**. Enter the name,
   address, phone, WhatsApp, email, VAT/TRN number, trade licence number, and upload your
   logo. Choose the signature mode:
   - *Printed name* – the signatory name and position are printed under the signature line.
   - *Handwritten image* / *Digital signature* – upload a PNG or JPG of the signature.
2. **Review Settings.** Set the default VAT rate (5% for UAE), currency (AED, USD, EUR,
   GBP or BDT), invoice prefix (e.g. `INV`), number format, PDF template and page size.
3. **Add customers and products.** Each product can have a SKU, barcode, price and stock.

## 2. Dashboard

Shows total sales, today's sales, this month's sales, outstanding balance, customer and
product counts, low-stock warnings, recent invoices and quick actions. Click any invoice to
open it.

## 3. Customers

- **Add:** click *New customer*. Name is required.
- **Search:** type a name, mobile, email or city in the search box.
- **History:** click a customer to see invoices, total billed, paid amount, balance and top items.
- **Delete:** only customers without invoices can be deleted.

## 4. Products and stock

- **Add:** click *New product*. Enter the SKU and barcode. Selling price is used by default on invoices.
- **Barcode:** a USB barcode scanner acts as a keyboard. Click the search box, scan the item, and
  the matching product is found.
- **Low stock:** products whose stock is at or below the reorder level are highlighted and shown on the dashboard.
- **Stock changes:** stock is reduced when an invoice leaves *Draft* and restored if that invoice
  is edited back to draft or deleted.

## 5. Creating an invoice

1. Go to **Invoices → New invoice** (or use *Create Invoice* on the dashboard).
2. Choose the business and customer. The invoice number is assigned automatically, for example
   `INV-2026-000001`.
3. Add products by searching or scanning. Add as many lines as you need. Adjust quantity, unit
   price, line discount % and VAT rate for each line if required.
4. Enter an invoice-level discount (amount or %), shipping charge, notes and terms.
5. Enter the amount paid and payment method (Cash, Card, Bank Transfer, Cheque, Other).
   The status updates automatically:
   - **Draft** – not yet issued; stock is not reduced.
   - **Paid** – amount paid equals the grand total.
   - **Partially Paid** – some amount paid.
   - **Unpaid** – nothing paid.
6. Click **Save**. Totals (subtotal, discounts, VAT, shipping and grand total) are calculated
   automatically and rounded to two decimals.

## 6. Printing, PDF and sharing

Open an invoice and use the buttons:

- **Print** – sends the invoice to your printer.
- **Save PDF** – saves to the PDF output folder.
- **Export PDF** – saves to a location you choose.
- **Email PDF** – saves the PDF, then opens your email program with a pre-filled message.
  Attach the saved PDF manually; the app cannot attach files automatically.
- **WhatsApp PDF** – saves the PDF and opens WhatsApp with the customer's number and a message.
  Attach the PDF manually.
- **Share PDF** – saves the PDF and opens its folder in Windows Explorer.

**Templates:** choose Modern, Professional, Retail, Corporate or Minimal in the invoice
view. The change is immediate and does not alter the saved invoice.

**Signatures:** the left block shows the authorised signature. The right block, titled
*Customer / Recipient Signature*, contains *Name*, *Received By* and *Date* and is left blank so
the customer can sign by hand after printing.

**QR code:** encodes the invoice number, customer and total so it can be scanned for verification.

## 7. Reports

Choose **Daily, Weekly, Monthly or Yearly** and a date. The report shows total revenue,
invoice count, average invoice value, collected and outstanding amounts, best-selling products,
top customers and charts. Use **Export CSV** to download the data for a spreadsheet.

## 8. Backup and restore

Go to **Backup & Restore**.

- **Export backup:**
  - *ZIP* – contains the database, a JSON copy and a manifest. Recommended for moving to
    another computer.
  - *JSON* – readable data file (sensitive settings such as the PIN are excluded).
  - *SQLite* – a raw copy of the database.
  - Optionally enter a password to encrypt the file. **Keep this password safe; without it the
    backup cannot be restored.**
- **Restore:** choose a backup file. If it is password-protected you will be asked for the password.
  The application first saves a *pre-restore safety backup* of your current data. Your PIN is kept.
- **Automatic backups:** enable them in **Settings → Automatic backup**. Choose the interval and
  how many backups to keep. Automatic backups are encrypted for this computer only.

Store at least one copy of your ZIP backup on a separate drive or USB memory stick.

## 9. Security

- **PIN lock:** set a PIN in **Settings → Security** (4 to 8 digits). After 5 wrong attempts the
  PIN is locked for 30 seconds.
- **Session timeout:** when a PIN is set, the app locks after the inactivity period you choose.
- **Encryption:** the database is encrypted. Its key is protected by Windows.
- **Fingerprint unlock:** not included in this version. Use the PIN.

## 10. Themes and settings

Switch between light and dark themes in **Settings → Appearance**. The choice is saved.

## 11. Frequently asked questions

- **Can I use it without internet?** Yes. It never needs internet access.
- **Can I have several businesses?** Yes, there is no limit. Each invoice keeps a copy of the
  business and customer details as they were when it was issued.
- **Can I change an issued invoice?** Yes, invoices can be edited. Keep in mind that changing an
  invoice you have already given to a customer is not recommended for audit reasons.
- **Is VAT included automatically?** VAT is calculated per line using the default or line rate.
  Verify tax treatment with your accountant.

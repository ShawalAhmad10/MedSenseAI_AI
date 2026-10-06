import hashlib
import json
import sys
import zipfile
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS = {'m': MAIN}
ET.register_namespace('', MAIN)
ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
CENT = Decimal('0.01')


def money(value):
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def columns(row):
    return {''.join(letter for letter in cell if letter.isalpha()): value for cell, value in row['cells'].items()}


def change_cell(tree, reference, value):
    cell = tree.find(f'.//m:c[@r="{reference}"]', NS)
    if cell is None:
        raise ValueError(f'Missing source cell {reference}')
    for child in list(cell):
        cell.remove(child)
    if isinstance(value, str):
        cell.set('t', 'inlineStr')
        inline = ET.SubElement(cell, '{' + MAIN + '}is')
        ET.SubElement(inline, '{' + MAIN + '}t').text = value
    else:
        cell.attrib.pop('t', None)
        ET.SubElement(cell, '{' + MAIN + '}v').text = str(value)


def main():
    original = Path(sys.argv[1]).resolve()
    updated = Path(sys.argv[2]).resolve()
    manifest = Path(sys.argv[3]).resolve()
    sheet_data = json.loads(Path(sys.argv[4]).read_text(encoding='utf-8'))
    sheets = {sheet['name']: sheet for sheet in sheet_data}
    lines = sheets['Stock_Batch_Lines']['rows'][1:]
    assert len(lines) == 234
    assert [columns(row)['A'] for row in lines] == list(range(1, 235)), 'Stock numbers must be sequential'
    receipts = []
    by_original_bill = {}
    reconciliation = defaultdict(lambda: {'units': 0, 'value': Decimal(0), 'batches': 0})
    before_total = Decimal(0)
    with zipfile.ZipFile(original) as archive:
        trees = {name: ET.fromstring(archive.read(sheets[name]['xml']))
                 for name in ['Stock_Batch_Lines', 'Batch_Summary', 'Stock_Reconciliation']}
        for row in lines:
            source = columns(row)
            number = source['A']
            bill = f'BILL-{number:04d}'
            batch = f'BATCH-{number:03d}'
            qty = source['H'] * source['J']
            bonus = source['I'] * source['J']
            assert isinstance(qty, int) and isinstance(bonus, int) and qty > 0 and bonus >= 0
            assert qty + bonus == source['K']
            assert source['X'] == 'Paid' and money(source['Y']) == money(source['W']) and money(source['Z']) == 0
            purchase_price = money(source['N'])
            sale_price = money(source['O'])
            assert 0 < purchase_price < sale_price
            gross = money(Decimal(qty) * purchase_price)
            discount = money(gross * Decimal(str(source['M'])) / 100)
            subtotal = gross - discount
            sales_tax = money(subtotal * Decimal(str(source['P'])) / 100)
            advance_tax = money(subtotal * Decimal(str(source['Q'])) / 100)
            total = subtotal + sales_tax + advance_tax
            before_total += money(source['W'])
            item = dict(productName=source['E'], brandName=source['F'], batchNumber=batch,
                        qty=qty, bonus=bonus, initialQuantity=qty + bonus, packSize=source['J'],
                        qtyPacks=source['H'], bonusPacks=source['I'], purchasePrice=float(purchase_price),
                        salePrice=float(sale_price), expiryDate=source['L'], discount=float(discount),
                        salesTax=float(sales_tax), advanceTax=float(advance_tax), grossTotal=float(gross),
                        subtotal=float(subtotal), totalPrice=float(total))
            receipt = dict(sourceStockNumber=number, supplier=source['B'], billNo=bill, creationDate=source['D'],
                           paymentStatus='Paid', totalAmount=float(total), paidAmount=float(total), dueAmount=0,
                           originalBillNo=source['C'], originalBatchNumber=source['G'], items=[item])
            assert source['C'] not in by_original_bill
            by_original_bill[source['C']] = receipt
            receipts.append(receipt)
            key = (source['E'], source['F'], source['B'])
            reconciliation[key]['units'] += qty + bonus
            reconciliation[key]['value'] += total
            reconciliation[key]['batches'] += 1
            values = {'C': bill, 'G': batch, 'R': gross, 'S': discount, 'T': subtotal,
                      'U': sales_tax, 'V': advance_tax, 'W': total, 'Y': total, 'Z': 0}
            for column, value in values.items():
                change_cell(trees['Stock_Batch_Lines'], f'{column}{row["row"]}', value)
        summary_rows = sheets['Batch_Summary']['rows'][1:]
        assert len(summary_rows) == len(receipts)
        seen = set()
        for row in summary_rows:
            source = columns(row)
            receipt = by_original_bill[source['B']]
            assert source['B'] not in seen
            seen.add(source['B'])
            assert source['A'] == receipt['supplier'] and source['C'] == receipt['creationDate'] and source['D'] == 1
            item = receipt['items'][0]
            values = {'B': receipt['billNo'], 'E': money(item['grossTotal']), 'F': money(item['salesTax']),
                      'G': money(item['advanceTax']), 'H': money(item['discount']), 'I': money(item['subtotal']),
                      'J': money(receipt['totalAmount']), 'K': money(receipt['paidAmount']), 'L': 0}
            for column, value in values.items():
                change_cell(trees['Batch_Summary'], f'{column}{row["row"]}', value)
        assert len(seen) == 234
        # Summary follows the same bill sequence as the detailed stock sheet.
        sheet_rows = trees['Batch_Summary'].find('m:sheetData', NS)
        ordered_rows = []
        for row in list(sheet_rows):
            if int(row.attrib['r']) == 1:
                ordered_rows.append((1, row))
                continue
            bill_cell = row.find('m:c[@r="B' + row.attrib['r'] + '"]', NS)
            bill = ''.join(node.text or '' for node in bill_cell.findall('.//m:t', NS))
            position = int(bill.removeprefix('BILL-')) + 1
            row.set('r', str(position))
            for cell in row.findall('m:c', NS):
                column = ''.join(letter for letter in cell.attrib['r'] if letter.isalpha())
                cell.set('r', f'{column}{position}')
            ordered_rows.append((position, row))
        for row in list(sheet_rows):
            sheet_rows.remove(row)
        for _, row in sorted(ordered_rows):
            sheet_rows.append(row)
        for row in sheets['Stock_Reconciliation']['rows'][1:]:
            source = columns(row)
            aggregate = reconciliation[(source['A'], source['B'], source['C'])]
            assert source['D'] == aggregate['units'] and source['H'] == aggregate['batches'] == 2
            change_cell(trees['Stock_Reconciliation'], f'E{row["row"]}', money(aggregate['value']))
        modified = {sheets[name]['xml']: ET.tostring(tree, encoding='utf-8', xml_declaration=True)
                    for name, tree in trees.items()}
        updated.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(updated, 'w') as output:
            for entry in archive.infolist():
                output.writestr(entry, modified.get(entry.filename, archive.read(entry.filename)))
    after_total = sum((money(receipt['totalAmount']) for receipt in receipts), Decimal(0))
    payload = dict(source=dict(originalPath=str(original), updatedPath=str(updated),
                              originalSha256=hashlib.sha256(original.read_bytes()).hexdigest(),
                              updatedSha256=hashlib.sha256(updated.read_bytes()).hexdigest(),
                              bonusPolicy='Free; only paid quantity is charged',
                              supplierRename=dict(oldName='ShahAlmad', newName='Shawal Ahmad')),
                   receipts=receipts,
                   totals=dict(receipts=234, products=117, units=sum(item['units'] for item in reconciliation.values()),
                               originalTotal=float(before_total), revisedTotal=float(after_total),
                               reduction=float(before_total - after_total)))
    manifest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'updatedWorkbook': str(updated), 'receipts': len(receipts), 'products': len(reconciliation),
                      'billRange': [receipts[0]['billNo'], receipts[-1]['billNo']],
                      'batchRange': [receipts[0]['items'][0]['batchNumber'], receipts[-1]['items'][0]['batchNumber']],
                      **payload['totals']}, ensure_ascii=True))


if __name__ == '__main__':
    main()

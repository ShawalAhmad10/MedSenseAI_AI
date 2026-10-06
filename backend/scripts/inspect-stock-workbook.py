import json
import posixpath
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
NS = {'m': MAIN}


def read_workbook(filename):
    with zipfile.ZipFile(filename) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS):
                shared.append(''.join(node.text or '' for node in item.findall('.//m:t', NS)))
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        relationships = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {item.attrib['Id']: item.attrib['Target'] for item in relationships}
        result = []
        for sheet in workbook.findall('m:sheets/m:sheet', NS):
            target = targets[sheet.attrib['{' + REL + '}id']]
            location = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
            root = ET.fromstring(archive.read(location))
            rows = []
            formulas = []
            for row in root.findall('m:sheetData/m:row', NS):
                cells = {}
                for cell in row.findall('m:c', NS):
                    raw = cell.find('m:v', NS)
                    value = raw.text if raw is not None else None
                    kind = cell.attrib.get('t')
                    if kind == 's' and value is not None:
                        value = shared[int(value)]
                    elif kind == 'inlineStr':
                        value = ''.join(node.text or '' for node in cell.findall('.//m:t', NS))
                    elif kind not in ['str','e','d'] and value is not None:
                        value = float(value) if '.' in value or 'E' in value.upper() else int(value)
                    cells[cell.attrib['r']] = value
                    formula = cell.find('m:f', NS)
                    if formula is not None:
                        formulas.append({'cell': cell.attrib['r'], 'formula': formula.text, 'cached': value})
                if any(value is not None for value in cells.values()):
                    rows.append({'row': int(row.attrib['r']), 'cells': cells})
            result.append({'name': sheet.attrib['name'], 'xml': location, 'rows': rows, 'formulas': formulas})
        return result


if __name__ == '__main__':
    data = read_workbook(sys.argv[1])
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    for sheet in data:
        print(json.dumps({'sheet': sheet['name'], 'rows': len(sheet['rows']), 'formulas': len(sheet['formulas']),
                          'sample': sheet['rows'][:5], 'formulaSample': sheet['formulas'][:3]}, ensure_ascii=True))

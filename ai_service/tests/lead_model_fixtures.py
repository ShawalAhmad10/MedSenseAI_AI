"""Small abstract feature/label fixtures; unrelated to SALES-03 generation or performance."""

import csv
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from medsense_ai.lead_scoring.contracts import FEATURE_NAMES, Features, quotient, stable_json
from medsense_ai.lead_scoring.io import INDEX_COLUMNS, LABEL_COLUMNS, OUTPUT_DATA_FILES, OUTPUT_ARTIFACT_FILES, sha256
from medsense_ai.lead_scoring.qa import feature_manifest, target_manifest
from medsense_ai.lead_scoring.splits import label_cutoff, partition_at, split_manifest
from medsense_ai.sales_data.contracts import utc_instant
from medsense_ai.lead_scoring.model.data import FrozenSource


def feature(i=1):
    n=i%5+1
    values={name:0 for name in FEATURE_NAMES}
    for stem in ("purchase_count","session_count","product_view_count","distinct_products_viewed"):
        values.update({f"{stem}_{d}d":n+j for j,d in enumerate((7,30,60))})
    if i%5:
        for stem in ("cart_add_count","cart_add_quantity","cart_remove_count","cart_remove_quantity"):
            values.update({f"{stem}_{d}d":j+1 for j,d in enumerate((7,30,60))})
    values.update(purchase_recency_days=Decimal(i%59),days_since_last_cart_add=Decimal(i%59) if i%5 else None,
                  no_cart_add_60d=not bool(i%5),purchase_frequency_ratio_30d_60d=quotient(n+1,n+2))
    return Features(**values)


def frozen_source(root: Path):
    data, artifacts=root/"data",root/"artifacts"
    data.mkdir(parents=True)
    artifacts.mkdir()
    freeze=utc_instant("2026-08-31T23:59:59.999999Z")
    features,labels,index=[],[],[]
    for part,at,n in (("train","2025-11-03T00:00:00Z",80),("validation","2026-04-06T00:00:00Z",40),("test","2026-06-01T00:00:00Z",40)):
        ids=[]
        for i in range(n):
            key=f"{part}_{i:04}"
            ids.append(key)
            features.append(dict(example_id=key,**feature(i).model_dump()))
            t=utc_instant(at)
            labels.append(dict(example_id=key,target_version="repeat_purchase_30d_v1",horizon_end=(t+timedelta(days=30)).isoformat(),
                               label_status="labeled",label=int(i%5 in (0,2)),label_evidence_cutoff=label_cutoff(partition_at(t),freeze).isoformat()))
            index.append(dict(example_id=key,dataset_id="model_fixture",source_namespace="abstract_fixture",customer_id=f"c_{i//2}",observation_time=at,
                              partition=part,eligibility="eligible",eligibility_reason="",label_status="labeled",supervised="true",data_origin="synthetic_development"))
        (data/f"{part}_ids.txt").write_text("".join(k+"\n" for k in ids),encoding="utf-8",newline="\n")
    for name,columns,rows in (("feature_matrix.csv",("example_id",*FEATURE_NAMES),features),("labels.csv",LABEL_COLUMNS,labels),("example_index.csv",INDEX_COLUMNS,index)):
        with (data/name).open("w",encoding="utf-8",newline="") as handle:
            writer=csv.DictWriter(handle,columns,lineterminator="\n")
            writer.writeheader()
            for row in rows:
                writer.writerow({k:"" if v is None else str(v).lower() if isinstance(v,bool) else v for k,v in row.items()})
    payloads={"feature_manifest.json":feature_manifest(),"target_manifest.json":target_manifest(freeze),"split_manifest.json":split_manifest(),
              "provenance_manifest.json":dict(dataset_id="model_fixture",source_namespace="abstract_fixture",data_origin="synthetic_development",source_extracted_at=freeze.isoformat())}
    for name in OUTPUT_ARTIFACT_FILES:
        (artifacts/name).write_bytes(stable_json(payloads.get(name,{})))
    hashes={"data/"+n:sha256(data/n) for n in OUTPUT_DATA_FILES}
    hashes.update({"artifacts/"+n:sha256(artifacts/n) for n in OUTPUT_ARTIFACT_FILES})
    (artifacts/"file_hashes.json").write_bytes(stable_json({"sha256":hashes}))
    return FrozenSource(data,artifacts,sha256(artifacts/"file_hashes.json"))

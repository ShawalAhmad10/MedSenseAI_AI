"""Explicit AP, technical thresholds, temporal cohorts and bounded diagnostics."""

from collections import Counter
import math

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score


def checked(y, probabilities):
    y, p = np.asarray(y), np.asarray(probabilities, dtype=float)
    if y.ndim != 1 or p.shape != y.shape or not len(y) or not np.isin(y, [0,1]).all() or not np.isfinite(p).all() or np.any((p<0)|(p>1)):
        raise ValueError("Metrics require binary labels and finite aligned probabilities")
    return y, p


def ranking(y, scores) -> dict:
    y, scores = np.asarray(y), np.asarray(scores, dtype=float)
    if scores.shape != y.shape or not np.isfinite(scores).all() or not len(y):
        raise ValueError("Invalid ranking scores")
    return dict(ap=float(average_precision_score(y, scores)) if y.sum() else None,
                roc_auc=float(roc_auc_score(y, scores)) if len(np.unique(y)) == 2 else None)


def top_decile(y, p, ids) -> dict:
    y, p = checked(y, p)
    if len(ids) != len(y) or len(set(ids)) != len(ids):
        raise ValueError("Top-decile tie-break requires unique aligned example IDs")
    k = math.ceil(0.1*len(y))
    order = sorted(range(len(y)), key=lambda i: (-p[i], ids[i]))[:k]
    hits, positives = int(y[order].sum()), int(y.sum())
    return dict(rows=len(y), k=k, positives=positives, hits=hits, precision=hits/k,
                recall=hits/positives if positives else None,
                lift=(hits/k)/(positives/len(y)) if positives else None)


def metrics(y, p, threshold: float | None = None) -> dict:
    y, p = checked(y, p)
    result = dict(rows=len(y), prevalence=float(y.mean()), **ranking(y,p),
                  brier=float(brier_score_loss(y,p)), log_loss=float(log_loss(y,p,labels=[0,1])))
    if threshold is not None:
        if not 0 <= threshold <= 1:
            raise ValueError("Technical threshold must be in [0,1]")
        positive = p >= threshold
        tp, fp = int(np.sum(positive & (y==1))), int(np.sum(positive & (y==0)))
        fn, tn = int(np.sum(~positive & (y==1))), int(np.sum(~positive & (y==0)))
        result.update(technical_validation_threshold=threshold,
                      precision=tp/(tp+fp) if tp+fp else None,
                      recall=tp/(tp+fn) if tp+fn else None,
                      f1=2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None,
                      accuracy=(tp+tn)/len(y), confusion_matrix=[[tn,fp],[fn,tp]])
    return result


def select_threshold(y, p, tolerance=1e-12) -> float:
    y, p = checked(y, p)
    if len(np.unique(y)) != 2:
        raise ValueError("Validation threshold selection requires both classes")
    # One sorted pass over all distinct attainable decision boundaries, not model tuning.
    order = np.argsort(-p, kind="stable")
    cumulative_tp = np.cumsum(y[order])
    ends = np.flatnonzero(np.r_[p[order][1:] != p[order][:-1], True])
    tp, predicted = cumulative_tp[ends], ends+1
    scores = 2*tp/(predicted+int(y.sum()))
    best = float(scores.max())
    return float(np.max(p[order][ends][np.abs(scores-best) <= tolerance]))


def temporal(y, p, ids, mondays) -> dict:
    y, p = checked(y,p)
    cohorts = []
    for monday in sorted(set(mondays)):
        positions = [i for i, value in enumerate(mondays) if value == monday]
        cohorts.append(dict(observation_time=monday, **metrics(y[positions], p[positions]),
                            top_decile=top_decile(y[positions],p[positions],[ids[i] for i in positions])))
    aps = [r["ap"] for r in cohorts if r["ap"] is not None]
    k, hits = sum(r["top_decile"]["k"] for r in cohorts), sum(r["top_decile"]["hits"] for r in cohorts)
    positives = int(y.sum())
    return dict(by_monday=cohorts, median_ap=float(np.median(aps)) if aps else None,
                min_ap=min(aps) if aps else None, max_ap=max(aps) if aps else None,
                single_class_periods=[r["observation_time"] for r in cohorts if r["roc_auc"] is None],
                top_decile=dict(scope="within each Monday; aggregate hits/selected/positives", k=k, hits=hits,
                                precision=hits/k, recall=hits/positives if positives else None,
                                lift=(hits/k)/float(y.mean()) if positives else None))


def reliability(y, p) -> dict:
    y, p = checked(y,p)
    bins = np.minimum((p*10).astype(int),9)
    rows = []
    for b in range(10):
        mask = bins == b
        rows.append(dict(lower=b/10, upper=(b+1)/10, rows=int(mask.sum()),
                         mean_prediction=float(p[mask].mean()) if mask.any() else None,
                         observed_fraction=float(y[mask].mean()) if mask.any() else None))
    distributions = {}
    for label in (0,1):
        values = p[y==label]
        distributions[str(label)] = dict(rows=len(values),
            quantiles=dict(zip(("min","p10","median","p90","max"),map(float,np.quantile(values,[0,.1,.5,.9,1])))) if len(values) else None,
            histogram=np.histogram(values,bins=np.linspace(0,1,11))[0].tolist())
    return dict(method="none; native probabilities", bin_policy="10 fixed-width bins; last includes 1", bins=rows,
                probability_by_actual_label=distributions)


def customer_diagnostics(split, p, threshold) -> dict:
    counts = Counter(split.customers)
    groups = {}
    for name, repeated in (("one_snapshot",False),("multiple_snapshots",True)):
        mask = np.asarray([(counts[c]>1)==repeated for c in split.customers])
        groups[name] = metrics(split.y[mask],p[mask],threshold) if mask.any() else {"rows":0,"reason":"empty subgroup"}
    return dict(scope="snapshot counts within this split only; diagnostics never affect selection",
                distinct_customers=len(counts), snapshots_per_customer_histogram=dict(sorted(Counter(counts.values()).items())),
                groups=groups)

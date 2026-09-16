"""Deterministic order-invariant molecular pair feature generation."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Sequence

import numpy as np


class FeatureKind(str, Enum):
    SPARSE_AND_XOR = "sparse_morgan_and_xor"
    CHUNKED_AND_XOR = "chunked_morgan_and_xor"


@dataclass(frozen=True, slots=True)
class PairFeatureSpec:
    kind: FeatureKind
    fingerprint_bits: int = 2048
    chunk_size: int = 32

    def validate(self) -> None:
        if self.fingerprint_bits < 1:
            raise ValueError("fingerprint_bits must be positive")
        if self.chunk_size < 1 or self.fingerprint_bits % self.chunk_size:
            raise ValueError("chunk_size must divide fingerprint_bits exactly")

    @property
    def feature_count(self) -> int:
        if self.kind is FeatureKind.SPARSE_AND_XOR:
            return 2 * self.fingerprint_bits
        return 2 * (self.fingerprint_bits // self.chunk_size) + 6


def _validate_inputs(
    fingerprints: np.ndarray,
    left_indices: Sequence[int] | np.ndarray,
    right_indices: Sequence[int] | np.ndarray,
    spec: PairFeatureSpec,
) -> tuple[np.ndarray, np.ndarray]:
    spec.validate()
    if fingerprints.ndim != 2 or fingerprints.shape[1] != spec.fingerprint_bits:
        raise ValueError(
            f"Expected fingerprints with shape (n, {spec.fingerprint_bits}), got {fingerprints.shape}"
        )
    if fingerprints.dtype != np.uint8:
        raise ValueError("Fingerprints must use uint8 storage")
    left = np.asarray(left_indices, dtype=np.int64)
    right = np.asarray(right_indices, dtype=np.int64)
    if left.ndim != 1 or right.ndim != 1 or left.shape != right.shape:
        raise ValueError("Pair index arrays must be one-dimensional and equal length")
    if left.size and (
        left.min() < 0
        or right.min() < 0
        or left.max() >= len(fingerprints)
        or right.max() >= len(fingerprints)
    ):
        raise IndexError("Pair index refers to a fingerprint outside the matrix")
    return left, right


def build_pair_features(
    fingerprints: np.ndarray,
    left_indices: Sequence[int] | np.ndarray,
    right_indices: Sequence[int] | np.ndarray,
    spec: PairFeatureSpec,
    *,
    batch_size: int = 8192,
):
    """Create symmetric features from Morgan bits.

    Sparse features concatenate bitwise intersection and symmetric difference.
    Compact features aggregate the same two operations into fixed contiguous
    bit chunks and append six global symmetric similarity/count descriptors.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    left, right = _validate_inputs(fingerprints, left_indices, right_indices, spec)
    if spec.kind is FeatureKind.SPARSE_AND_XOR:
        from scipy import sparse

        blocks = []
        for start in range(0, len(left), batch_size):
            stop = min(start + batch_size, len(left))
            first = fingerprints[left[start:stop]]
            second = fingerprints[right[start:stop]]
            dense = np.concatenate(
                (np.bitwise_and(first, second), np.bitwise_xor(first, second)), axis=1
            )
            blocks.append(sparse.csr_matrix(dense, dtype=np.float32))
        if not blocks:
            return sparse.csr_matrix((0, spec.feature_count), dtype=np.float32)
        return sparse.vstack(blocks, format="csr", dtype=np.float32)

    output = np.empty((len(left), spec.feature_count), dtype=np.float32)
    chunk_count = spec.fingerprint_bits // spec.chunk_size
    for start in range(0, len(left), batch_size):
        stop = min(start + batch_size, len(left))
        first = fingerprints[left[start:stop]]
        second = fingerprints[right[start:stop]]
        intersection = np.bitwise_and(first, second)
        difference = np.bitwise_xor(first, second)
        intersection_chunks = intersection.reshape(
            -1, chunk_count, spec.chunk_size
        ).sum(axis=2, dtype=np.uint16)
        difference_chunks = difference.reshape(
            -1, chunk_count, spec.chunk_size
        ).sum(axis=2, dtype=np.uint16)
        first_count = first.sum(axis=1, dtype=np.uint16)
        second_count = second.sum(axis=1, dtype=np.uint16)
        intersection_count = intersection.sum(axis=1, dtype=np.uint16)
        difference_count = difference.sum(axis=1, dtype=np.uint16)
        union_count = intersection_count.astype(np.float32) + difference_count
        tanimoto = np.divide(
            intersection_count,
            union_count,
            out=np.zeros(len(first), dtype=np.float32),
            where=union_count != 0,
        )
        dice_denominator = 2 * intersection_count.astype(np.float32) + difference_count
        dice = np.divide(
            2 * intersection_count,
            dice_denominator,
            out=np.zeros(len(first), dtype=np.float32),
            where=dice_denominator != 0,
        )
        output[start:stop] = np.column_stack(
            (
                intersection_chunks,
                difference_chunks,
                np.minimum(first_count, second_count),
                np.maximum(first_count, second_count),
                intersection_count,
                difference_count,
                tanimoto,
                dice,
            )
        )
    return output


def feature_names(spec: PairFeatureSpec) -> tuple[str, ...]:
    spec.validate()
    if spec.kind is FeatureKind.SPARSE_AND_XOR:
        return tuple(
            [f"morgan_intersection_bit_{index}" for index in range(spec.fingerprint_bits)]
            + [f"morgan_xor_bit_{index}" for index in range(spec.fingerprint_bits)]
        )
    chunk_count = spec.fingerprint_bits // spec.chunk_size
    return tuple(
        [f"morgan_intersection_chunk_{index}" for index in range(chunk_count)]
        + [f"morgan_xor_chunk_{index}" for index in range(chunk_count)]
        + [
            "morgan_bit_count_min",
            "morgan_bit_count_max",
            "morgan_intersection_count",
            "morgan_xor_count",
            "morgan_tanimoto",
            "morgan_dice",
        ]
    )

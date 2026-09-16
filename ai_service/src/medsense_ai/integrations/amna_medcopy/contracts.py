"""Strict contracts for authoritative amnaMedcopy Product model records."""

from __future__ import annotations

from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    field_validator,
)

from medsense_ai.product_mapping import PakistanMedicineProduct


PartnerProductText = Annotated[StrictStr, Field(max_length=255)]


class PartnerProductRecord(BaseModel):
    """Relevant fields from one authoritative Sequelize ``Product`` row.

    This is deliberately not the public storefront response contract. Nullable
    source strings remain nullable or blank here so the adapter can fail closed
    without rewriting the source record.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    product_id: Annotated[StrictInt, Field(gt=0)]
    product_title: PartnerProductText | None
    product_generic_name: PartnerProductText | None
    product_salt: PartnerProductText | None
    product_requires_rx: StrictBool | None
    product_status: StrictInt

    @field_validator("product_status")
    @classmethod
    def validate_product_status(cls, value: int) -> int:
        if value not in (0, 1):
            raise ValueError("product_status must be 0 or 1")
        return value


class PartnerProductProvenance(BaseModel):
    """Caller-supplied, truthful snapshot/release context for a Product row."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    source_release_identifier: str = Field(min_length=1, max_length=255)
    source_record_checksum: str | None = Field(
        default=None,
        min_length=1,
        max_length=255,
    )


class PartnerProductAdaptation(BaseModel):
    """Source-preserving result and its existing MedSense product contract."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    source_record: PartnerProductRecord
    mapped_product: PakistanMedicineProduct

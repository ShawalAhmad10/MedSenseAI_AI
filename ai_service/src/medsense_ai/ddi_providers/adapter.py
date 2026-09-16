"""Reusable, vendor-neutral mechanics for future authorized DDI adapters."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Iterable
from datetime import datetime, timezone

from pydantic import ValidationError

from medsense_ai.ddi_providers.contracts import (
    CanonicalIngredientReference,
    ProviderAdapterError,
    ProviderBatchLookupRequest,
    ProviderBatchLookupResult,
    ProviderFailure,
    ProviderFailureCategory,
    ProviderHealth,
    ProviderIngredientMapping,
    ProviderLookupStatus,
    ProviderMetadata,
    ProviderPairLookupRequest,
    ProviderPairLookupResult,
    ProviderReadinessStatus,
)
from medsense_ai.ddi_providers.governance import ProviderAdapterConfig

logger = logging.getLogger(__name__)


class BaseDDIProviderAdapter(ABC):
    """Validate common adapter boundaries without assuming a vendor schema."""

    def __init__(self, config: ProviderAdapterConfig, metadata: ProviderMetadata) -> None:
        self._config = config
        self._metadata = metadata
        self._validate_configuration()

    @property
    def config(self) -> ProviderAdapterConfig:
        return self._config

    @property
    def metadata(self) -> ProviderMetadata:
        return self._metadata

    def health(self) -> ProviderHealth:
        """Return validated readiness while sanitizing adapter exceptions."""

        if not self.config.enabled:
            return ProviderHealth(
                metadata=self.metadata,
                readiness=ProviderReadinessStatus.NOT_READY,
                checked_at=datetime.now(timezone.utc),
                detail="provider adapter is disabled",
            )
        try:
            health = self._health()
        except ProviderAdapterError as exc:
            logger.warning(
                "DDI provider health failure provider=%s category=%s",
                self.metadata.provider_namespace,
                exc.failure.category.value,
            )
            return self._failed_health(exc.failure)
        except ValidationError:
            logger.error(
                "Malformed DDI provider health response provider=%s",
                self.metadata.provider_namespace,
            )
            return self._failed_health(
                ProviderFailure(
                    category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                    message="provider health response failed contract validation",
                    retryable=False,
                )
            )
        except Exception as exc:
            logger.error(
                "Unexpected DDI provider health failure provider=%s exception_type=%s",
                self.metadata.provider_namespace,
                type(exc).__name__,
            )
            return self._failed_health(
                ProviderFailure(
                    category=ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR,
                    message="unexpected provider health failure",
                    retryable=False,
                )
            )
        if not isinstance(health, ProviderHealth) or health.metadata != self.metadata:
            logger.error(
                "Mismatched DDI provider health response provider=%s",
                self.metadata.provider_namespace,
            )
            return self._failed_health(
                ProviderFailure(
                    category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                    message="provider health provenance does not match adapter metadata",
                    retryable=False,
                )
            )
        return health

    def map_ingredient(
        self, ingredient: CanonicalIngredientReference
    ) -> ProviderIngredientMapping:
        """Return a mapping only when identity and provider provenance match."""

        self._require_enabled()
        mapping = self._map_ingredient(ingredient)
        if not isinstance(mapping, ProviderIngredientMapping):
            raise ProviderAdapterError(
                ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                "provider adapter returned an invalid mapping type",
                retryable=False,
            )
        metadata = self.metadata
        if (
            mapping.ingredient != ingredient
            or mapping.provider_name != metadata.provider_name
            or mapping.provider_namespace != metadata.provider_namespace
            or mapping.provider_version != metadata.provider_version
            or mapping.provider_release_identifier != metadata.release_identifier
        ):
            raise ProviderAdapterError(
                ProviderFailureCategory.MAPPING_FAILURE,
                "provider mapping provenance does not match adapter metadata and input",
                retryable=False,
            )
        return mapping

    def lookup_pair(self, request: ProviderPairLookupRequest) -> ProviderPairLookupResult:
        """Return a validated, correctly correlated provider-neutral pair result."""

        self._require_enabled()
        self._require_release(request)
        result = self._lookup_pair(request)
        if not isinstance(result, ProviderPairLookupResult):
            raise ProviderAdapterError(
                ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                "provider adapter returned an invalid result type",
                retryable=False,
            )
        if result.request != request or result.provider_metadata != self.metadata:
            raise ProviderAdapterError(
                ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                "provider result provenance does not match request and adapter metadata",
                retryable=False,
            )
        return result

    def lookup_pairs(self, request: ProviderBatchLookupRequest) -> ProviderBatchLookupResult:
        """Correlate raw per-pair results deterministically by request identifier."""

        self._require_enabled()
        if not self.metadata.capabilities.batch_lookup:
            raise ProviderAdapterError(
                ProviderFailureCategory.UNSUPPORTED_OPERATION,
                "provider does not declare batch lookup capability",
                retryable=False,
            )
        for pair_request in request.requests:
            self._require_release(pair_request)
        return correlate_batch_results(self.metadata, request, self._lookup_pairs(request))

    @abstractmethod
    def _health(self) -> ProviderHealth:
        """Perform the provider-specific readiness check."""

    @abstractmethod
    def _map_ingredient(
        self, ingredient: CanonicalIngredientReference
    ) -> ProviderIngredientMapping:
        """Perform provider-specific deterministic identity mapping."""

    @abstractmethod
    def _lookup_pair(self, request: ProviderPairLookupRequest) -> ProviderPairLookupResult:
        """Translate one provider-specific response into the neutral DTO."""

    def _lookup_pairs(
        self, request: ProviderBatchLookupRequest
    ) -> Iterable[ProviderPairLookupResult]:
        raise ProviderAdapterError(
            ProviderFailureCategory.UNSUPPORTED_OPERATION,
            "provider adapter does not implement batch lookup",
            retryable=False,
        )

    def _validate_configuration(self) -> None:
        metadata = self.metadata
        config = self.config
        if config.provider_name != metadata.provider_name:
            raise ValueError("provider configuration name must match adapter metadata")
        if config.provider_namespace != metadata.provider_namespace:
            raise ValueError("provider configuration namespace must match adapter metadata")
        if (
            config.expected_provider_version is not None
            and config.expected_provider_version != metadata.provider_version
        ):
            raise ValueError("configured provider version must match adapter metadata")
        if (
            config.expected_release_identifier is not None
            and config.expected_release_identifier != metadata.release_identifier
        ):
            raise ValueError("configured provider release must match adapter metadata")

    def _require_enabled(self) -> None:
        if not self.config.enabled:
            raise ProviderAdapterError(
                ProviderFailureCategory.UNSUPPORTED_OPERATION,
                "provider adapter is disabled",
                retryable=False,
            )

    def _require_release(self, request: ProviderPairLookupRequest) -> None:
        if (
            request.required_provider_release_identifier is not None
            and request.required_provider_release_identifier
            != self.metadata.release_identifier
        ):
            raise ProviderAdapterError(
                ProviderFailureCategory.VERSION_MISMATCH,
                "configured provider release does not match the required release",
                retryable=False,
            )

    def _failed_health(self, failure: ProviderFailure) -> ProviderHealth:
        return ProviderHealth(
            metadata=self.metadata,
            readiness=ProviderReadinessStatus.UNAVAILABLE,
            checked_at=datetime.now(timezone.utc),
            failure=failure,
        )


def correlate_batch_results(
    metadata: ProviderMetadata,
    request: ProviderBatchLookupRequest,
    results: Iterable[ProviderPairLookupResult],
) -> ProviderBatchLookupResult:
    """Order results by request ID and fail only missing/mismatched pairs closed."""

    requested_by_id = {item.request_identifier: item for item in request.requests}
    received_by_id: dict[str, ProviderPairLookupResult] = {}
    for result in results:
        if not isinstance(result, ProviderPairLookupResult):
            raise ProviderAdapterError(
                ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                "batch provider adapter returned an invalid pair result type",
                retryable=False,
            )
        identifier = result.request.request_identifier
        if identifier not in requested_by_id or identifier in received_by_id:
            raise ProviderAdapterError(
                ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                "batch provider response contains an unknown or duplicate request identifier",
                retryable=False,
            )
        received_by_id[identifier] = result

    ordered: list[ProviderPairLookupResult] = []
    for requested_pair in request.requests:
        result = received_by_id.get(requested_pair.request_identifier)
        if (
            result is None
            or result.request != requested_pair
            or result.provider_metadata != metadata
        ):
            failure = ProviderFailure(
                category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
                message="batch provider response is missing or mismatched for requested pair",
                retryable=False,
            )
            result = _pair_failure_result(metadata, requested_pair, failure)
        ordered.append(result)
    return ProviderBatchLookupResult(
        provider_metadata=metadata,
        request=request,
        results=tuple(ordered),
    )


def lookup_batch_fail_closed(
    provider: object,
    request: ProviderBatchLookupRequest,
) -> ProviderBatchLookupResult:
    """Translate batch-level adapter failures into one failure per requested pair."""

    metadata = getattr(provider, "metadata", None)
    if not isinstance(metadata, ProviderMetadata):
        raise TypeError("batch provider must expose validated provider metadata")
    if not metadata.capabilities.batch_lookup or not hasattr(provider, "lookup_pairs"):
        failure = ProviderFailure(
            category=ProviderFailureCategory.UNSUPPORTED_OPERATION,
            message="provider does not declare batch lookup capability",
            retryable=False,
        )
        logger.error(
            "DDI provider lacks batch lookup capability provider=%s pair_count=%s",
            metadata.provider_namespace,
            len(request.requests),
        )
        return _batch_failure_result(metadata, request, failure)
    if any(
        item.required_provider_release_identifier is not None
        and item.required_provider_release_identifier != metadata.release_identifier
        for item in request.requests
    ):
        failure = ProviderFailure(
            category=ProviderFailureCategory.VERSION_MISMATCH,
            message="configured provider release does not match a required batch release",
            retryable=False,
        )
        logger.error(
            "DDI provider batch release mismatch provider=%s pair_count=%s",
            metadata.provider_namespace,
            len(request.requests),
        )
        return _batch_failure_result(metadata, request, failure)
    try:
        result = provider.lookup_pairs(request)
    except ProviderAdapterError as exc:
        logger.warning(
            "DDI provider batch failure provider=%s category=%s pair_count=%s",
            metadata.provider_namespace,
            exc.failure.category.value,
            len(request.requests),
        )
        return _batch_failure_result(metadata, request, exc.failure)
    except ValidationError:
        logger.error(
            "Malformed DDI provider batch response provider=%s pair_count=%s",
            metadata.provider_namespace,
            len(request.requests),
        )
        failure = ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider batch response failed contract validation",
            retryable=False,
        )
        return _batch_failure_result(metadata, request, failure)
    except Exception as exc:
        logger.error(
            "Unexpected DDI provider batch failure provider=%s exception_type=%s pair_count=%s",
            metadata.provider_namespace,
            type(exc).__name__,
            len(request.requests),
        )
        failure = ProviderFailure(
            category=ProviderFailureCategory.UNEXPECTED_PROVIDER_ERROR,
            message="unexpected provider batch failure",
            retryable=False,
        )
        return _batch_failure_result(metadata, request, failure)
    if (
        not isinstance(result, ProviderBatchLookupResult)
        or result.request != request
        or result.provider_metadata != metadata
    ):
        failure = ProviderFailure(
            category=ProviderFailureCategory.MALFORMED_PROVIDER_RESPONSE,
            message="provider batch result provenance does not match request and metadata",
            retryable=False,
        )
        return _batch_failure_result(metadata, request, failure)
    return result


def _batch_failure_result(
    metadata: ProviderMetadata,
    request: ProviderBatchLookupRequest,
    failure: ProviderFailure,
) -> ProviderBatchLookupResult:
    return ProviderBatchLookupResult(
        provider_metadata=metadata,
        request=request,
        results=tuple(
            _pair_failure_result(metadata, pair_request, failure)
            for pair_request in request.requests
        ),
    )


def _pair_failure_result(
    metadata: ProviderMetadata,
    request: ProviderPairLookupRequest,
    failure: ProviderFailure,
) -> ProviderPairLookupResult:
    unavailable = {
        ProviderFailureCategory.TIMEOUT,
        ProviderFailureCategory.RATE_LIMIT,
        ProviderFailureCategory.PROVIDER_MAINTENANCE_OR_UNAVAILABLE,
    }
    return ProviderPairLookupResult(
        status=(
            ProviderLookupStatus.PROVIDER_UNAVAILABLE
            if failure.category in unavailable
            else ProviderLookupStatus.PROVIDER_ERROR
        ),
        request=request,
        provider_metadata=metadata,
        failure=failure,
        completed_at=datetime.now(timezone.utc),
    )

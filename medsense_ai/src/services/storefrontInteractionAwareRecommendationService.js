import axios from 'axios';

import {
  mapRecommendationProduct,
} from './storefrontRecommendationService';

const API_URL =
  '/api/recommendations';

function normalizeProductId(
  value
) {
  const raw =
    value?.product_id ??
    value?.productId ??
    value?.id ??
    value;

  const cleaned =
    typeof raw === 'string'
      ? raw.replace(/^prod-/, '')
      : raw;

  const parsed =
    Number(cleaned);

  return (
    Number.isSafeInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : null;
}

function mapInteractionCandidate(
  product
) {
  const mapped =
    mapRecommendationProduct(
      product
    );

  return {
    ...mapped,

    badge:
      'Governed DDI-rechecked candidate',

    description:
      'Pharmacy-governed candidate that cleared the authoritative DDI re-check for the current cart. This does not establish therapeutic equivalence or clinical substitutability.',

    recommendationBasis:
      product?.recommendation_basis ||
      'GOVERNED_MAPPING_DDI_RECHECK',

    governance:
      product?.governance ||
      null,

    ddiRecheck:
      product?.ddi_recheck ||
      null,
  };
}

export async function getInteractionAwareRecommendations(
  sourceProductId,
  cartItems,
  limit = 5
) {
  const sourceId =
    normalizeProductId(
      sourceProductId
    );

  if (!sourceId) {
    throw new Error(
      'A valid source medicine is required.'
    );
  }

  const cartProductIds =
    [
      ...new Set(
        (cartItems || [])
          .map(
            normalizeProductId
          )
          .filter(Boolean)
      ),
    ];

  if (
    cartProductIds.length < 2
  ) {
    throw new Error(
      'At least two cart medicines are required for interaction-aware alternatives.'
    );
  }

  try {
    const response =
      await axios.post(
        `${API_URL}/products/${sourceId}/interaction-aware`,
        {
          cart_product_ids:
            cartProductIds,

          limit,
        },
        {
          timeout:
            15000,
        }
      );

    const data =
      response.data?.data;

    if (
      !data ||
      typeof data.status !==
        'string' ||
      !Array.isArray(
        data.recommendations
      )
    ) {
      throw new Error(
        'Interaction-aware recommendation service returned an invalid response.'
      );
    }

    return {
      ...data,

      recommendations:
        data.recommendations.map(
          mapInteractionCandidate
        ),
    };
  } catch (error) {
    if (
      error?.message ===
      'Interaction-aware recommendation service returned an invalid response.'
    ) {
      throw error;
    }

    throw new Error(
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      'Could not check governed interaction-aware alternatives.'
    );
  }
}

export {
  normalizeProductId,
  mapInteractionCandidate,
};
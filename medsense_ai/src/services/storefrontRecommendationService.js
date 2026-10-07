import axios from 'axios';
import { getCategorySlug } from '../constants/categories.js';

const API_URL =
  '/api/recommendations';

const CUSTOMER_AUTH_KEY =
  'medsense_customer_auth';

function positiveProductId(value) {
  const direct =
    Number(value);

  if (
    Number.isSafeInteger(direct) &&
    direct > 0
  ) {
    return direct;
  }

  const match =
    String(value || '')
      .match(/(\d+)$/);

  const parsed =
    match
      ? Number(match[1])
      : NaN;

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      'A valid medicine product identifier is required.'
    );
  }

  return parsed;
}

function positivePrescriptionId(value) {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      'A valid prescription identifier is required.'
    );
  }

  return parsed;
}

function getCustomerToken() {
  try {
    const raw =
      sessionStorage.getItem(
        CUSTOMER_AUTH_KEY
      ) ||
      localStorage.getItem(
        CUSTOMER_AUTH_KEY
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw);

    return parsed?.token || null;
  } catch {
    return null;
  }
}

function requireCustomerToken() {
  const token =
    getCustomerToken();

  if (!token) {
    throw new Error(
      'Please sign in to view prescription recommendations.'
    );
  }

  return token;
}

function apiError(
  error,
  fallback
) {
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  );
}

function slugForTitle(value) {
  return String(
    value || 'medicine'
  )
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(
      /[^a-z0-9-]/g,
      ''
    );
}

function mapRecommendationProduct(
  product
) {
  const stockQty =
    Number(
      product?.available_stock || 0
    );

  const price =
    Number(
      product?.product_price || 0
    );

  const discount =
    Number(
      product?.product_discount || 0
    );

  const title =
    String(
      product?.product_title ||
      'Medicine'
    );

  const generic =
    product?.product_generic_name ||
    null;

  const salt =
    product?.product_salt ||
    null;

  return {
    id:
      Number(
        product?.product_id
      ),

    slug:
      slugForTitle(title),

    name:
      title,

    subtitle:
      generic ||
      salt ||
      'Catalogue medicine',

    category:
      product?.product_category ||
      'Medicine',

    categorySlug:
      getCategorySlug(
        product?.product_category ||
        'medicine'
      ),

    price,

    oldPrice:
      discount > 0 &&
      discount < 100
        ? Math.round(
            price /
            (
              1 -
              discount / 100
            )
          )
        : null,

    discountPercent:
      discount,

    requiresPrescription:
      product?.product_requires_rx ===
      true,

    inStock:
      stockQty > 0,

    stockQty,

    stockLabel:
      stockQty > 0
        ? 'In stock'
        : 'Out of stock',

    badge:
      'Same ingredient',

    imageLabel:
      title
        .substring(0, 4)
        .toUpperCase(),

    description:
      salt
        ? `Catalogue match for recorded ingredient: ${salt}.`
        : generic
          ? `Catalogue match for recorded generic: ${generic}.`
          : 'Catalogue medicine recommendation.',

    usage:
      'Follow the prescribed instructions and confirm any substitution with a pharmacist or prescriber.',

    sideEffects:
      'Review the package information and consult a healthcare professional for medicine-specific adverse effects.',

    interactions:
      'Cart changes remain subject to the MedSenseAI interaction check before checkout.',

    strengths: [
      salt ||
      generic ||
      'Not specified',
    ],

    tags: [
      'Catalogue matched',
    ],

    warningLevel:
      product?.product_requires_rx ===
      true
        ? 'high'
        : 'low',

    genericName:
      generic,

    salt,

    recommendationBasis:
      product?.recommendation_basis ||
      null,
  };
}

function normalizeResult(data) {
  if (
    !data ||
    typeof data !== 'object'
  ) {
    throw new Error(
      'Recommendation service returned an invalid response.'
    );
  }

  const recommendations =
    Array.isArray(
      data.recommendations
    )
      ? data.recommendations.map(
          mapRecommendationProduct
        )
      : [];

  const groups =
    Array.isArray(data.groups)
      ? data.groups.map(
          (group) => ({
            ...group,

            recommendations:
              Array.isArray(
                group?.recommendations
              )
                ? group.recommendations.map(
                    mapRecommendationProduct
                  )
                : [],
          })
        )
      : [];

  return {
    ...data,
    recommendations,
    groups,
  };
}

export async function getProductRecommendations(
  productId
) {
  const id =
    positiveProductId(
      productId
    );

  try {
    const response =
      await axios.get(
        `${API_URL}/products/${id}`,
        {
          timeout:
            15000,
        }
      );

    return normalizeResult(
      response.data?.data
    );
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not load medicine recommendations.'
      )
    );
  }
}

export async function validateSameSaltAlternativeSelection(
  sourceProductId,
  alternativeProductId,
  cartItems
) {
  const sourceId =
    positiveProductId(sourceProductId);
  const alternativeId =
    positiveProductId(alternativeProductId);

  const normalizedCart =
    (cartItems || []).map((item) => ({
      product_id:
        positiveProductId(
          item?.id ?? item?.product_id
        ),
      quantity:
        Math.max(1, Number(item?.quantity) || 1),
    }));

  try {
    const response = await axios.post(
      `${API_URL}/products/${sourceId}/select`,
      {
        alternative_product_id:
          alternativeId,
        cart_items:
          normalizedCart,
      },
      {
        timeout: 20000,
      }
    );
    const data = response.data?.data;

    if (
      !data ||
      data.status !==
        'ALTERNATIVE_SELECTION_VALIDATED' ||
      !data.selected_alternative ||
      !Array.isArray(data.final_cart) ||
      !data.ddi
    ) {
      throw new Error(
        'Alternative selection service returned an invalid response.'
      );
    }

    return {
      ...data,
      selectedAlternative:
        mapRecommendationProduct(
          data.selected_alternative
        ),
    };
  } catch (error) {
    if (
      error?.message ===
      'Alternative selection service returned an invalid response.'
    ) {
      throw error;
    }

    throw new Error(
      apiError(
        error,
        'Could not validate the selected same-salt alternative.'
      )
    );
  }
}

export async function getPrescriptionRecommendations(
  prescriptionId
) {
  const id =
    positivePrescriptionId(
      prescriptionId
    );

  const token =
    requireCustomerToken();

  try {
    const response =
      await axios.get(
        `${API_URL}/prescriptions/${id}`,
        {
          timeout:
            15000,

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    return normalizeResult(
      response.data?.data
    );
  } catch (error) {
    throw new Error(
      apiError(
        error,
        'Could not load prescription recommendations.'
      )
    );
  }
}

export {
  mapRecommendationProduct,
  positiveProductId,
};

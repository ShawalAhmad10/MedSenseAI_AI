import axios from 'axios';

const API_URL = '/api/prescriptions';
const CUSTOMER_AUTH_KEY = 'medsense_customer_auth';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function getCustomerToken() {
  try {
    const raw =
      sessionStorage.getItem(CUSTOMER_AUTH_KEY) ||
      localStorage.getItem(CUSTOMER_AUTH_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed?.token || null;
  } catch {
    return null;
  }
}

function requireCustomerToken() {
  const token = getCustomerToken();

  if (!token) {
    throw new Error(
      'Please sign in before using prescription OCR.'
    );
  }

  return token;
}

function resolveMediaType(file) {
  const type =
    String(file?.type || '')
      .trim()
      .toLowerCase();

  if (type === 'image/png') {
    return 'image/png';
  }

  if (
    type === 'image/jpeg' ||
    type === 'image/jpg'
  ) {
    return 'image/jpeg';
  }

  const name =
    String(file?.name || '')
      .toLowerCase();

  if (name.endsWith('.png')) {
    return 'image/png';
  }

  if (
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  ) {
    return 'image/jpeg';
  }

  return null;
}

function validateImage(file) {
  if (!file) {
    throw new Error(
      'Choose a prescription image first.'
    );
  }

  const mediaType =
    resolveMediaType(file);

  if (!mediaType) {
    throw new Error(
      'Only PNG, JPG, and JPEG prescription images are supported.'
    );
  }

  if (
    !Number.isFinite(file.size) ||
    file.size <= 0
  ) {
    throw new Error(
      'The selected prescription image is empty.'
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      'Prescription image must not exceed 5 MB.'
    );
  }

  return mediaType;
}

function readFileAsBase64(file) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        const result =
          String(reader.result || '');

        const commaIndex =
          result.indexOf(',');

        if (
          commaIndex < 0 ||
          commaIndex ===
            result.length - 1
        ) {
          reject(
            new Error(
              'Could not encode the prescription image.'
            )
          );

          return;
        }

        resolve(
          result.slice(
            commaIndex + 1
          )
        );
      };

      reader.onerror = () => {
        reject(
          new Error(
            'Could not read the prescription image.'
          )
        );
      };

      reader.readAsDataURL(file);
    }
  );
}

function errorMessage(
  error,
  fallback
) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.detail?.message ||
    error?.message ||
    fallback
  );
}

export async function analyzePrescriptionFile(
  file
) {
  const token =
    requireCustomerToken();

  const mediaType =
    validateImage(file);

  const imageBase64 =
    await readFileAsBase64(file);

  try {
    const response =
      await axios.post(
        `${API_URL}/analyze`,
        {
          original_filename:
            file.name || null,

          media_type:
            mediaType,

          image_base64:
            imageBase64,
        },
        {
          timeout:
            210000,

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      errorMessage(
        error,
        'Prescription OCR failed.'
      )
    );
  }
}

export async function confirmPrescription(
  prescriptionId,
  medicines
) {
  const token =
    requireCustomerToken();

  try {
    const response =
      await axios.patch(
        `${API_URL}/${prescriptionId}/confirm`,
        {
          medicines,
        },
        {
          timeout:
            30000,

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      errorMessage(
        error,
        'Could not save prescription confirmation.'
      )
    );
  }
}

export async function listPrescriptions() {
  const token =
    requireCustomerToken();

  try {
    const response =
      await axios.get(
        API_URL,
        {
          timeout:
            15000,

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    return Array.isArray(
      response.data?.data
    )
      ? response.data.data
      : [];
  } catch (error) {
    throw new Error(
      errorMessage(
        error,
        'Could not load prescription history.'
      )
    );
  }
}

export async function getPrescription(
  prescriptionId
) {
  const token =
    requireCustomerToken();

  try {
    const response =
      await axios.get(
        `${API_URL}/${prescriptionId}`,
        {
          timeout:
            15000,

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

    return response.data?.data;
  } catch (error) {
    throw new Error(
      errorMessage(
        error,
        'Could not load prescription details.'
      )
    );
  }
}

export {
  MAX_IMAGE_BYTES,
  resolveMediaType,
};

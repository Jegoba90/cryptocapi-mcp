/**
 * Códigos de error que la API devuelve **planos**, fuera de `message`, desde
 * `ApiError.structured()` (commit e21dc4c2 del repo de CryptoCapi).
 *
 * Copia de contrato: ver `./README.md`.
 */
import { z } from 'zod';

export const ApiErrorBodySchema = z
  .object({
    status: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
    /** Motor que la ruta exige, en un 403 `PRODUCT_NOT_INCLUDED`. */
    required_product: z.string().optional(),
    /** Motor que la key sí incluye. */
    your_product: z.string().optional(),
  })
  .loose();

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

/** Los códigos que el mapa de errores de §4.4 tiene que saber traducir. */
export const KNOWN_ERROR_CODES = {
  DEMO_COIN_RESTRICTED: 'DEMO_COIN_RESTRICTED',
  PRODUCT_NOT_INCLUDED: 'PRODUCT_NOT_INCLUDED',
} as const;

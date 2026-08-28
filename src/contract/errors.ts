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
    /** Motor que la ruta exige, en `PRODUCT_NOT_INCLUDED` y `PRODUCT_NOT_ACTIVE`. */
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
  /**
   * La key **sí compró** este motor y el pase dejó de estar activo: venció o se
   * degradó. Agregado el 2026-08-28 junto con la reja de tier de las rutas de
   * quant en el backend.
   *
   * Se traduce distinto de `PRODUCT_NOT_INCLUDED` a propósito. Los dos son 403 y
   * los dos frenan la herramienta, pero la salida del usuario es opuesta:
   * renovar lo que ya tiene, o comprar lo que nunca tuvo. Un agente que los
   * mezcla le dice a un cliente que pagó que nunca compró el motor.
   */
  PRODUCT_NOT_ACTIVE: 'PRODUCT_NOT_ACTIVE',
} as const;

/**
 * Códigos de error que la API devuelve **planos**, fuera de `message`, desde
 * `ApiError.structured()` (commit e21dc4c2 del repo de CryptoCapi).
 *
 * Copia de contrato: ver `./README.md`.
 */
import { z } from 'zod';

/**
 * Todos los campos son opcionales a propósito, incluidos `status` y `message`.
 *
 * Hasta la 0.2.3 esos dos eran obligatorios, y un cuerpo que no los trajera
 * exactamente así se descartaba ENTERO. Con él se iba el `code`, que es lo único
 * que el manifiesto manda mirar («branch on `code`, not on the prose»): un 403
 * con `code: PRODUCT_NOT_INCLUDED` terminaba llegándole al agente como un 403
 * pelado, que es justo lo que este paquete existe para evitar.
 *
 * El backend manda las cinco claves. Pero este paquete corre en la máquina de
 * terceros, `CRYPTOCAPI_API_BASE` lo apunta a donde quieran, y cualquier gateway
 * delante de la API puede reformatear el cuerpo. Ser tolerante al leer no cuesta
 * nada; perder el `code` cuesta el producto.
 */
export const ApiErrorBodySchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    /** Alias de `message`: la convención de los proxies que reescriben el cuerpo. */
    error: z.string().optional(),
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

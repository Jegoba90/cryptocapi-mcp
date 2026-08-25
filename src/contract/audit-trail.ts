/**
 * Copia de `shared/schemas/response.schema.ts` del repo de CryptoCapi.
 * Ver `./README.md` para por qué es copia y cuál es la deuda.
 *
 * El sello verificable que emiten los tres motores. Los tres `seal_type`
 * honestos cargan shapes distintos, así que sólo `protocol_hash` y
 * `calculated_at` son universales; el resto es opcional.
 */
import { z } from 'zod';

export const AuditTrailSchema = z
  .object({
    // Común a los tres sellos.
    protocol_hash: z.string(),
    calculated_at: z.string(),
    seal_type: z.enum(['reproducible', 'output_seal', 'process_seal']).optional(),
    algorithm_id: z.string().optional(),
    engine_version: z.string().optional(),
    // Quant Plus (`reproducible`) — trae el vector de entrada para recomputar.
    data_source: z
      .object({
        vendor: z.string(),
        symbol: z.string(),
        timeframe: z.string(),
      })
      .strict()
      .optional(),
    input_timestamps: z.array(z.string()).optional(),
    input_vector: z.array(z.number()).optional(),
    zscore_window_size: z.number().optional(),
    daily_change_pct: z.number().nullable().optional(),
    // Radar (`process_seal`) — certifica el pipeline determinista de 4 capas.
    filters_applied: z.array(z.string()).optional(),
    fields_overridden: z.array(z.string()).optional(),
    sentiment_override: z.boolean().optional(),
  })
  .strict();

export type AuditTrail = z.infer<typeof AuditTrailSchema>;

import type { Pool } from 'pg';

let identifierSequence = 0;
export function nextPaymentId(): string {
  identifierSequence += 1;
  return `payment-${String(identifierSequence).padStart(10, '0')}`;
}
export async function initDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS public.charges (
      id text PRIMARY KEY,
      order_id text NOT NULL,
      client_key text NOT NULL,
      provider_key text NOT NULL UNIQUE,
      amount integer NOT NULL CHECK (amount > 0)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS public.payment_attempts (
      id text PRIMARY KEY,
      order_id text NOT NULL,
      client_key text NOT NULL,
      amount integer NOT NULL CHECK (amount > 0),
      provider_key text NOT NULL
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS charges_order_id ON public.charges(order_id)');
    await client.query(
      'CREATE INDEX IF NOT EXISTS payment_attempts_client_key ON public.payment_attempts(client_key)',
    );
    const sequence = await client.query<{
      next: string;
    }>(`SELECT COALESCE(MAX(SUBSTRING(id FROM 9)::bigint), 0)::text AS next
      FROM public.payment_attempts WHERE id ~ '^payment-[0-9]+$'`);
    identifierSequence = Math.max(identifierSequence, Number(sequence.rows[0]!.next));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

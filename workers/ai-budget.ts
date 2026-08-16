export const AI_DAILY_BUDGET = 9_000
export const AI_BUDGET_WARNING_THRESHOLD = 1_800

interface StoredBudget {
  day: string
  used: number
  reservations: Record<string, { amount: number; expiresAt: number }>
}

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  transaction<T>(
    callback: (transaction: DurableObjectStorageLike) => Promise<T>,
  ): Promise<T>
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike
}

const storageKey = 'daily-budget'

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function nextUtcDay(date = new Date()) {
  const reset = new Date(date)
  reset.setUTCHours(24, 0, 0, 0)
  return reset.toISOString()
}

function freshBudget(): StoredBudget {
  return { day: utcDay(), used: 0, reservations: {} }
}

function normalizeBudget(value: StoredBudget | undefined) {
  if (value?.day !== utcDay()) return freshBudget()

  const now = Date.now()
  for (const [id, reservation] of Object.entries(value.reservations)) {
    if (reservation.expiresAt <= now) delete value.reservations[id]
  }
  return value
}

function reservedTotal(value: StoredBudget) {
  return Object.values(value.reservations).reduce(
    (total, reservation) => total + reservation.amount,
    0,
  )
}

function publicStatus(value: StoredBudget) {
  const reserved = reservedTotal(value)
  const consumed = value.used + reserved
  const remaining = Math.max(0, AI_DAILY_BUDGET - consumed)

  return {
    available: remaining > 0,
    level:
      remaining === 0
        ? 'exhausted'
        : remaining <= AI_BUDGET_WARNING_THRESHOLD
          ? 'low'
          : 'normal',
    limit: AI_DAILY_BUDGET,
    used: Math.ceil(value.used),
    reserved: Math.ceil(reserved),
    remaining: Math.floor(remaining),
    resetAt: nextUtcDay(),
  }
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export class AiDailyBudget {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/status') {
      const value = normalizeBudget(
        await this.state.storage.get<StoredBudget>(storageKey),
      )
      return json(publicStatus(value))
    }

    if (request.method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'GET, POST' },
      })
    }

    const payload = (await request.json().catch(() => undefined)) as
      | Record<string, unknown>
      | undefined

    if (url.pathname === '/reserve') {
      const amount = Number(payload?.amount)
      const reservationId =
        typeof payload?.reservationId === 'string' ? payload.reservationId : ''

      if (!reservationId || !Number.isFinite(amount) || amount <= 0) {
        return json({ error: 'Invalid reservation.' }, 400)
      }

      return this.state.storage.transaction(async (transaction) => {
        const value = normalizeBudget(
          await transaction.get<StoredBudget>(storageKey),
        )
        const status = publicStatus(value)
        if (amount > status.remaining) {
          return json({ ...status, available: false, level: 'exhausted' }, 429)
        }

        value.reservations[reservationId] = {
          amount,
          expiresAt: Date.now() + 15 * 60 * 1_000,
        }
        await transaction.put(storageKey, value)
        return json(publicStatus(value))
      })
    }

    if (url.pathname === '/settle' || url.pathname === '/release') {
      const reservationId =
        typeof payload?.reservationId === 'string' ? payload.reservationId : ''
      if (!reservationId) return json({ error: 'Invalid reservation.' }, 400)

      return this.state.storage.transaction(async (transaction) => {
        const value = normalizeBudget(
          await transaction.get<StoredBudget>(storageKey),
        )
        const reservation = value.reservations[reservationId]
        if (reservation !== undefined) {
          delete value.reservations[reservationId]
          if (url.pathname === '/settle') {
            const measured = Number(payload?.amount)
            value.used +=
              Number.isFinite(measured) && measured >= 0
                ? measured
                : reservation.amount
          }
          await transaction.put(storageKey, value)
        }
        return json(publicStatus(value))
      })
    }

    return new Response('Not Found', { status: 404 })
  }
}

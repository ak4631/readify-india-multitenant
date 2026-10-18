-- Apply separately before the following migration (Postgres enum commit rule).
ALTER TYPE admin."SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PENDING';

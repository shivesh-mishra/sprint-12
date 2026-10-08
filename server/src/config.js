import 'dotenv/config';

const bool = (v, d) => (v === undefined ? d : String(v).toLowerCase() === 'true');
const int = (v, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: int(process.env.PORT, 4000),
  isProd,
  clientOrigins: (process.env.CLIENT_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
  allowNoOrigin: bool(process.env.ALLOW_NO_ORIGIN, !isProd),
  trustProxy: int(process.env.TRUST_PROXY, 0),
  maxConnPerIp: int(process.env.MAX_CONN_PER_IP, 10),

  rooms: ['General', 'Tech Support', 'Random'],
  defaultRoom: 'General',
  usernameRegex: /^[A-Za-z0-9_-]{2,20}$/,
  maxMessageLength: 500,
};

import { defineApp } from 'convex/server';
import agent from '@convex-dev/agent/convex.config';
import actionCache from '@convex-dev/action-cache/convex.config';
import rateLimiter from '@convex-dev/rate-limiter/convex.config';

const app = defineApp();
app.use(agent);
app.use(actionCache);
app.use(rateLimiter);

export default app;
 
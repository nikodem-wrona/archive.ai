import { join } from 'path';

import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';

import storeRoute from './routes/store';

import pgVectorConfigPlugin from './plugins/pgvector';

const envOpts = {
  schema: {
    type: 'object',
    required: ['NODE_ENV', 'PORT', 'DATABASE_URL', 'OPENAI_API_KEY'],
    properties: {
      NODE_ENV: {
        type: 'string',
        default: 'development',
        enum: ['development', 'production', 'test'],
      },
      PORT: {
        type: 'number',
        default: '3001',
      },
      DATABASE_URL: {
        type: 'string',
      },
      OPENAI_API_KEY: {
        type: 'string',
      },
    },
  },
  dotenv: {
    path: [join(__dirname, '..', '.env.local'), join(__dirname, '..', '.env')],
  },
};

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT: number;
      DATABASE_URL: string;
      OPEN_AI_API_KEY: string;
    };
  }
}

const server = Fastify({
  logger: true,
});

const start = async () => {
  try {
    await server.register(fastifyEnv, envOpts);
    await server.register(pgVectorConfigPlugin);
    await server.register(storeRoute);

    server.listen(
      { port: server.config.PORT, host: '0.0.0.0' },
      function (err, address) {
        if (err) {
          server.log.error(err);
          process.exit(1);
        }
        server.log.info(`server listening on ${address}`);
      },
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

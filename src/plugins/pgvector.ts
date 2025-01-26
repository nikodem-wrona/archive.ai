import {
  DistanceStrategy,
  PGVectorStoreArgs,
} from '@langchain/community/vectorstores/pgvector';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import pg from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    pgVectorConfig: PGVectorStoreArgs;
  }
}

const pgVectorPlugin: FastifyPluginAsync = fp(async (server) => {
  const pgPool = new pg.Pool({
    connectionString: server.config.DATABASE_URL,
  });

  const config = {
    pool: pgPool,
    tableName: 'file_embedding_chunks',
    columns: {
      idColumnName: 'id',
      vectorColumnName: 'vector',
      contentColumnName: 'text',
      metadataColumnName: 'metadata',
    },
    distanceStrategy: 'cosine' as DistanceStrategy,
  };

  server.decorate('pgVectorConfig', config);
});

export default pgVectorPlugin;

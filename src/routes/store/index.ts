import { FastifyInstance } from 'fastify';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import {
  PGVectorStore,
  PGVectorStoreArgs,
} from '@langchain/community/vectorstores/pgvector';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { pull } from 'langchain/hub';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Annotation, StateGraph } from '@langchain/langgraph';

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-large',
});

const handleStore = async (pgVectorConfig: PGVectorStoreArgs) => {
  const loader = new CSVLoader('data/books.csv');
  const docs = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: DEFAULT_CHUNK_SIZE,
    chunkOverlap: DEFAULT_CHUNK_OVERLAP,
  });

  const splits = await splitter.splitDocuments(docs);

  const vectorStore = await PGVectorStore.initialize(
    embeddings,
    pgVectorConfig,
  );

  await vectorStore.addDocuments(splits);
};

const handleRetrieve = async (
  body: {
    question: string;
  },
  pgVectorConfig: PGVectorStoreArgs,
) => {
  const promptTemplate = await pull<ChatPromptTemplate>('rlm/rag-prompt');

  const InputStateAnnotation = Annotation.Root({
    question: Annotation<string>,
  });

  const StateAnnotation = Annotation.Root({
    question: Annotation<string>,
    context: Annotation<Document[]>,
    answer: Annotation<string>,
  });

  const vectorStore = await PGVectorStore.initialize(
    embeddings,
    pgVectorConfig,
  );

  const retrieve = async (state: typeof InputStateAnnotation.State) => {
    const retrievedDocs = await vectorStore.similaritySearch(state.question);
    return { context: retrievedDocs };
  };

  const generate = async (state: typeof StateAnnotation.State) => {
    const docsContent = state.context
      .map((doc) => (doc as any).pageContent)
      .join('\n');

    const messages = await promptTemplate.invoke({
      question: state.question,
      context: docsContent,
    });
    const response = await llm.invoke(messages);
    return { answer: response.content };
  };

  const graph = new StateGraph(StateAnnotation)
    .addNode('retrieve', retrieve)
    .addNode('generate', generate)
    .addEdge('__start__', 'retrieve')
    .addEdge('retrieve', 'generate')
    .addEdge('generate', '__end__')
    .compile();

  let inputs = { question: body.question };

  const result = await graph.invoke(inputs);

  return { answer: result.answer };
};

export default async function (server: FastifyInstance) {
  server.route({
    method: 'GET',
    url: '/store',
    handler: () => handleStore(server.pgVectorConfig),
  });

  server.route({
    method: 'POST',
    url: '/retrieve',
    schema: {
      body: {
        type: 'object',
        required: ['question'],
        properties: {
          question: { type: 'string' },
        },
      },
    },
    handler: (req) => handleRetrieve(req.body as any, server.pgVectorConfig),
  });
}
